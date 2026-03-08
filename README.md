# Finance AI Agent

AI-powered personal finance assistant with receipt/PDF/CSV ingestion, analytics dashboards, AI advisor chat, budget controls, guru knowledge library, and Splitwise integration.

## Tech Stack

- Frontend: Next.js (App Router), React, Tailwind CSS, Recharts
- Backend: FastAPI (Python)
- Database/Auth: Supabase (Postgres + Auth)
- AI/ML: Google Gemini (advisor + enrichment), sklearn (adaptive categorization)
- OCR/PDF: OCR.Space, OpenCV, pdfplumber, pikepdf, PyPDF2
- External API: Splitwise API (OAuth + expenses)

## Implemented Features

### 1. Authentication and Session Handling

- Email/password login and signup via Supabase
- Google OAuth login flow (`/auth/callback`)
- Frontend stores access token and sends it as Bearer token to backend
- Backend verifies user token before protected operations

### 2. Multi-Source Expense Ingestion

- OCR image upload (payment screenshots/receipts)
- PDF bank statement upload with password handling
- Manual transaction entry form
- CSV transaction import (`/transactions/import-csv`)
- Transaction confirmation modal before saving OCR output
- Field-level validation and low-confidence warnings in confirmation UI

### 3. Adaptive Categorization

- Hybrid categorization flow:
  - ML model prediction from known transactions (`ml_categorizer.py`)
  - Gemini fallback when ML confidence is low
- Category corrections can be saved with transaction metadata (`corrected`, `ai_confidence`)

### 4. Transaction Operations

- Save confirmed transaction
- Import transactions in bulk from CSV
- Fetch user transactions
- Delete transaction
- Automatic chart refresh after create/delete/import workflows

### 5. Analytics and Insights

- KPI cards in dashboard:
  - Total spending
  - Total categories
  - Average transaction amount
- Backend-generated charts:
  - Total spending by category (bar)
  - Monthly trend (line)
  - Category distribution (pie)
  - Top merchants (barh)
- Spending pattern insights:
  - Avg daily spend
  - Top category and merchant
  - Busiest weekday
  - Weekend vs weekday share
  - Recurring merchants
  - Month-over-month change
- Budget recommendations generated from behavior patterns

### 6. Budget Management

- Per-user budget limits (DB-backed with local JSON fallback)
- Budget summary showing:
  - Budget vs spent
  - Remaining amount
  - Over/under-budget status
- Add custom categories and limits from UI

### 7. AI Financial Advisor

- Chat endpoint with user-aware financial context
- Guru style preference in UI:
  - Warren Buffett
  - Robert Kiyosaki
  - Ramit Sethi
- Advisor uses:
  - Spending summary
  - Recent transactions
  - Pattern insights
  - Budget recommendations
- Friendly response rendering from structured agent output

### 8. Guru Content Library (RAG-lite)

- Upload guru documents (`PDF`, `TXT`, `MD`)
- Automatic text extraction and chunking
- Per-user/per-guru document index
- Query-time snippet retrieval used by advisor prompt context

### 9. Splitwise Integration

- Splitwise OAuth connect flow
- Fetch groups, group info, current user
- Fetch expenses for group or all
- Group-level summary:
  - total cost
  - paid by
  - owed by
  - net balances
- Create Splitwise expense from UI (equal split support)

## API Endpoints (Current)

- `POST /chat`
- `POST /upload`
- `POST /transactions/confirm`
- `GET /expenses`
- `DELETE /expenses/{expense_id}`
- `POST /transactions/import-csv`
- `GET /reports/{chart_id}` (`bar`, `line`, `pie`, `merchants`)
- `POST /reports/refresh`
- `GET /budget/limits`
- `POST /budget/limits`
- `GET /budget/summary`
- `GET /insights/patterns`
- `POST /guru/upload`
- `GET /guru/content`
- `GET /splitwise/groups`
- `GET /splitwise/expenses`
- `GET /splitwise/group/{group_id}`
- `GET /splitwise/me`
- `GET /splitwise/group-summary/{group_id}`
- `GET /splitwise/oauth/start`
- `POST /splitwise/oauth/exchange`
- `POST /splitwise/expenses`

## Current Project Structure

```text
Financial_AI_Agent_W3_4/
+-- backend/
|   +-- main.py
|   +-- .env.example
|   \-- tools/
|       +-- advisor.py
|       +-- analytics.py
|       +-- data_processor.py
|       +-- guru_content.py
|       +-- guru_logic.py
|       +-- llm_config.py
|       +-- ml_categorizer.py
|       +-- ocr_processor.py
|       +-- splitwise_analytics.py
|       +-- splitwise_client.py
|       +-- statement_processor.py
|       \-- supabase_db.py
+-- frontend/
|   +-- app/
|   |   +-- page.jsx
|   |   +-- login/page.jsx
|   |   +-- auth/callback/page.jsx
|   |   +-- splitwise/callback/page.jsx
|   |   \-- components/
|   |       +-- AiAssistant.jsx
|   |       +-- BackendCharts.jsx
|   |       +-- BudgetPanel.jsx
|   |       +-- GuruLibrary.jsx
|   |       +-- SpendingPatterns.jsx
|   |       +-- SplitwisePanel.jsx
|   |       +-- TransactionConfirmationModal.jsx
|   |       \-- UploadComponent.js
|   +-- lib/
|   |   +-- api.js
|   |   \-- supabase/
|   |       +-- client.js
|   |       \-- server.js
|   +-- middleware.js
|   \-- .env.example
+-- data/
|   +-- budget_limit.json
|   +-- demo_expense_dataset_100_records_with_payment_modes.csv
|   +-- guru_data.py
|   +-- guru_docs/
|   \-- reports/
\-- temp/
```

## Environment Variables

### Backend (`backend/.env`)

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your_supabase_service_key
# Optional fallback in code:
# SUPABASE_KEY=your_supabase_key

GOOGLE_API_KEY=your_google_api_key
OCR_SPACE_API_KEY=your_ocr_space_api_key

SPLITWISE_CLIENT_ID=your_splitwise_client_id
SPLITWISE_CLIENT_SECRET=your_splitwise_client_secret
# Optional fallback if you want static token mode
SPLITWISE_ACCESS_TOKEN=your_splitwise_access_token
```

### Frontend (`frontend/.env.local`)

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## Local Setup

### 1) Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install fastapi uvicorn python-dotenv supabase pandas matplotlib opencv-python requests pdfplumber pikepdf PyPDF2 scikit-learn langchain langchain-google-genai
uvicorn main:app --reload
```

### 2) Frontend

```bash
cd frontend
npm install
npm run dev
```

Open:

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:8000`

## Notes

- `data/reports/` stores generated chart PNGs.
- `data/guru_docs/` stores uploaded guru files and chunk indexes by user.
- Splitwise callback route used by frontend: `http://localhost:3000/splitwise/callback`
- Supabase auth callback route: `http://localhost:3000/auth/callback`
