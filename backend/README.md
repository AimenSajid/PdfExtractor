FastAPI backend for PDF extraction using OpenAI.

Environment:
- Create a .env file (see .env.example) and set OPENAI_API_KEY.
- Python 3.10+

Install:
    python -m venv .venv
    .venv\Scripts\activate
    pip install -r requirements.txt

Run dev server:
    uvicorn main:app --reload --host 0.0.0.0 --port 8000
