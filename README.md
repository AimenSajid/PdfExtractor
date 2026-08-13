# PDF Extractor

Upload an academic PDF and get its metadata — title, authors, year, DOI, URL, abstract and conclusion — pulled out into an editable table.

Text is extracted locally with PyPDF2 and sent to **Google Gemini**, which returns structured JSON. Signed-in users keep their documents in Postgres and can reopen the original PDF in a modal; visitors who'd rather not sign in still get the full extraction flow, stored in their own browser.

- `frontend/` — Vite + React 18 + Tailwind
- `backend/` — FastAPI + SQLAlchemy + Postgres, Alembic-managed schema

## Features

- **Metadata extraction** from research papers via Gemini, returned as validated JSON.
- **Google sign-in** using the Identity Services ID-token flow — no client secret, no password ever handled by this app.
- **Per-user storage.** Every document belongs to exactly one account, enforced in the query layer rather than in the view.
- **Guest mode.** Not signing in still works: extractions are kept in `localStorage`, and nothing is written to the database.
- **Guest → account import.** Sign in after working as a guest and the app offers to adopt what's already in the browser.
- **Inline editing** of any extracted field, since AI extraction is not perfect.
- **PDF viewer modal** for signed-in users, served on demand rather than embedded in every list response.

## Architecture

### Two storage tiers behind one interface

`frontend/src/dataStore.js` exposes a single async interface — `list`, `create`, `update`, `remove` — with two implementations: one backed by the API, one by `localStorage`. `App.jsx` picks between them with `getStore(isAuthenticated)` and never branches on auth state again.

The guest store writes through a field whitelist, so `pdf_base64` can never reach `localStorage` — base64 inflates a PDF by roughly a third, and a single file would otherwise eat the ~5 MB origin quota.

### Authentication

The browser obtains a Google ID token, which the backend verifies against Google's public keys (checking issuer, audience and `email_verified`). It then mints its own short JWT and returns it in an **httpOnly, SameSite=Lax cookie** — so the session token is never readable from JavaScript.

Users are keyed on Google's stable `sub` claim, never on email, because email addresses can change hands.

`GET /api/auth/me` returns `null` rather than 401 for guests: the frontend calls it on every load to decide which mode to render, and being signed out is a valid state, not an error.

### Access control

Ownership is enforced in `crud.py`, where every extraction function takes `user_id` as a **required** argument — there is no code path that can forget it. Requests for another user's row return **404, not 403**, so the API never confirms that an id exists.

### Schema

Alembic owns the schema; `create_all` is deliberately not used. `create_all` only creates *missing tables* and silently skips columns added to tables that already exist, which is exactly how a column once went missing in this project.

```bash
alembic upgrade head    # apply migrations
alembic current         # show where the database is
```

## Setup

Requires Python 3.10+, Node 18+, and a running PostgreSQL instance.

### 1. Google credentials

- **Gemini API key** — from [Google AI Studio](https://aistudio.google.com/apikey).
- **OAuth Client ID** — from the [Google Cloud console](https://console.cloud.google.com/apis/credentials): create an OAuth client of type *Web application* and add `http://localhost:5173` as an authorized JavaScript origin.

### 2. Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env            # then fill it in
createdb pdf_extractor_db       # or create it however you prefer
alembic upgrade head
uvicorn main:app --reload --port 8000
```

`.env` needs `GEMINI_API_KEY`, `DATABASE_URL`, `GOOGLE_CLIENT_ID` and `JWT_SECRET`; the app refuses to start without them. Generate the session secret with:

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

### 3. Frontend

```bash
cd frontend
npm install
cp .env.example .env            # set VITE_GOOGLE_CLIENT_ID to the same client id
npm run dev
```

Open http://localhost:5173. **Use exactly that origin** — `127.0.0.1:5173` is a different origin to Google OAuth and to the CORS allowlist.

## API

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/auth/google` | — | Exchange a Google ID token for a session cookie |
| `POST` | `/api/auth/logout` | — | Clear the session cookie |
| `GET` | `/api/auth/me` | optional | Current user, or `null` for guests |
| `POST` | `/api/extract` | optional | Extract metadata; persists only when signed in |
| `GET` | `/api/extractions` | required | List the caller's documents |
| `POST` | `/api/extractions/import` | required | Adopt guest documents into the account |
| `GET` | `/api/extractions/{id}` | required | One document |
| `GET` | `/api/extractions/{id}/pdf` | required | Stream the stored PDF |
| `PUT` | `/api/extractions/{id}` | required | Edit fields |
| `DELETE` | `/api/extractions/{id}` | required | Delete |

List and detail responses deliberately exclude `pdf_base64`, so the raw file is never shipped with metadata.

## Known limitations

Deliberate trade-offs for a demo, and what production would need instead:

- **PDFs are stored base64-encoded in Postgres.** Simple and transactional, but it inflates each file ~33% and bloats the table. Object storage (S3, GCS) with a key column is the real answer.
- **CORS origins are hardcoded** to localhost in `main.py`. Deployment needs these driven by an environment variable.
- **Uploads are capped at 20 MB** (`MAX_UPLOAD_MB`) and read fully into memory. Larger files want streaming straight to object storage.
- **Only the first 30,000 characters** of a paper are sent to the model, which is enough for front-matter metadata but would miss a conclusion in a very long document.
- **No rate limiting.** Every extraction costs an API call, so anything public-facing needs a quota.
- **No automated test suite.** Behaviour has been verified manually and with throwaway scripts, not in CI.

## License

MIT — see [LICENSE](LICENSE).
