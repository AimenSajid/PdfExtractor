# Backend

FastAPI + SQLAlchemy + PostgreSQL. Extracts PDF text with PyPDF2 and sends it to
Google Gemini (through the OpenAI SDK, pointed at Google's OpenAI-compatible
endpoint) to get structured metadata back.

Setup, environment variables and the API reference live in the
[project README](../README.md). This file covers backend-specific workflows.

## Layout

| File | Responsibility |
| --- | --- |
| `main.py` | Routes, CORS, the extraction pipeline |
| `auth.py` | Google token verification, session cookies, request dependencies |
| `crud.py` | Database access — every extraction function requires a `user_id` |
| `models.py` | SQLAlchemy tables |
| `schemas.py` | Pydantic request/response models |
| `config.py` | Environment loading, with validation at import time |
| `database.py` | Engine and session factory |
| `alembic/` | Migrations |

## Migrations

Alembic owns the schema — `create_all` is intentionally unused, because it only
creates missing *tables* and silently ignores columns added to tables that
already exist.

```bash
alembic upgrade head                      # apply
alembic current                           # where the database is
alembic downgrade -1                      # step back one
alembic revision --autogenerate -m "add tags" --rev-id 0003_add_tags
```

Pass `--rev-id` when creating a revision. Without it Alembic generates a random
hex id, which is what the readable `0001_`/`0002_` ids in `alembic/versions/`
replaced. Ids are stored in `alembic_version`, a `VARCHAR(32)`, so keep them to
32 characters or fewer.

Changing an existing revision id is not a rename — it must be updated in the
file, in the next migration's `down_revision`, **and** in the `alembic_version`
row of every database already at that revision, or Alembic can no longer locate
its current position.

## Notes

- `run_in_executor` wraps the Gemini call because the OpenAI SDK is synchronous
  and would otherwise block the event loop.
- Uploads are read in 1 MB chunks and aborted past `MAX_UPLOAD_MB`, so an
  oversized file is rejected before its bytes are all in memory.
- `--reload` has proved unreliable on Windows here; restart the server outright
  if a change doesn't seem to take effect.
