# FinSight Console (Finance AI Agent)

AI-powered personal finance console with a professional **Advanced Analytics dashboard** and an **Export Engine** for accountant-ready reporting. Ingest expenses from receipts, statements, and CSVs, then explore predictive insights, scenario planning, anomaly flags, budgets, and a multi-guru advisor.

## Analysis of the Previous README (What Changed)

The previous README described ingestion, charts, and advisor features well, but it didn’t showcase the two big “professional polish” additions you’ve built:

- **Advanced Analytics Dashboard**: predictive burn/runway metrics, strategic widgets (merchant concentration + category growth), what‑if simulation with 6‑month impact, and anomaly detection using Z‑Scores.
- **Automated Financial Reporting**: a printable “Financial Statement” PDF export and an accountant-ready CSV export with extra flags/remarks.
- **API surface**: predictive insights endpoint (`GET /insights/predictive`) was missing.
- **Clarity**: environment variables had duplicated blocks and setup can be simpler (`pip install -r requirements.txt`).

This README is rewritten to highlight those capabilities in a clarity-first structure.

## Core Feature: Advanced Analytics Dashboard

High-signal insights designed for quick scanning, with drill-down context when needed.

### Predictive Engine (Burn Rate + Runway)

- **Average Daily Burn (ADB)**: total spend ÷ number of days in the tracking period.
  - Example: total spend `₹20,614.46` → **ADB `₹2,576.81`**
- **Runway (Days)**: forecasts how long current funds last at the current ADB.
  - Enter a balance in the dashboard to compute runway days.

### Strategic Insights (Behavior + Trends)

- **Merchant Concentration**: highlights the **Top 5** merchants by spend to quickly spot concentration risk.
- **Category Growth**: compares two rolling periods (WoW/MoM-style) to surface categories accelerating up or down.

### Simulation Tool (What‑If / Scenario Planning)

- **What‑If Reduction**: simulate reducing a category by a given percentage and see how the period total changes.
- **6‑Month Savings Impact**: projects the same reduction across six months for long-term clarity.
  - Example: reduce **Transfers** by **20%** → **`₹21,618`** projected savings over 6 months.

## Core Feature: Automated Financial Reporting (Export Engine)

### Professional PDF Export (“Financial Statement”)

One-click export from the UI that includes:

- **Summary Statistics** (total spent, average transaction, transaction count)
- **Category Table** (sorted by spend)
- **AI-generated Guru Insights** (concise, action-oriented guidance)

### Accountant‑Ready CSV Export

Export a normalized CSV with extra fields for faster review and bookkeeping:

- `Tax_Potential` flags
- `Guru_Remark` annotations (e.g., “Significant” vs “Routine”)

## Intelligence Layer

### Anomaly Detection (Z‑Scores + Impact Flags)

- Uses a standard deviation-based **Z‑Score** to identify outliers.
- Also flags any transaction **> 10%** of total period spend.
- Designed to catch high-impact transactions like a **₹10,000 ATM withdrawal**.

### Multi‑Guru Advisor

An assistant that can channel distinct financial philosophies:

- **Warren Buffett**
- **Robert Kiyosaki**
- **Ramit Sethi**

## Technical Architecture

- **Frontend**: Next.js (App Router, Turbopack dev), React, Tailwind CSS
- **Backend**: Python + FastAPI for analytics and forecasting logic
- **Database/Auth**: Supabase (Postgres + Auth)
- **AI/ML**: Google Gemini (advisor + enrichment), sklearn (adaptive categorization)
- **OCR/PDF**: OCR.Space, OpenCV, pdfplumber, pikepdf, PyPDF2
- **Integrations**: Splitwise API (OAuth + expenses), MF API (mutual funds)

## API Endpoints (Current)

- `GET /api/recommendation`
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
- `GET /insights/predictive`
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
- `POST /api/tax-saving-plan`

## Project Structure

```
Financial_AI_Agent_W3_4/
├── README.md
├── backend/
│   ├── main.py
│   ├── requirements.txt
│   └── tools/
│       ├── analytics.py
│       ├── advisor.py
│       ├── data_processor.py
│       ├── statement_processor.py
│       └── supabase_db.py
├── data/
│   ├── budget_limit.json
│   └── reports/
└── frontend/
    ├── lib/
    │   └── api.js
    └── app/
        └── components/
            ├── AdvancedAnalytics.jsx
            ├── PredictiveAnalytics.jsx
            ├── ExportDropdown.jsx
            └── FinancialReportTemplate.jsx
```

## Environment Variables

### Backend (`backend/.env`)

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your_supabase_service_key

GOOGLE_API_KEY=your_google_api_key
OCR_SPACE_API_KEY=your_ocr_space_api_key

SPLITWISE_CLIENT_ID=your_splitwise_client_id
SPLITWISE_CLIENT_SECRET=your_splitwise_client_secret

# Optional: static token mode (if bypassing OAuth in development)
# SPLITWISE_ACCESS_TOKEN=your_splitwise_access_token
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
pip install -r requirements.txt
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

