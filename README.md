# PDF Extractor (Vite + React frontend + FastAPI backend)

This project contains a minimal, clean single-page app that accepts a PDF, sends it to a Python FastAPI backend which extracts text and calls OpenAI to extract structured information.

Structure:
- `frontend/` — Vite + React + Tailwind app (client)
- `backend/` — FastAPI + OpenAI (server)

## Setup

### Backend
1. Copy `backend/.env.example` to `backend/.env` and set your `OPENAI_API_KEY`.
2. Create virtualenv and install:
```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```
3. Run server:
```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend
1. Install dependencies and run:
```bash
cd frontend
npm install
npm run dev
```
2. Open the dev server (Vite will print the URL, usually http://localhost:5173).

## Notes
- The frontend expects backend at http://localhost:8000
- Make sure to set your OpenAI API key in `backend/.env`
- This is a starter/demo. For production, secure the API key and add rate limiting, file size limits, authentication, streaming, error handling, etc.
