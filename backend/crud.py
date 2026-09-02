from typing import Optional

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, load_only

import models

# ExtractionOut never includes pdf_base64 (the README calls this out explicitly),
# so queries that back it should never pull that column out of the database
# either -- it's often the largest value in the row by a wide margin.
_EXTRACTION_LIST_COLUMNS = (
    models.Extraction.id,
    models.Extraction.filename,
    models.Extraction.title,
    models.Extraction.authors,
    models.Extraction.year,
    models.Extraction.doi,
    models.Extraction.url,
    models.Extraction.abstract,
    models.Extraction.conclusion,
    models.Extraction.user_id,
)

# --- users -------------------------------------------------------------------

def get_user(db: Session, user_id: int) -> Optional[models.User]:
    return db.query(models.User).filter(models.User.id == user_id).first()

def get_user_by_google_sub(db: Session, google_sub: str) -> Optional[models.User]:
    return db.query(models.User).filter(models.User.google_sub == google_sub).first()

def get_or_create_user(db: Session, claims: dict) -> models.User:
    """Look up the user by Google's immutable `sub`, creating them on first sign-in.

    Profile fields are refreshed on every sign-in since the user may have changed
    their name, picture, or email on the Google side.
    """
    google_sub = claims["sub"]
    user = get_user_by_google_sub(db, google_sub)

    if user is None:
        user = models.User(
            google_sub=google_sub,
            email=claims.get("email"),
            name=claims.get("name"),
            picture=claims.get("picture"),
        )
        db.add(user)
        try:
            db.commit()
        except IntegrityError:
            # Two simultaneous first-time sign-ins raced; the unique index on
            # google_sub rejected the loser, so fall back to the winner's row.
            db.rollback()
            user = get_user_by_google_sub(db, google_sub)
            if user is None:
                raise
            return user
        db.refresh(user)
        return user

    user.email = claims.get("email", user.email)
    user.name = claims.get("name", user.name)
    user.picture = claims.get("picture", user.picture)
    db.commit()
    db.refresh(user)
    return user

# --- extractions -------------------------------------------------------------
# Every function below takes user_id as a required argument and filters on it.
# IDs are sequential integers, so an unscoped lookup would let any signed-in user
# read or mutate someone else's rows just by changing the number in the URL.

def create_extraction(
    db: Session, filename: str, metadata_dict: dict, pdf_base64: str, user_id: int
) -> models.Extraction:
    extraction = models.Extraction(
        filename=filename,
        title=metadata_dict.get("title"),
        authors=metadata_dict.get("authors"),      # keep as JSON
        year=metadata_dict.get("year"),
        doi=metadata_dict.get("doi"),
        url=metadata_dict.get("url"),
        abstract=metadata_dict.get("abstract"),
        conclusion=metadata_dict.get("conclusion"),
        pdf_base64=pdf_base64,
        user_id=user_id,
    )
    db.add(extraction)
    db.commit()
    db.refresh(extraction)
    return extraction

def create_extractions_bulk(
    db: Session, items: list[dict], user_id: int
) -> list[models.Extraction]:
    """Create one owner-scoped row per metadata dict, in a single transaction.

    Used by the guest -> account import: either every document lands or none
    does, so a failure part-way through cannot leave a half-imported library.

    pdf_base64 is left NULL on purpose. Guest uploads were never persisted
    server-side, so there are no bytes to store; the PDF endpoint already 404s
    cleanly for rows in that state.
    """
    extractions = [
        models.Extraction(
            filename=item.get("filename"),
            title=item.get("title"),
            authors=item.get("authors"),      # keep as JSON
            year=item.get("year"),
            doi=item.get("doi"),
            url=item.get("url"),
            abstract=item.get("abstract"),
            conclusion=item.get("conclusion"),
            pdf_base64=None,
            user_id=user_id,
        )
        for item in items
    ]
    if not extractions:
        return []

    db.add_all(extractions)
    db.commit()
    # commit() expires the instances; touching .id reloads each row, which is
    # what the response model needs anyway.
    for extraction in extractions:
        db.refresh(extraction)
    return extractions

def get_extraction(
    db: Session, extraction_id: int, user_id: int
) -> Optional[models.Extraction]:
    return (
        db.query(models.Extraction)
        .options(load_only(*_EXTRACTION_LIST_COLUMNS))
        .filter(
            models.Extraction.id == extraction_id,
            models.Extraction.user_id == user_id,
        )
        .first()
    )

def get_extraction_pdf(
    db: Session, extraction_id: int, user_id: int
) -> Optional[tuple[Optional[str], Optional[str]]]:
    """Owner-scoped fetch of just (filename, pdf_base64) for one extraction.

    Returns None when the row does not exist or belongs to another user -- the
    caller cannot tell those apart, which is deliberate. Selects only the two
    columns it needs so the PDF payload is the only large value loaded, and no
    other column is dragged into memory.
    """
    return (
        db.query(models.Extraction.filename, models.Extraction.pdf_base64)
        .filter(
            models.Extraction.id == extraction_id,
            models.Extraction.user_id == user_id,
        )
        .first()
    )

def get_all_extractions(db: Session, user_id: int) -> list[models.Extraction]:
    return (
        db.query(models.Extraction)
        .options(load_only(*_EXTRACTION_LIST_COLUMNS))
        .filter(models.Extraction.user_id == user_id)
        .order_by(models.Extraction.id.asc())
        .all()
    )

def update_extraction(
    db: Session, extraction_id: int, updates: dict, user_id: int
) -> Optional[models.Extraction]:
    db_extraction = get_extraction(db, extraction_id, user_id)
    if not db_extraction:
        return None
    # Guard against a payload smuggling in ownership or identity fields.
    protected = {"id", "user_id", "user"}
    for key, value in updates.items():
        if key not in protected and hasattr(db_extraction, key):
            setattr(db_extraction, key, value)
    db.commit()
    db.refresh(db_extraction)
    return db_extraction

def delete_extraction(db: Session, extraction_id: int, user_id: int) -> bool:
    db_extraction = get_extraction(db, extraction_id, user_id)
    if not db_extraction:
        return False
    db.delete(db_extraction)
    db.commit()
    return True
