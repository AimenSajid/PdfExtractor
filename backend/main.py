import base64
import binascii
from typing import Optional
from urllib.parse import quote
from fastapi import FastAPI, UploadFile, File, HTTPException, Depends, Response
from sqlalchemy.orm import Session
import crud
import models
from fastapi.middleware.cors import CORSMiddleware
import tempfile, os, asyncio, json, re
import PyPDF2
from config import GEMINI_API_KEY, GEMINI_MODEL, MAX_UPLOAD_BYTES, MAX_UPLOAD_MB
from openai import OpenAI
from schemas import (
    MAX_IMPORT_ITEMS,
    ExtractionImportItem,
    ExtractionOut,
    ExtractionResult,
    ExtractionUpdate,
    GoogleLoginRequest,
    UserOut,
)
from auth import (
    clear_session_cookie,
    create_session_token,
    get_current_user,
    get_current_user_optional,
    get_db,
    set_session_cookie,
    verify_google_token,
)

origins = [
    "http://localhost:5173",  # React dev server
    "http://127.0.0.1:5173",
]

app = FastAPI()

# allow_credentials is what lets the session cookie travel: the frontend and API
# are different origins, so a credentialed fetch is rejected without it.
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["*"],
)

# Schema is owned by Alembic ("alembic upgrade head"), not create_all --
# create_all silently skips columns added to existing tables, which is how
# the pdf_base64 column went missing.

client = OpenAI(
    api_key=GEMINI_API_KEY,
    base_url="https://generativelanguage.googleapis.com/v1beta/openai/"
)

@app.post("/api/auth/google", response_model=UserOut)
def google_login(
    payload: GoogleLoginRequest,
    response: Response,
    db: Session = Depends(get_db),
):
    """Exchange a Google ID token for our own session cookie."""
    claims = verify_google_token(payload.credential)
    user = crud.get_or_create_user(db, claims)
    set_session_cookie(response, create_session_token(user.id))
    return user

@app.post("/api/auth/logout")
def logout(response: Response):
    clear_session_cookie(response)
    return {"detail": "Logged out"}

@app.get("/api/auth/me", response_model=Optional[UserOut])
def read_current_user(user: Optional[models.User] = Depends(get_current_user_optional)):
    """Returns the signed-in user, or null for guests.

    Deliberately not a 401 for guests -- the frontend calls this on every page
    load to decide which mode to render, and a guest is a valid state, not an error.
    """
    return user

def extract_text_from_pdf(path: str) -> str:
    text_chunks = []
    with open(path, "rb") as f:
        reader = PyPDF2.PdfReader(f)
        for p in reader.pages:
            text = ""
            try:
                text = p.extract_text() or ""
            except Exception:
                pass
            if text:
                text_chunks.append(text)
    return "\n\n".join(text_chunks)
def call_model_chat(prompt: str) -> str:
    resp = client.chat.completions.create(
        model=GEMINI_MODEL,
        messages=[
            {"role": "system", "content": "You are a helpful assistant that extracts structured information from documents."},
            {"role": "user", "content": prompt}
        ],
        temperature=0.0,
        max_tokens=15000
    )
    return resp.choices[0].message.content.strip()

async def read_upload_capped(file: UploadFile) -> bytes:
    """Read an upload, aborting as soon as it exceeds MAX_UPLOAD_BYTES.

    Reading in chunks is the point: a bare `await file.read()` pulls the whole
    body into memory first, so checking the length afterwards would only notice
    the problem once the memory had already been spent.
    """
    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = await file.read(1024 * 1024)
        if not chunk:
            break
        total += len(chunk)
        if total > MAX_UPLOAD_BYTES:
            raise HTTPException(
                status_code=413,
                detail=f"PDF is larger than the {MAX_UPLOAD_MB} MB limit.",
            )
        chunks.append(chunk)
    return b"".join(chunks)

@app.post("/api/extract", response_model=ExtractionResult)
async def extract(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: Optional[models.User] = Depends(get_current_user_optional),
):
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Only PDFs are allowed")

    pdf_bytes = await read_upload_capped(file)
    if not pdf_bytes:
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")

    pdf_base64 = base64.b64encode(pdf_bytes).decode("utf-8")

    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
            tmp.write(pdf_bytes)
            tmp_path = tmp.name

        try:
            text = extract_text_from_pdf(tmp_path)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Could not read PDF: {e}")

        if not text.strip():
            raise HTTPException(status_code=400, detail="No extractable text found in PDF.")

        prompt = f"""You are a helpful assistant. Extract the following information from the text below **and return only valid JSON**, without any extra words, explanations, or markdown formatting.
The JSON must have exactly this structure:
{{
    "title": "",
    "authors": [],
    "year": "",
    "doi": "",
    "url": "",
    "abstract": "",
    "conclusion": ""
}}Text to extract from:{text[:30000]}"""
        try:
            loop = asyncio.get_event_loop()
            ai_resp = await loop.run_in_executor(None, lambda: call_model_chat(prompt))
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"AI request failed: {e}")
    finally:
        if tmp_path:
            os.unlink(tmp_path)

    parsed = {}
    try:
        ai_resp = re.sub(r"^```json\s*|```$", "", ai_resp.strip(), flags=re.MULTILINE)
        parsed = json.loads(ai_resp)
    except Exception:
        m = re.search(r"\{.*\}", ai_resp, flags=re.DOTALL)
        if m:
            try:
                parsed = json.loads(m.group(0))
            except:
                parsed = {}
        else:
            parsed = {}

    # Guests get the parsed result back but nothing is written to the database;
    # the frontend persists it to localStorage instead.
    if user is None:
        return {
            "id": None,
            "filename": file.filename,
            "title": parsed.get("title"),
            "authors": parsed.get("authors") or [],
            "year": parsed.get("year"),
            "doi": parsed.get("doi"),
            "url": parsed.get("url"),
            "abstract": parsed.get("abstract"),
            "conclusion": parsed.get("conclusion"),
        }

    return crud.create_extraction(
        db, file.filename, parsed, pdf_base64=pdf_base64, user_id=user.id
    )

@app.get("/api/extractions", response_model=list[ExtractionOut])
def list_extractions(
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    return crud.get_all_extractions(db, user_id=user.id)

@app.post(
    "/api/extractions/import",
    response_model=list[ExtractionOut],
    status_code=201,
)
def import_extractions(
    items: list[ExtractionImportItem],
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """Import documents a guest accumulated in localStorage into their account.

    Body is a bare JSON array of metadata objects. Declared before the
    /api/extractions/{extraction_id} routes so the literal "import" segment is
    never read as an id.

    The imported rows have no pdf_base64: a guest's uploads were parsed but
    never stored server-side, so the bytes do not exist. The extracted metadata
    is all there is to carry over, and the PDF endpoint 404s cleanly for those
    rows.

    This is deliberately not idempotent -- there is no stable client-side key to
    deduplicate on, so calling it twice imports twice. The frontend is expected
    to clear its local store once the import succeeds.
    """
    if not items:
        raise HTTPException(status_code=400, detail="No documents to import")

    if len(items) > MAX_IMPORT_ITEMS:
        # A 400 rather than a silent truncation: the caller must know that some
        # of its documents were not imported.
        raise HTTPException(
            status_code=400,
            detail=(
                f"Too many documents in one request "
                f"(got {len(items)}, limit {MAX_IMPORT_ITEMS})"
            ),
        )

    payload = []
    for item in items:
        data = item.model_dump()
        if not (data.get("filename") or "").strip():
            # ExtractionOut requires a non-null filename, so a record that lost
            # its name in localStorage would otherwise import fine and then blow
            # up during response serialisation. Fall back to the title.
            data["filename"] = (data.get("title") or "").strip() or "Untitled document"
        payload.append(data)

    return crud.create_extractions_bulk(db, payload, user_id=user.id)

@app.get("/api/extractions/{extraction_id}", response_model=ExtractionOut)
def get_extraction(
    extraction_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    extraction = crud.get_extraction(db, extraction_id, user_id=user.id)
    if not extraction:
        raise HTTPException(status_code=404, detail="Extraction not found")
    return extraction

def _content_disposition_inline(filename: Optional[str]) -> str:
    """Build an `inline` Content-Disposition value that is safe to put in a header.

    Header values are latin-1 encoded by Starlette, so a raw non-ASCII filename
    (e.g. "17476-Texto del articulo-81631.pdf" with an accented i) raises
    UnicodeEncodeError while sending the response. RFC 6266/5987 solves this:
    emit an ASCII-only `filename=` for old clients plus a percent-encoded
    `filename*=UTF-8''` that every current browser prefers.
    """
    name = (filename or "document.pdf").replace("\\", "_")
    # Keep the basename only; a stored path separator would otherwise leak
    # directory structure into the download name.
    name = name.rsplit("/", 1)[-1].strip() or "document.pdf"

    # ASCII fallback: drop anything unencodable and neutralise the characters
    # that would terminate or split the header value.
    ascii_name = name.encode("ascii", "ignore").decode("ascii")
    ascii_name = re.sub(r'[\\"\r\n]', "_", ascii_name).strip()
    if not ascii_name:
        ascii_name = "document.pdf"

    quoted = quote(name, safe="")
    return f"inline; filename=\"{ascii_name}\"; filename*=UTF-8''{quoted}"

@app.get("/api/extractions/{extraction_id}/pdf")
def get_extraction_pdf(
    extraction_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """Serve the stored PDF bytes for one of the caller's own extractions.

    Kept off ExtractionOut on purpose: the list/detail endpoints must stay small,
    so the PDF is fetched separately and only when something actually renders it.
    """
    row = crud.get_extraction_pdf(db, extraction_id, user_id=user.id)
    if row is None:
        raise HTTPException(status_code=404, detail="Extraction not found")

    filename, pdf_base64 = row
    if not pdf_base64:
        # Rows created before PDFs were persisted have no bytes to serve. This is
        # a normal, expected state, not a server error.
        raise HTTPException(
            status_code=404, detail="No PDF stored for this extraction"
        )

    try:
        pdf_bytes = base64.b64decode(pdf_base64, validate=False)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(
            status_code=500, detail="Stored PDF data is corrupt"
        ) from exc

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": _content_disposition_inline(filename),
            # The bytes never change for a given row, but they are per-user data.
            "Cache-Control": "private, max-age=0, must-revalidate",
        },
    )

@app.put("/api/extractions/{extraction_id}", response_model=ExtractionOut)
def update_extraction(
    extraction_id: int,
    update: ExtractionUpdate,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    updated_data = update.model_dump(exclude_unset=True)
    extraction = crud.update_extraction(db, extraction_id, updated_data, user_id=user.id)

    if not extraction:
        raise HTTPException(status_code=404, detail="Extraction not found")

    return extraction

@app.delete("/api/extractions/{extraction_id}")
def delete_extraction(
    extraction_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    delete_status = crud.delete_extraction(db, extraction_id, user_id=user.id)

    if not delete_status:
        raise HTTPException(status_code=404, detail="Extraction not found")

    return {"detail": "Deleted successfully"}
