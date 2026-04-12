from fastapi import FastAPI, UploadFile, HTTPException, Form, Depends, Header, Query
from tools.advisor import chat_with_advisor, process_statement_tool
from tools.guru_content import ingest_guru_document, list_guru_documents, migrate_json_to_vector_db, query_guru_advice
from tools.supabase_db import save_transaction, get_user_transactions, delete_transaction, verify_user_token, get_budget_limits, set_budget_limits, get_splitwise_token, set_splitwise_token, get_financial_summary, save_chat_message, get_chat_history
from tools.analytics import (
    refresh_analysis,
    calculate_budget_adherence,
    get_spending_patterns,
    build_budget_recommendations,
    build_predictive_financial_engine,
)
from tools.data_processor import load_and_clean_data, load_budget_limits, save_budget_limits
from tools.splitwise_client import get_groups, get_expenses as splitwise_get_expenses, get_group, get_current_user as splitwise_current_user, build_authorize_url, exchange_code_for_token, create_expense
from tools.splitwise_analytics import summarize_group_expenses
from financial_engine import mf_api, calculators, advisor as wealth_advisor
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional
import os
import shutil
import pandas as pd
import re
from pydantic import BaseModel
from tools.llm_config import get_llm
from tools.math_engine import calculate_sip, calculate_ppf, IndiaTaxEngine, get_tax_recommendations, create_math_tools
from datetime import date, datetime
from financial_engine import mf_api, calculators, advisor
from tools.transaction_validation import TransactionConfirmModel
from langchain.agents import create_agent


app = FastAPI()
math_tools = create_math_tools()

@app.on_event("startup")
def run_guru_migration_on_startup():
    """One-time migration of legacy guru chunks into vector DB."""
    try:
        result = migrate_json_to_vector_db()
        print(f"GURU MIGRATION: migrated={result.get('migrated')} skipped={result.get('skipped')} errors={result.get('errors')}")
    except Exception as e:
        print(f"GURU MIGRATION ERROR: {e}")

# Example endpoint to use the recommendation engine
@app.get("/api/recommendation")
async def get_recommendation(risk: str = Query(...), tax_regime: str = Query(...)):
    recommendation = wealth_advisor.recommend_investment(risk, tax_regime)
    elss_navs = await mf_api.get_elss_navs()
    sip_navs = await mf_api.get_sip_navs()
    
    # Example calculations (adjust parameters as needed)
    ppf_example = calculators.calculate_ppf(10000, 15)  # 10k annual deposit for 15 years
    sip_example = calculators.calculate_sip(1000, 120, 0.12)  # 1k monthly for 10 years at 12% return
    
    return {
        "recommendation": recommendation,
        "elss_navs": elss_navs,
        "sip_navs": sip_navs,
        "ppf_example_maturity": ppf_example,
        "sip_example_maturity": sip_example
    }

@app.get("/ai/calculate-projections")
def calculate_projections(
    monthly_amount: float = Query(...),
    years: float = Query(...),
    annual_return: float = Query(12.0),
    annual_amount: float = Query(...),
    interest_rate: float = Query(7.1),
):
    """
    Calculate SIP and PPF projections.
    """
    sip_result = calculate_sip(monthly_amount, years, annual_return)
    ppf_result = calculate_ppf(annual_amount, years, interest_rate)
    return {
        "sip": {
            "maturity_amount": sip_result.get("maturity_amount", 0.0),
            "total_interest": sip_result.get("total_interest", 0.0),
            "total_invested": sip_result.get("total_invested", 0.0),
        },
        "ppf": {
            "maturity_amount": ppf_result.get("maturity_amount", 0.0),
            "total_interest": ppf_result.get("total_interest", 0.0),
            "total_invested": ppf_result.get("total_invested", 0.0),
        },
    }

# Authentication model
class AuthModel(BaseModel):
    token: str

# Transaction model for validation
class TransactionModel(BaseModel):
    amount: float
    receiver: str
    sender: Optional[str] = "Self"
    date: Optional[str] = None
    time: Optional[str] = "00:00"
    transaction_id: Optional[str] = None
    category: Optional[str] = None
    ai_confidence: Optional[float] = 0.5
    corrected: Optional[bool] = False

class MentorAdviceRequest(BaseModel):
    user_query: str

# Authentication dependency
def get_current_user(authorization: str = Header(...)):
    """Extract and verify user from JWT token"""
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization header")
    
    token = authorization.split(" ")[1]
    
    # Debug log
    # print(f"Verifying token: {token[:10]}...")
    
    try:
        user = verify_user_token(token)
    except Exception as e:
        print(f"AUTH ERROR: {e}")
        raise HTTPException(status_code=500, detail="Authentication system error. Check backend logs.")

    if not user:
        raise HTTPException(status_code=401, detail="Invalid token or session expired")
    
    # Fix: Ensure we return a dictionary or object compatible with accessing ['id']
    # The Supabase User object has an 'id' attribute, but pydantic might expect a dict
    if hasattr(user, 'id'):
        return {"id": user.id, "email": user.email}
    return user



# IMPORTANT: Create the folders if they don't exist
os.makedirs("temp", exist_ok=True)
os.makedirs("data/reports", exist_ok=True)

# Calculate chart paths the same way analytics module does
# Get the project root (assuming main.py is in backend/)
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(BACKEND_DIR)
DATA_DIR = os.path.join(PROJECT_ROOT, 'data')
REPORTS_DIR = os.path.join(DATA_DIR, 'reports')
os.makedirs(REPORTS_DIR, exist_ok=True)

CHART_PATH_BAR = os.path.join(REPORTS_DIR, 'total_spending_by_category_bar_chart.png')
CHART_PATH_LINE = os.path.join(REPORTS_DIR, 'monthly_spending_trend_line_chart.png')

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # For testing, allow all; change to localhost:3000 later
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health():
    env_ok = {
        "SUPABASE_URL": bool(os.getenv("SUPABASE_URL")),
        "SUPABASE_SERVICE_KEY": bool(os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_KEY") or os.getenv("SUPABASE_ANON_KEY")),
        "GOOGLE_API_KEY": bool(os.getenv("GOOGLE_API_KEY")),
        "OCR_SPACE_API_KEY": bool(os.getenv("OCR_SPACE_API_KEY")),
        "SPLITWISE_CLIENT_ID": bool(os.getenv("SPLITWISE_CLIENT_ID")),
        "SPLITWISE_CLIENT_SECRET": bool(os.getenv("SPLITWISE_CLIENT_SECRET")),
    }
    paths_ok = {
        "reports_dir": os.path.exists(REPORTS_DIR),
        "temp_dir": os.path.exists(os.path.join(PROJECT_ROOT, "temp")),
        "data_dir": os.path.exists(DATA_DIR),
    }
    return {"status": "ok", "env": env_ok, "paths": paths_ok}
@app.post("/chat")
async def chat(data: dict, current_user: dict = Depends(get_current_user)):
    try:
        msg = data.get("message", "")
        guru_preference = data.get("guru_preference")
        if not msg:
            raise ValueError("Empty message")
        response = chat_with_advisor(msg, current_user["id"], guru_preference=guru_preference)
        return {"response": response}
    except Exception as e:
        print(f"CHAT ERROR: {e}") # This prints the error in your terminal
        return {"response": "The advisor is temporarily unavailable. Check terminal for errors."}

@app.post("/ai/mentor-advice")
async def mentor_advice(payload: MentorAdviceRequest, authorization: Optional[str] = Header(None)):
    """Return mentor-style advice based on financial summary + guru snippets."""
    user_id = None
    if authorization:
        if not authorization.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Invalid authorization header")
        token = authorization.split(" ")[1]

        try:
            user = verify_user_token(token)
        except Exception as e:
            print(f"MENTOR AUTH ERROR: {e}")
            raise HTTPException(status_code=500, detail="Authentication system error.")

        if not user:
            raise HTTPException(status_code=401, detail="Invalid token or session expired")

        user_id = user["id"] if isinstance(user, dict) else getattr(user, "id", None)
        if not user_id:
            raise HTTPException(status_code=401, detail="Unable to resolve user id")
    else:
        # Testing mode: default user id for Swagger without token
        user_id = "b7f7b030-2095-407e-997f-bfd6308cd3dc"

    user_query = (payload.user_query or "").strip()
    if not user_query:
        raise HTTPException(status_code=400, detail="user_query is required")

    financial_summary = get_financial_summary(user_id)
    guru_snippets = query_guru_advice(user_query, user_id)
    if not guru_snippets:
        guru_snippets = query_guru_advice(user_query, "9e52cb5e-38bb-41b0-9878-ab70e0b842e6")

    snippets_text = "\n".join(guru_snippets) if guru_snippets else "None"

    system_prompt = (
        "System: You are an elite, blunt Financial Mentor.\n"
        f"User Spending Facts: {financial_summary}\n"
        f"Expert Guru Wisdom: {snippets_text}\n"
        f"User Question: {user_query}\n\n"
        "TONE RULES:\n"
        "- If the user says 'Hi', 'Hello', or 'How are you', respond warmly and briefly.\n"
        "- If the user asks about money, taxes, or logic, switch to a Blunt, Elite Financial Mentor voice.\n\n"
        "FORMAT RULES (STRICT):\n"
        "- NO bulky paragraphs. Every section must be separated by whitespace.\n"
        "- Use '###' for main section headings.\n"
        "- Use '*' or '-' for actionable steps or lists.\n"
        "- Use **bold** for specific numbers or critical warnings.\n"
        "- Use blockquotes (>) for expert quotes or 'Guru Wisdom'.\n"
        "- Use single newlines for bullet points and double newlines only between major sections.\n"
        "- Do not return JSON. Return only Markdown-formatted text.\n\n"
        "TASK:\n"
        "Provide a 3-step actionable plan. Highlight the \"Uncategorized\" spending (~INR 12.9k) "
        "if it dominates the budget. Be direct.\n\n"
        "MATH POLICY:\n"
        "You are strictly forbidden from doing calculations yourself. "
        "If any calculation is required, extract inputs (amount, rate, time, etc.), "
        "call a math_engine tool, and ONLY summarize tool outputs."
    )

    try:
        mentor_llm = get_llm(tools=math_tools)
        mentor_agent = create_agent(
            model=mentor_llm,
            tools=math_tools,
            system_prompt=system_prompt,
        )
        response = mentor_agent.invoke({"messages": [("user", user_query)]})
        response = response["messages"][-1]
        try:
            save_chat_message(user_id, "user", user_query)
            save_chat_message(user_id, "ai", response.text)
        except Exception as save_err:
            print(f"CHAT HISTORY SAVE ERROR: {save_err}")

        return {"response": response.text}
    except Exception as e:
        print(f"MENTOR ADVICE ERROR: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate mentor advice")


@app.get("/ai/chat-history")
def chat_history(current_user: dict = Depends(get_current_user)):
    """Fetch the last 50 mentor chat messages for the authenticated user."""
    try:
        rows = get_chat_history(current_user["id"], limit=50)
        # Return in chronological order (oldest -> newest)
        messages = [
            {
                "role": row.get("role"),
                "text": row.get("message"),
                "created_at": row.get("created_at"),
            }
            for row in reversed(rows)
        ]
        return {"messages": messages}
    except Exception as e:
        print(f"CHAT HISTORY ERROR: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch chat history")

@app.post("/upload")
async def upload(
    file: UploadFile,
    password: Optional[str] = Form(None),
    current_user: dict = Depends(get_current_user)
):
    """Extract transaction data from receipt/statement but DO NOT save it"""
    from tools.ocr_processor import parse_transaction
    from tools.receipt_validation import (
        ALLOWED_TYPES,
        OCRError,
        classify_document_type,
        flatten_pydantic_error,
    )
    try:
        from pydantic.v1 import ValidationError
    except Exception:  # pragma: no cover
        from pydantic import ValidationError
    
    # Use absolute path for temp file
    BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
    PROJECT_ROOT = os.path.dirname(BACKEND_DIR)
    TEMP_DIR = os.path.join(PROJECT_ROOT, "temp")
    os.makedirs(TEMP_DIR, exist_ok=True)
    path = os.path.join(TEMP_DIR, file.filename)
    try:
        with open(path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        if file.filename.lower().endswith(".pdf"):
            # PDF processing with password support
            from tools.statement_processor import unlock_pdf
            
            # Try to unlock PDF first
            unlocked_success, result = unlock_pdf(path, password)
            
            if not unlocked_success:
                if result == "Password Required":
                    return {
                        "status": "PDF requires password",
                        "requires_password": True,
                        "success": False,
                        "extracted_data": None
                    }
                else:
                    return {
                        "status": f"❌ Failed to process PDF: {result}",
                        "requires_password": False,
                        "success": False,
                        "extracted_data": None
                    }
            
            # PDF unlocked successfully, process it directly without confirmation
            try:
                unlocked_pdf_path = result  # This is the path to the unlocked PDF
                result_message = process_statement_tool(unlocked_pdf_path, current_user["id"])
                
                # Clean up temp unlocked file
                try:
                    os.remove(unlocked_pdf_path)
                    print(f"✅ Cleaned up temp PDF: {unlocked_pdf_path}")
                except Exception as cleanup_error:
                    print(f"⚠️ Warning: Could not clean up temp PDF: {cleanup_error}")
                
                # Clean up original uploaded PDF file
                try:
                    os.remove(path)
                    print(f"✅ Cleaned up original PDF: {path}")
                except Exception as cleanup_error:
                    print(f"⚠️ Warning: Could not clean up original PDF: {cleanup_error}")
                
                return {
                    "status": result_message,
                    "requires_password": False,
                    "success": True,
                    "extracted_data": None
                }
            except Exception as e:
                print(f"PDF PROCESSING ERROR: {e}")
                return {
                    "status": f"❌ Error processing PDF statement: {str(e)}",
                    "requires_password": False,
                    "success": False,
                    "error": "OCR_FAILED",
                    "message": "OCR failed to read the image. Please try a clearer upload.",
                    "extracted_data": None
                }
        else:
            # Validate supported image types up-front (PDF handled above)
            allowed_exts = {".png", ".jpg", ".jpeg"}
            _, ext = os.path.splitext((file.filename or "").lower())
            if ext not in allowed_exts:
                err = OCRError.invalid_file()
                try:
                    if os.path.exists(path):
                        os.remove(path)
                except Exception:
                    pass
                return {
                    "success": False,
                    "requires_password": False,
                    "extracted_data": None,
                    "error": err.code,
                    "message": err.message,
                    "status": err.message,
                }

            # Extract data using OCR (but don't save)
            extracted = parse_transaction(path)
            
            # Clean up temp image file after OCR
            try:
                os.remove(path)
                print(f"✅ Cleaned up temp image: {path}")
            except Exception as cleanup_error:
                print(f"⚠️ Warning: Could not clean up temp image: {cleanup_error}")
            
            is_manual_fix_required = False
            document_type = "unknown"
            if extracted:
                raw_text = extracted.pop("raw_text", "") or ""
                document_type = classify_document_type(file_name=file.filename or "", ocr_text=raw_text)
                if document_type not in ALLOWED_TYPES:
                    err = OCRError.invalid_image_type()
                    return {
                        "success": False,
                        "requires_password": False,
                        "extracted_data": None,
                        "error": err.code,
                        "message": err.message,
                        "document_type": document_type,
                        "allowed_types": ALLOWED_TYPES,
                        "status": err.message,
                    }

                # Normalize "Not found" to nulls so the frontend can prompt manual fixes.
                for key in ("amount", "date", "time"):
                    if extracted.get(key) in (None, "Not found"):
                        extracted[key] = None

                is_manual_fix_required = any(extracted.get(k) in (None, "") for k in ("amount", "date", "time"))

                # Low-confidence fields should still proceed to confirmation (no hard error).
                confidence = extracted.get("confidence") or {}
                try:
                    amount_conf = float(confidence.get("amount", 1.0) or 0.0)
                    date_conf = float(confidence.get("date", 1.0) or 0.0)
                    time_conf = float(confidence.get("time", 1.0) or 0.0)
                except Exception:
                    amount_conf, date_conf, time_conf = 0.0, 0.0, 0.0
                if amount_conf < 0.6 or date_conf < 0.6 or time_conf < 0.6:
                    is_manual_fix_required = True

            if not extracted:
                return {
                    "status": "❌ OCR failed to read the image",
                    "requires_password": False,
                    "success": False,
                    "error": "OCR_FAILED",
                    "message": "OCR failed to read the image. Please try a clearer upload.",
                    "extracted_data": None
                }
            
            # Return extracted data for user confirmation
            return {
                "status": "✅ Data extracted successfully. Please review and confirm.",
                "requires_password": False,
                "success": True,
                "is_manual_fix_required": is_manual_fix_required,
                "document_type": document_type,
                "allowed_types": ALLOWED_TYPES,
                "extracted_data": extracted
            }
    except OCRError as e:
        print(f"UPLOAD OCR ERROR: {e}")
        try:
            if os.path.exists(path):
                os.remove(path)
        except Exception:
            pass
        return {
            "success": False,
            "requires_password": False,
            "extracted_data": None,
            "error": e.code,
            "message": e.message,
            "status": e.message,
        }
    except ValidationError as e:
        print(f"UPLOAD VALIDATION ERROR: {e}")
        try:
            if os.path.exists(path):
                os.remove(path)
        except Exception:
            pass
        flat = flatten_pydantic_error(e)
        return {
            "success": False,
            "requires_password": False,
            "extracted_data": None,
            "error": "VALIDATION_ERROR",
            "message": flat,
            "status": flat,
        }
    except Exception as e:
        print(f"UPLOAD ERROR: {e}")
        # Clean up temp file on error
        try:
            if os.path.exists(path):
                os.remove(path)
                print(f"✅ Cleaned up temp file on error: {path}")
        except:
            pass
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/transactions/confirm")
async def confirm_transaction(data: dict, current_user: dict = Depends(get_current_user)):
    """Save a confirmed transaction after user review"""
    try:
        try:
            tx = TransactionConfirmModel.parse_obj(data)
        except Exception as e:
            # Pydantic ValidationError (and any other parse failures) become a 400 with details.
            raise HTTPException(status_code=400, detail=str(e))

        transaction_data = tx.to_db_dict()
        
        # Save to Supabase
        result = save_transaction(current_user["id"], transaction_data)
        
        # Refresh charts
        refresh_analysis(current_user["id"])
        
        return {
            "status": "Transaction saved successfully",
            "success": True,
            "transaction_id": result["id"]
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"CONFIRM TRANSACTION ERROR: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/reports/{chart_id}")
def get_chart(chart_id: str, current_user: dict = Depends(get_current_user)):
    # Mapping to actual chart paths (using absolute paths)
    user_id = current_user["id"]
    files = {
        "bar": os.path.join(REPORTS_DIR, f'{user_id}_total_spending_by_category_bar_chart.png'),
        "line": os.path.join(REPORTS_DIR, f'{user_id}_monthly_spending_trend_line_chart.png'),
        "pie": os.path.join(REPORTS_DIR, f'{user_id}_spending_distribution_pie_chart.png'),
        "merchants": os.path.join(REPORTS_DIR, f'{user_id}_top_merchants_chart.png')
    }
    file_path = files.get(chart_id)
    
    # Debug: Print path information
    print(f"Requested chart: {chart_id} for user {user_id}")
    print(f"Chart path: {file_path}")
    print(f"Path exists: {os.path.exists(file_path) if file_path else 'N/A'}")
    
    # If chart doesn't exist, we can't auto-generate without user context easily in GET
    # So we skip auto-generation or we'd need to pass user_id in query params
    if not file_path or not os.path.exists(file_path):
        print(f"Chart {chart_id} not found at {file_path}")
        # Try to regenerate if missing
        refresh_analysis(user_id)
    
    # Check again after generation
    if file_path and os.path.exists(file_path):
        print(f"Serving chart from: {file_path}")
        return FileResponse(file_path, media_type="image/png")
    
    return {"error": f"Chart {chart_id} not available"}

@app.post("/reports/refresh")
def refresh_charts(current_user: dict = Depends(get_current_user)):
    """Manually refresh/generate charts"""
    try:
        success = refresh_analysis(current_user["id"])
        if success:
            return {"status": "Charts refreshed successfully"}
        return {"status": "No data available to generate charts"}
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"error": str(e)}
        )

@app.get("/expenses")
def get_expenses(current_user: dict = Depends(get_current_user)):
    """Get all transactions for the authenticated user"""
    try:
        transactions = get_user_transactions(current_user["id"])
        
        # Transform to frontend format
        expenses = []
        for idx, tx in enumerate(transactions):
            expenses.append({
                "id": tx["id"],
                "date": tx["date"],
                "time": tx["time"],
                "sender": tx["sender"],
                "receiver": tx["receiver"],
                "transaction_id": tx["transaction_id"],
                "category": tx["category"],
                "amount": float(tx["amount"])
            })
        
        return expenses
    except Exception as e:
        print(f"GET EXPENSES ERROR: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/transactions/import-csv")
async def import_transactions_csv(
    file: UploadFile,
    current_user: dict = Depends(get_current_user)
):
    """Import transactions from a CSV file."""
    try:
        if not file.filename.lower().endswith(".csv"):
            raise HTTPException(status_code=400, detail="Please upload a CSV file.")

        BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
        PROJECT_ROOT = os.path.dirname(BACKEND_DIR)
        TEMP_DIR = os.path.join(PROJECT_ROOT, "temp")
        os.makedirs(TEMP_DIR, exist_ok=True)
        temp_path = os.path.join(TEMP_DIR, file.filename)

        with open(temp_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        df = pd.read_csv(temp_path)
        if df.empty:
            raise HTTPException(status_code=400, detail="CSV file is empty.")

        # Normalize columns
        col_map = {}
        for col in df.columns:
            key = str(col).strip().lower()
            col_map[key] = col

        def find_col(options):
            for opt in options:
                if opt in col_map:
                    return col_map[opt]
            return None

        amount_col = find_col(["amount", "amt", "value", "total"])
        receiver_col = find_col(["receiver", "payee", "merchant", "description", "to"])
        date_col = find_col(["date", "txn_date", "transaction_date"])
        time_col = find_col(["time", "txn_time", "transaction_time"])
        sender_col = find_col(["sender", "from", "payer"])
        category_col = find_col(["category", "cat"])
        txn_id_col = find_col(["transaction_id", "txn_id", "id"])

        if amount_col is None or receiver_col is None:
            raise HTTPException(
                status_code=400,
                detail="CSV must include at least Amount and Receiver/Description columns."
            )

        def clean_amount(value):
            if value is None:
                return 0.0
            if isinstance(value, (int, float)):
                return float(value)
            text = str(value)
            text = re.sub(r"[^0-9.\-]", "", text)
            try:
                return float(text)
            except Exception:
                return 0.0

        inserted = 0
        errors = []

        for idx, row in df.iterrows():
            try:
                amount = clean_amount(row.get(amount_col))
                receiver = str(row.get(receiver_col) or "Unknown").strip()
                if amount <= 0 or not receiver:
                    raise ValueError("Missing amount or receiver")

                date_val = row.get(date_col) if date_col else None
                time_val = row.get(time_col) if time_col else None
                sender_val = row.get(sender_col) if sender_col else "Self"
                category_val = row.get(category_col) if category_col else "Other"
                txn_id_val = row.get(txn_id_col) if txn_id_col else None

                date_str = None
                if date_val:
                    try:
                        if isinstance(date_val, (datetime, date)):
                            date_str = date_val.strftime("%Y-%m-%d")
                        else:
                            date_str = str(date_val)
                    except Exception:
                        date_str = None
                if not date_str:
                    date_str = datetime.now().strftime("%Y-%m-%d")

                time_str = "00:00"
                if time_val:
                    time_str = str(time_val)

                transaction_data = {
                    "amount": float(amount),
                    "receiver": receiver,
                    "sender": str(sender_val) if sender_val else "Self",
                    "date": date_str,
                    "time": time_str,
                    "transaction_id": str(txn_id_val) if txn_id_val else None,
                    "category": str(category_val) if category_val else "Other",
                    "ai_confidence": 1.0,
                    "corrected": True
                }

                save_transaction(current_user["id"], transaction_data)
                inserted += 1
            except Exception as row_error:
                errors.append({"row": int(idx) + 1, "error": str(row_error)})

        try:
            os.remove(temp_path)
        except Exception:
            pass

        refresh_analysis(current_user["id"])

        return {
            "status": "imported",
            "inserted": inserted,
            "errors": errors
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"CSV IMPORT ERROR: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/guru/upload")
async def upload_guru_content(
    file: UploadFile,
    guru: str = Form(...),
    title: Optional[str] = Form(None),
    current_user: dict = Depends(get_current_user)
):
    """Upload financial books/articles for guru-based advice."""
    allowed = {'.pdf', '.txt', '.md'}
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in allowed:
        raise HTTPException(status_code=400, detail="Unsupported file type. Use PDF, TXT, or MD.")

    BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
    PROJECT_ROOT = os.path.dirname(BACKEND_DIR)
    TEMP_DIR = os.path.join(PROJECT_ROOT, "temp")
    os.makedirs(TEMP_DIR, exist_ok=True)
    temp_path = os.path.join(TEMP_DIR, file.filename)

    try:
        with open(temp_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        record = ingest_guru_document(
            user_id=current_user["id"],
            guru=guru,
            file_path=temp_path,
            title=title
        )

        return {
            "status": "Uploaded",
            "success": True,
            "document": record
        }
    except Exception as e:
        print(f"GURU UPLOAD ERROR: {e}")
        try:
            if os.path.exists(temp_path):
                os.remove(temp_path)
        except Exception:
            pass
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/guru/content")
def list_guru_content(
    guru: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """List uploaded guru documents for the user."""
    try:
        records = list_guru_documents(current_user["id"], guru=guru)
        return {"documents": records}
    except Exception as e:
        print(f"GURU LIST ERROR: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/budget/limits")
def get_budget_limits_endpoint(current_user: dict = Depends(get_current_user)):
    """Get budget limits for the authenticated user."""
    try:
        limits = get_budget_limits(current_user["id"])
        return {"source": "db", "limits": limits}
    except Exception as e:
        print(f"GET BUDGET LIMITS DB ERROR: {e}")
        try:
            limits = load_budget_limits()
            return {"source": "local", "limits": limits}
        except Exception as local_e:
            print(f"GET BUDGET LIMITS LOCAL ERROR: {local_e}")
            raise HTTPException(status_code=500, detail=str(local_e))

@app.post("/budget/limits")
def set_budget_limits_endpoint(data: dict, current_user: dict = Depends(get_current_user)):
    """Set budget limits (category -> amount)."""
    try:
        if not isinstance(data, dict):
            raise HTTPException(status_code=400, detail="Budget payload must be a JSON object")

        cleaned = {}
        for key, value in data.items():
            category = str(key).strip()
            if not category:
                continue
            try:
                amount = float(value)
            except (TypeError, ValueError):
                raise HTTPException(status_code=400, detail=f"Invalid amount for category '{category}'")
            if amount < 0:
                raise HTTPException(status_code=400, detail=f"Amount must be >= 0 for category '{category}'")
            cleaned[category] = amount

        try:
            saved = set_budget_limits(current_user["id"], cleaned)
            return {"status": "Budget limits saved", "source": "db", "limits": saved}
        except Exception as db_error:
            print(f"SET BUDGET LIMITS DB ERROR: {db_error}")
            save_budget_limits(cleaned)
            return {"status": "Budget limits saved", "source": "local", "limits": cleaned}
    except HTTPException:
        raise
    except Exception as e:
        print(f"SET BUDGET LIMITS ERROR: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/budget/summary")
def get_budget_summary(current_user: dict = Depends(get_current_user)):
    """Get budget adherence summary for the authenticated user."""
    try:
        df = load_and_clean_data(current_user["id"])
        try:
            limits = get_budget_limits(current_user["id"])
            summary = calculate_budget_adherence(df, budget_limits=limits)
            return {"source": "db", "summary": summary}
        except Exception as db_error:
            print(f"GET BUDGET SUMMARY DB ERROR: {db_error}")
            limits = load_budget_limits()
            summary = calculate_budget_adherence(df, budget_limits=limits)
            return {"source": "local", "summary": summary}
    except Exception as e:
        print(f"GET BUDGET SUMMARY ERROR: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/insights/patterns")
def get_spending_patterns_endpoint(current_user: dict = Depends(get_current_user)):
    """Basic spending pattern analysis for the authenticated user."""
    try:
        df = load_and_clean_data(current_user["id"])
        patterns = get_spending_patterns(df)
        try:
            limits = get_budget_limits(current_user["id"])
        except Exception:
            limits = {}
        recommendations = build_budget_recommendations(df, budget_limits=limits)
        patterns["recommendations"] = recommendations
        return patterns
    except Exception as e:
        print(f"SPENDING PATTERNS ERROR: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/user/financial-stats")
def get_financial_stats(current_user: dict = Depends(get_current_user)):
    """Return basic financial stats for the authenticated user."""
    try:
        user_id = current_user["id"]
        # Call existing summary logic for consistency (string result not used directly here).
        _ = get_financial_summary(user_id)

        transactions = get_user_transactions(user_id) or []
        total_spent = 0.0
        uncategorized_total = 0.0
        for tx in transactions:
            try:
                amt = float(tx.get("amount") or 0)
            except Exception:
                amt = 0.0
            total_spent += amt
            category = str(tx.get("category") or "").strip().lower()
            if category == "uncategorized":
                uncategorized_total += amt

        return {
            "uncategorized_total": round(uncategorized_total, 2),
            "total_spent": round(total_spent, 2)
        }
    except Exception as e:
        print(f"FINANCIAL STATS ERROR: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/insights/predictive")
def get_predictive_insights_endpoint(
    current_balance: Optional[float] = None,
    scenario_category: str = "Transfer",
    scenario_percentage: float = 20.0,
    current_user: dict = Depends(get_current_user),
):
    """Predictive financial insights (burn/runway, forecasts, what-if, anomalies)."""
    try:
        df = load_and_clean_data(current_user["id"])
        return build_predictive_financial_engine(
            df,
            current_balance=current_balance,
            scenario_category=scenario_category,
            scenario_percentage=scenario_percentage,
        )
    except Exception as e:
        print(f"PREDICTIVE INSIGHTS ERROR: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/expenses/{expense_id}")
def delete_expense(expense_id: int, current_user: dict = Depends(get_current_user)):
    """Delete a transaction for the authenticated user"""
    try:
        success = delete_transaction(expense_id, current_user["id"])
        if not success:
            raise HTTPException(status_code=404, detail="Transaction not found")
        
        # Refresh charts
        refresh_analysis(current_user["id"])
        
        return {"status": "Expense deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        print(f"DELETE EXPENSE ERROR: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/splitwise/groups")
def splitwise_groups(current_user: dict = Depends(get_current_user)):
    try:
        token_row = get_splitwise_token(current_user["id"])
        token = token_row.get("access_token") if token_row else None
        if not token:
            raise HTTPException(status_code=400, detail="Splitwise not connected for this user.")
        return get_groups(token=token)
    except Exception as e:
        print(f"SPLITWISE GROUPS ERROR: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/splitwise/expenses")
def splitwise_expenses(group_id: Optional[int] = None, limit: int = 20, offset: int = 0, current_user: dict = Depends(get_current_user)):
    try:
        token_row = get_splitwise_token(current_user["id"])
        token = token_row.get("access_token") if token_row else None
        if not token:
            raise HTTPException(status_code=400, detail="Splitwise not connected for this user.")
        return splitwise_get_expenses(group_id=group_id, limit=limit, offset=offset, token=token)
    except Exception as e:
        print(f"SPLITWISE EXPENSES ERROR: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/splitwise/group/{group_id}")
def splitwise_group(group_id: int, current_user: dict = Depends(get_current_user)):
    try:
        token_row = get_splitwise_token(current_user["id"])
        token = token_row.get("access_token") if token_row else None
        if not token:
            raise HTTPException(status_code=400, detail="Splitwise not connected for this user.")
        return get_group(group_id, token=token)
    except Exception as e:
        print(f"SPLITWISE GROUP ERROR: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/splitwise/me")
def splitwise_me(current_user: dict = Depends(get_current_user)):
    try:
        token_row = get_splitwise_token(current_user["id"])
        token = token_row.get("access_token") if token_row else None
        if not token:
            raise HTTPException(status_code=400, detail="Splitwise not connected for this user.")
        return splitwise_current_user(token=token)
    except Exception as e:
        print(f"SPLITWISE ME ERROR: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/splitwise/group-summary/{group_id}")
def splitwise_group_summary(group_id: int, limit: int = 50, current_user: dict = Depends(get_current_user)):
    try:
        token_row = get_splitwise_token(current_user["id"])
        token = token_row.get("access_token") if token_row else None
        if not token:
            raise HTTPException(status_code=400, detail="Splitwise not connected for this user.")
        user_map = {}
        if str(group_id) == "0":
            expenses = splitwise_get_expenses(limit=limit, offset=0, token=token).get("expenses", [])
            me = splitwise_current_user(token=token).get("user") or {}
            if me.get("id"):
                user_map[str(me.get("id"))] = me.get("name") or me.get("email") or "Me"
            group_info = None
        else:
            expenses = splitwise_get_expenses(group_id=group_id, limit=limit, offset=0, token=token).get("expenses", [])
            group_info = get_group(group_id, token=token).get("group")
            if group_info:
                for member in group_info.get("members", []) or []:
                    member_id = member.get("id")
                    name = (
                        member.get("name")
                        or f"{member.get('first_name', '')} {member.get('last_name', '')}".strip()
                        or member.get("email")
                    )
                    if member_id:
                        user_map[str(member_id)] = name or "Member"
                for membership in group_info.get("memberships", []) or []:
                    member_id = membership.get("user_id") or (membership.get("user") or {}).get("id")
                    name = (membership.get("user") or {}).get("name") or (membership.get("user") or {}).get("email")
                    if member_id:
                        user_map[str(member_id)] = name or "Member"
        summary = summarize_group_expenses(expenses, user_map=user_map)
        return {"group": group_info, "summary": summary}
    except Exception as e:
        print(f"SPLITWISE SUMMARY ERROR: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/splitwise/oauth/start")
def splitwise_oauth_start(redirect_uri: str, current_user: dict = Depends(get_current_user)):
    """Return Splitwise OAuth authorization URL."""
    try:
        state = current_user["id"]
        url = build_authorize_url(redirect_uri=redirect_uri, state=state)
        return {"authorize_url": url}
    except Exception as e:
        print(f"SPLITWISE OAUTH START ERROR: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/splitwise/oauth/exchange")
def splitwise_oauth_exchange(data: dict, current_user: dict = Depends(get_current_user)):
    """Exchange OAuth code for token and store for user."""
    try:
        code = data.get("code")
        redirect_uri = data.get("redirect_uri")
        if not code or not redirect_uri:
            raise HTTPException(status_code=400, detail="Missing code or redirect_uri.")
        token_data = exchange_code_for_token(code=code, redirect_uri=redirect_uri)
        access_token = token_data.get("access_token")
        token_type = token_data.get("token_type", "bearer")
        if not access_token:
            raise HTTPException(status_code=400, detail="No access_token returned by Splitwise.")
        saved = set_splitwise_token(current_user["id"], access_token, token_type=token_type)
        return {"status": "connected", "token": {"token_type": token_type}, "saved": bool(saved)}
    except HTTPException:
        raise
    except Exception as e:
        print(f"SPLITWISE OAUTH EXCHANGE ERROR: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/splitwise/expenses")
def splitwise_create_expense(data: dict, current_user: dict = Depends(get_current_user)):
    """Create a Splitwise expense for the authenticated user."""
    try:
        token_row = get_splitwise_token(current_user["id"])
        token = token_row.get("access_token") if token_row else None
        if not token:
            raise HTTPException(status_code=400, detail="Splitwise not connected for this user.")

        description = data.get("description")
        cost = data.get("cost")
        group_id = data.get("group_id")
        paid_by = data.get("paid_by")
        split = data.get("split")

        if not description or cost is None or paid_by is None or split is None:
            raise HTTPException(status_code=400, detail="Missing required fields.")

        # Build Splitwise API payload
        payload = {
            "description": description,
            "cost": str(cost),
        }
        # group_id is optional in Splitwise (0 or null = non-group)
        if group_id is not None and str(group_id) != "0":
            payload["group_id"] = int(group_id)
            try:
                group_info = get_group(int(group_id), token=token).get("group")
                if group_info and group_info.get("currency_code"):
                    payload["currency_code"] = group_info.get("currency_code")
            except Exception:
                pass

        # Merge paid_by and split into a single user list
        user_ids = set([str(u) for u in paid_by.keys()] + [str(u) for u in split.keys()])
        idx = 0
        for user_id in user_ids:
            payload[f"users__{idx}__user_id"] = int(user_id)
            payload[f"users__{idx}__paid_share"] = str(paid_by.get(user_id) or paid_by.get(int(user_id), 0) or 0)
            payload[f"users__{idx}__owed_share"] = str(split.get(user_id) or split.get(int(user_id), 0) or 0)
            idx += 1

        result = create_expense(payload, token=token)
        if result.get("errors"):
            raise HTTPException(status_code=400, detail=str(result.get("errors")))
        return result
    except HTTPException:
        raise
    except Exception as e:
        print(f"SPLITWISE CREATE EXPENSE ERROR: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/tax-saving-plan")
async def tax_saving_plan(data: dict, current_user: dict = Depends(get_current_user)):
    """Generate tax saving recommendations for the authenticated user."""
    try:
        annual_income = data.get("annual_income")
        existing_80c = data.get("existing_80c", 0)
        
        if annual_income is None:
            raise HTTPException(status_code=400, detail="annual_income is required")
        
        try:
            annual_income = float(annual_income)
            existing_80c = float(existing_80c)
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="Invalid numeric values")
        
        recommendation_payload = get_tax_recommendations(annual_income, existing_80c)
        recommendation = recommendation_payload.get("tax_saving_recommendation")

        engine = IndiaTaxEngine()
        tax_new = engine.calculate_new_regime_tax(annual_income)
        tax_old = engine.calculate_old_regime_tax(annual_income, existing_80c, 0)
        potential_savings = max(0, tax_old - tax_new)
        investment_gap_80c = max(0, 150000 - existing_80c)
        
        suggestions = []
        if investment_gap_80c > 0:
            suggestions.append(f"Invest ₹{engine.format_inr(investment_gap_80c)} in ELSS or PPF under Section 80C")
        suggestions.append("Consider NPS under Section 80CCD(1B) for additional ₹50,000 deduction")
        if annual_income <= 1275000:
            suggestions.append("You may qualify for Section 87A rebate in New Regime")
        
        return {
            "recommendation": recommendation,
            "tax_new_regime": tax_new,
            "tax_old_regime": tax_old,
            "potential_savings": potential_savings,
            "investment_gap_80c": investment_gap_80c if investment_gap_80c > 0 else None,
            "suggestions": suggestions
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"TAX SAVING PLAN ERROR: {e}")
        raise HTTPException(status_code=500, detail=str(e))
