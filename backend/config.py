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

for _name in ("GEMINI_API_KEY", "DATABASE_URL", "GOOGLE_CLIENT_ID", "JWT_SECRET"):
    if not globals()[_name]:
        raise ValueError(f"{_name} is missing. Set it in .env (see .env.example)")

