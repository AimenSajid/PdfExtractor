from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, JSON, func
from sqlalchemy.orm import relationship
import database

Base = database.Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    # Google's immutable per-account identifier. Identity is keyed on this rather
    # than email, because emails can be changed and reassigned -- keying on email
    # would eventually hand one person's documents to someone else.
    google_sub = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, index=True)
    name = Column(String)
    picture = Column(String)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    extractions = relationship(
        "Extraction", back_populates="user", cascade="all, delete-orphan"
    )

class Extraction(Base):
    __tablename__ = "extractions"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String, index=True)
    title = Column(String)          # corresponds to "title"
    authors = Column(JSON)          # corresponds to "authors" array
    year = Column(String)           # corresponds to "year" (string to match AI output)
    doi = Column(String)            # corresponds to "doi"
    url = Column(String)            # corresponds to "url"
    abstract = Column(String)       # corresponds to "abstract"
    conclusion = Column(String)        # contains all structured AI data
    pdf_base64 = Column(Text)
    # Nullable only to accommodate rows that predate authentication; new rows
    # always carry an owner. Indexed because every query filters on it.
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=True
    )

    user = relationship("User", back_populates="extractions")
