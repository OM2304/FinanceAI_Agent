# Finance AI Agent

AI-powered personal finance assistant with:
- Expense extraction from screenshots and bank statements
- Smart categorization and correction workflow
- Financial dashboard with analytics charts
- Guru-style financial advice chat
- User authentication and per-user data isolation (Supabase + RLS)

## Tech Stack

- Frontend: Next.js (App Router), React, Tailwind, Recharts
- Backend: FastAPI (Python)
- Database/Auth: Supabase (Postgres + Auth + RLS)
- AI/OCR: Google Gemini (advice/categorization fallback), OCR Space API

## Implemented Features

1. Authentication
- Email/password login
- Google OAuth login
- Session callback handling via Supabase SSR

2. Expense Ingestion
- Upload payment screenshots/images for OCR extraction
- Upload bank statement PDFs (including password-protected PDFs)
- Parse extracted fields: amount, sender, receiver, date/time, transaction id

3. Confirmation + Correction Flow
- Editable transaction confirmation modal before save (for image OCR flow)
- Confidence-aware UI indicators
- Stores correction metadata for adaptive learning

4. Transaction Operations
- Save confirmed transaction
- Bulk save from parsed bank statement
- Fetch user transactions
- Delete user transaction

5. Dashboard + Analytics
- Total spend, category count, average spend
- Spending by category chart
- Backend analytics charts (category, monthly trend, pie, merchants)
- Recent transactions table

6. AI Financial Advisor
- Personalized chat advice using user spending context
- Guru preference options (e.g., Warren Buffett, Robert Kiyosaki, Ramit Sethi)
- Budget/spending insight tooling integrated in backend

7. Security/Data Isolation
- Supabase Row Level Security compatible API calls
- User JWT passed to backend and DB layer for per-user isolation

## Project Structure

```text
Financial-AI-Agent-Project Week 1-2/
├─ backend/
│  ├─ main.py
│  └─ tools/
│     ├─ advisor.py
│     ├─ analytics.py
│     ├─ data_processor.py
│     ├─ ocr_processor.py
│     ├─ statement_processor.py
│     └─ supabase_db.py
├─ frontend/
│  ├─ app/
│  ├─ lib/
│  ├─ middleware.js
│  └─ package.json
└─ data/
```

## Environment Variables

### Backend (`backend/.env`)

Use `backend/.env.example` as template:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key_if_needed
GOOGLE_API_KEY=your_google_api_key
OCR_SPACE_API_KEY=your_ocr_space_api_key
```

### Frontend (`frontend/.env.local`)

Use `frontend/.env.example` as template:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## Local Setup

## 1) Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate   # Windows
pip install -r requirements.txt
uvicorn main:app --reload
```

If you do not have `requirements.txt`, install required libraries manually (FastAPI, uvicorn, supabase, pandas, matplotlib, python-dotenv, OCR/PDF dependencies, langchain/google-genai related deps).

## 2) Frontend

```bash
cd frontend
npm install
npm run dev
```

Open:
- Frontend: `http://localhost:3000`
- Backend API: `http://localhost:8000`

## OAuth Setup Notes

- Add Google provider in Supabase Auth.
- Add redirect URL:
  - `http://localhost:3000/auth/callback`


## GitHub Safety Notes

- Do not commit `.env` or `.env.local`.
- Commit only `.env.example` templates.
- Rotate any API key that was previously exposed.

## Current Status

- Core functionality for expense extraction, statement processing, dashboard, and AI advice is implemented and working locally.
- Additional advanced modules (e.g., full anomaly detection/goal tracking/Splitwise integration) can be added as next milestones.

