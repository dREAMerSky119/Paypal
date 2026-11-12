# Integration guide

This project uses `Paypal.zip` as its base. It adds the Market Simulator, Responsible Travel, and Related Spots features.

## Setup

Backend (from `backend/`):
```bash
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Frontend (from `frontend/`):
```bash
npm install
npm run dev
```

For the AI advisor, add a valid `GEMINI_API_KEY` to `backend/.env` (copy `.env.example` first). Other features do not require this key. Do not commit `.env`.

## Feature routes
- `/app/simulator` — Market Simulator
- `/app/responsible-travel` — Responsible Travel
- `/app/related-spots` — Related Spots

The archive intentionally excludes `.git`, virtual environments, `node_modules`, caches and compiled frontend bundles. Reinstall dependencies locally.
