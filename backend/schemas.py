from pydantic import BaseModel, ConfigDict
from typing import Optional, List

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
    filename: str

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
# PDF content on every request.
class ExtractionOut(FileDetail):
    model_config = ConfigDict(from_attributes=True)

# Result of POST /api/extract, which serves both tiers. For guests nothing is
# persisted, so there is no row id -- the frontend assigns its own local id when
# saving to localStorage.
class ExtractionResult(ExtractResponse):
    id: Optional[int] = None
    filename: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)