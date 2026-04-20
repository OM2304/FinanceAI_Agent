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




## Environment Variables
---

## 🔑 Configuration & API Keys

To run the **Financial AI** project without any issues, you need to set up environment variables for both the backend and the frontend.

### 🖥️ Backend Setup
**Location:** `/backend/.env`

- **SUPABASE_URL**
  Used to connect the backend to your database. Found in Supabase Dashboard > Settings > API.

- **SUPABASE_KEY**
  The public anonymous key for database access. Found in Supabase Dashboard > Settings > API.

- **GOOGLE_API_KEY**
  Powers the AI financial advisor and reasoning. Get this from Google AI Studio (Gemini).

- **OCR_SPACE_API_KEY**
  Used to extract text from uploaded receipt images. Get a free key from OCR.space.

- **SUPABASE_SERVICE_KEY**
  The secret service role key for backend database management. Found in Supabase API settings.

- **SPLITWISE_ACCESS_TOKEN**
  Your personal token to fetch data from Splitwise. Generate this in your Splitwise App settings.

- **SPLITWISE_CLIENT_ID**
  The unique ID for your registered Splitwise application.

- **SPLITWISE_CLIENT_SECRET**
  The secret key for your Splitwise application integration.

---

### 📱 Frontend Setup
**Location:** `/frontend/.env`

- **NEXT_PUBLIC_SUPABASE_URL**
  Use the same **SUPABASE_URL** used in the backend folder.

- **NEXT_PUBLIC_SUPABASE_ANON_KEY**
  Use the same **SUPABASE_KEY** used in the backend folder.

---

### ⚙️ How to Configure

1. **Create .env files:** Navigate to both the `backend/` and `frontend/` folders and create a new file named `.env` in each.
2. **Add Your Keys:** Copy the variable names listed above into the files and add your actual API values after the `=` sign (Example: `GOOGLE_API_KEY=your_key_here`).


## 🗄️ Database Setup (Supabase)

This project uses **Supabase** (PostgreSQL). Follow these steps to set up your database schema and security.

### 1. Initialize Tables
Run the following commands in the **Supabase SQL Editor**:

```sql
-- Transactions Table
CREATE TABLE public.transactions (
    id bigint primary key generated always as identity,
    user_id uuid references auth.users(id),
    date date,
    time time without time zone,
    sender varchar,
    receiver varchar,
    transaction_id varchar,
    category varchar,
    amount numeric,
    ai_confidence numeric,
    corrected boolean default false
);

-- Budget Limits Table
CREATE TABLE public.budget_limits (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references auth.users(id),
    category text,
    amount numeric,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

-- Splitwise Tokens Table
CREATE TABLE public.splitwise_tokens (
    user_id uuid primary key references auth.users(id),
    access_token text,
    token_type text default 'bearer',
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

-- Chat History Table
CREATE TABLE public.chat_history (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references auth.users(id),
    role text check (role in ('user', 'assistant')),
    content text,
    created_at timestamptz default now()
);


To include the database setup instructions while keeping every single part of your existing text intact, I have integrated a new Database Setup section right after your Project Structure.

This includes the specific SQL schema for your tables and the RLS policies, so any user can set it up in seconds.

Markdown
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


## 🗄️ Database Setup (Supabase)

This project uses **Supabase** (PostgreSQL). Follow these steps to set up your database schema and security.

### 1. Initialize Tables
Run the following commands in the **Supabase SQL Editor**:

```sql
-- Transactions Table
CREATE TABLE public.transactions (
    id bigint primary key generated always as identity,
    user_id uuid references auth.users(id),
    date date,
    time time without time zone,
    sender varchar,
    receiver varchar,
    transaction_id varchar,
    category varchar,
    amount numeric,
    ai_confidence numeric,
    corrected boolean default false
);

-- Budget Limits Table
CREATE TABLE public.budget_limits (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references auth.users(id),
    category text,
    amount numeric,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

-- Splitwise Tokens Table
CREATE TABLE public.splitwise_tokens (
    user_id uuid primary key references auth.users(id),
    access_token text,
    token_type text default 'bearer',
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

-- Chat History Table
CREATE TABLE public.chat_history (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references auth.users(id),
    role text check (role in ('user', 'assistant')),
    content text,
    created_at timestamptz default now()
);

2. Enable Row Level Security (RLS)
Go to the Authentication > Policies section in Supabase and ensure RLS is enabled for all tables. For each table, add a policy that allows users to access only their own rows:

Policy Definition: auth.uid() = user_id

Actions: ALL (Select, Insert, Update, Delete)