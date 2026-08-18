"""Google sign-in verification and our own cookie-based session handling.

Flow: the frontend obtains a Google ID token, posts it here, we verify it against
Google's public keys, then issue our *own* short-lived session JWT in an httpOnly
cookie. Google's token is never stored or reused -- it only proves identity once.
"""
import datetime
import logging
from typing import Optional

import jwt
from fastapi import Depends, HTTPException, Request, Response
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
from sqlalchemy.orm import Session

import crud
import database
import models
from config import (
    COOKIE_SAMESITE,
    COOKIE_SECURE,
    GOOGLE_CLIENT_ID,
    JWT_SECRET,
    SESSION_COOKIE_NAME,
    SESSION_TTL_DAYS,
)

logger = logging.getLogger(__name__)

JWT_ALGORITHM = "HS256"

# Google's documented issuers for ID tokens.
_VALID_ISSUERS = ("accounts.google.com", "https://accounts.google.com")


def get_db():
    db = database.SessionLocal()
    try:
        yield db
    finally:
        db.close()


def verify_google_token(token: str) -> dict:
    """Validate a Google ID token and return its verified claims.

    verify_oauth2_token checks the signature, audience and expiry, raising
    ValueError on any failure. A few seconds of clock skew tolerance avoids
    spurious "token used too early" errors on machines with drifting clocks.
    """
    try:
        claims = google_id_token.verify_oauth2_token(
            token,
            google_requests.Request(),
            GOOGLE_CLIENT_ID,
            clock_skew_in_seconds=10,
        )
    except ValueError as exc:
        logger.warning("Rejected Google ID token: %s", exc)
        raise HTTPException(status_code=401, detail="Invalid Google token") from exc

    if claims.get("iss") not in _VALID_ISSUERS:
        raise HTTPException(status_code=401, detail="Invalid Google token issuer")

    if not claims.get("sub"):
        raise HTTPException(status_code=401, detail="Google token missing subject")

    # An unverified email means Google cannot vouch for the address, so we refuse
    # to key an account on it even though identity rests on `sub`.
    if claims.get("email") and not claims.get("email_verified", False):
        raise HTTPException(status_code=401, detail="Google email is not verified")

    return claims


def create_session_token(user_id: int) -> str:
    now = datetime.datetime.now(datetime.timezone.utc)
    payload = {
        "sub": str(user_id),
        "iat": now,
        "exp": now + datetime.timedelta(days=SESSION_TTL_DAYS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=token,
        httponly=True,          # unreadable from JS, so XSS cannot exfiltrate it
        secure=COOKIE_SECURE,   # must be True once served over HTTPS
        # "none" when deployed, so the cookie survives a frontend and API on
        # separate sites; "lax" locally, where http forbids SameSite=None.
        samesite=COOKIE_SAMESITE,
        max_age=SESSION_TTL_DAYS * 24 * 60 * 60,
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    # The attributes must match the ones the cookie was set with, or the
    # browser treats it as a different cookie and logout leaves it in place.
    response.delete_cookie(
        key=SESSION_COOKIE_NAME,
        path="/",
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
        httponly=True,
    )


def get_current_user_optional(
    request: Request, db: Session = Depends(get_db)
) -> Optional[models.User]:
    """Resolve the signed-in user, or None for guests.

    Used by endpoints that serve both tiers -- /api/extract still parses PDFs for
    signed-out visitors, it just does not persist the result.
    """
    token = request.cookies.get(SESSION_COOKIE_NAME)
    if not token:
        return None

    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.PyJWTError:
        # Expired, tampered with, or signed by a rotated secret: treat as a guest
        # rather than erroring, so a stale cookie does not wedge the app.
        return None

    user_id = payload.get("sub")
    if user_id is None:
        return None

    return crud.get_user(db, int(user_id))


def get_current_user(
    user: Optional[models.User] = Depends(get_current_user_optional),
) -> models.User:
    """Require a signed-in user, 401 otherwise."""
    if user is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user
