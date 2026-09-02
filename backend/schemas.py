from pydantic import BaseModel, ConfigDict, field_validator
from typing import Any, Optional, List

class ExtractResponse(BaseModel):
    title: Optional[str]
    authors: Optional[List[str]] = []
    year: Optional[str]
    doi: Optional[str]
    url: Optional[str]
    abstract: Optional[str]
    conclusion: Optional[str]

    model_config = ConfigDict(from_attributes=True)

class FileListItem(BaseModel):
    id: int
    # Nullable: the DB column has no NOT NULL constraint, and a non-optional
    # annotation here turns any such row into a 500 during response validation
    # rather than simply rendering a blank name.
    filename: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

class FileDetail(FileListItem, ExtractResponse):
    model_config = ConfigDict(from_attributes=True)

class GoogleLoginRequest(BaseModel):
    # The ID token (JWT) issued by Google Identity Services on the frontend.
    credential: str

class UserOut(BaseModel):
    id: int
    email: Optional[str] = None
    name: Optional[str] = None
    picture: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

class ExtractionUpdate(BaseModel):
    title: Optional[str] = None
    authors: Optional[List[str]] = None
    year: Optional[str] = None
    doi: Optional[str] = None
    url: Optional[str] = None
    abstract: Optional[str] = None
    conclusion: Optional[str] = None

# Response shape for extraction endpoints. Deliberately excludes pdf_base64
# (never used by the frontend) so list/detail responses don't ship the raw
# PDF content on every request. has_pdf lets the UI show whether a PDF is
# actually viewable without shipping the bytes themselves -- computed in the
# database (pdf_base64 IS NOT NULL) rather than loaded and checked in Python.
class ExtractionOut(FileDetail):
    has_pdf: bool = False

    model_config = ConfigDict(from_attributes=True)

# Result of POST /api/extract, which serves both tiers. For guests nothing is
# persisted, so there is no row id -- the frontend assigns its own local id when
# saving to localStorage. has_pdf defaults to False, which is correct for guests
# (nothing was ever stored) and is set True explicitly by crud.create_extraction
# for the signed-in path.
class ExtractionResult(ExtractResponse):
    id: Optional[int] = None
    filename: Optional[str] = None
    has_pdf: bool = False

    model_config = ConfigDict(from_attributes=True)

# --- bulk import (guest localStorage -> account) ------------------------------

# Cap on items accepted by POST /api/extractions/import. A browser's guest
# store realistically holds tens of documents; this leaves generous headroom
# while refusing an unbounded payload (each item can carry a long abstract).
MAX_IMPORT_ITEMS = 200

class ExtractionImportItem(BaseModel):
    """One document being imported from a guest's localStorage.

    Every field is optional: this data was produced by the AI extractor and any
    of it may legitimately be blank. Note the absence of pdf_base64 -- guest
    uploads were never persisted server-side, so the bytes genuinely do not
    exist and imported rows have no PDF to serve. That is expected.
    """

    filename: Optional[str] = None
    title: Optional[str] = None
    authors: Optional[List[str]] = None
    year: Optional[str] = None
    doi: Optional[str] = None
    url: Optional[str] = None
    abstract: Optional[str] = None
    conclusion: Optional[str] = None

    # Unknown keys (a local id, a timestamp, whatever the frontend stored
    # alongside the metadata) are dropped rather than rejected, so an import
    # does not 422 because localStorage carried an extra field.
    model_config = ConfigDict(extra="ignore")

    @field_validator("year", mode="before")
    @classmethod
    def _coerce_year(cls, value: Any) -> Any:
        # The AI is asked for a string year, but a JSON round-trip through
        # localStorage can leave it as a number. Pydantic v2 does not coerce
        # int -> str, so do it here instead of failing the whole import.
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            return str(value)
        return value

    @field_validator("authors", mode="before")
    @classmethod
    def _coerce_authors(cls, value: Any) -> Any:
        # Tolerate the shape older guest records may have: a single
        # comma-separated string instead of a list.
        if isinstance(value, str):
            return [part.strip() for part in value.split(",") if part.strip()]
        if isinstance(value, list):
            return [str(item) for item in value if item is not None]
        return value