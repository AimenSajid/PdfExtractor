import os
from dotenv import load_dotenv

load_dotenv()

def _env(name: str, default: str = "") -> str:
    return (os.getenv(name) or default).strip()

GEMINI_API_KEY = _env("GEMINI_API_KEY")
GEMINI_MODEL = _env("GEMINI_MODEL", "models/gemini-2.5-flash")
DATABASE_URL = _env("DATABASE_URL")
GOOGLE_CLIENT_ID = _env("GOOGLE_CLIENT_ID")
JWT_SECRET = _env("JWT_SECRET")
COOKIE_SECURE = _env("COOKIE_SECURE", "false").lower() == "true"

# Name of the cookie holding our own session token, and how long it lasts.
SESSION_COOKIE_NAME = "pdfx_session"
SESSION_TTL_DAYS = 7

# When the frontend and API are on different sites -- say the frontend on
# Vercel and the API on Render -- a SameSite=Lax cookie is simply not sent,
# and every request after sign-in looks like a guest. SameSite=None fixes
# that, but browsers only honour it alongside Secure, so the two are tied
# together: over HTTPS we go cross-site, locally over http we stay on Lax.
COOKIE_SAMESITE = "none" if COOKIE_SECURE else "lax"

# Origins permitted to make credentialed requests. Comma-separated so the
# deployed frontend URL can be added without a code change.
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in _env(
        "ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
    ).split(",")
    if origin.strip()
]

# Largest PDF accepted by POST /api/extract. The bytes are held in memory and
# base64-encoded into Postgres, which inflates them by roughly a third, so this
# single number bounds both per-request memory and the stored row size.
try:
    MAX_UPLOAD_MB = int(_env("MAX_UPLOAD_MB", "20"))
except ValueError:
    raise ValueError("MAX_UPLOAD_MB must be a whole number of megabytes")
if MAX_UPLOAD_MB <= 0:
    raise ValueError("MAX_UPLOAD_MB must be greater than zero")
MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024

for _name in ("GEMINI_API_KEY", "DATABASE_URL", "GOOGLE_CLIENT_ID", "JWT_SECRET"):
    if not globals()[_name]:
        raise ValueError(f"{_name} is missing. Set it in .env (see .env.example)")

