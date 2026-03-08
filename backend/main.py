from fastapi import FastAPI, UploadFile, HTTPException, Form, Depends, Header
from tools.advisor import chat_with_advisor, process_statement_tool
from tools.guru_content import ingest_guru_document, list_guru_documents
from tools.supabase_db import save_transaction, get_user_transactions, delete_transaction, verify_user_token, get_budget_limits, set_budget_limits, get_splitwise_token, set_splitwise_token
from tools.analytics import refresh_analysis, calculate_budget_adherence, get_spending_patterns, build_budget_recommendations
from tools.data_processor import load_and_clean_data, load_budget_limits, save_budget_limits
from tools.splitwise_client import get_groups, get_expenses as splitwise_get_expenses, get_group, get_current_user as splitwise_current_user, build_authorize_url, exchange_code_for_token, create_expense
from tools.splitwise_analytics import summarize_group_expenses
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional
import os
import shutil
import pandas as pd
import re
from pydantic import BaseModel
from datetime import date, datetime

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

app = FastAPI()

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

@app.post("/upload")
async def upload(
    file: UploadFile,
    password: Optional[str] = Form(None),
    current_user: dict = Depends(get_current_user)
):
    """Extract transaction data from receipt/statement but DO NOT save it"""
    from tools.ocr_processor import parse_transaction
    
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
                    "extracted_data": None
                }
        else:
            # Extract data using OCR (but don't save)
            extracted = parse_transaction(path)
            
            # Clean up temp image file after OCR
            try:
                os.remove(path)
                print(f"✅ Cleaned up temp image: {path}")
            except Exception as cleanup_error:
                print(f"⚠️ Warning: Could not clean up temp image: {cleanup_error}")
            
            if not extracted:
                return {
                    "status": "❌ OCR failed to read the image",
                    "requires_password": False,
                    "success": False,
                    "extracted_data": None
                }
            
            # Return extracted data for user confirmation
            return {
                "status": "✅ Data extracted successfully. Please review and confirm.",
                "requires_password": False,
                "success": True,
                "extracted_data": extracted
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
        # Validate required fields
        amount = data.get("amount")
        receiver = data.get("receiver")
        
        if not amount or not receiver:
            raise HTTPException(status_code=400, detail="Amount and receiver are required")
        
        try:
            amount = float(amount)
            if amount <= 0:
                raise HTTPException(status_code=400, detail="Amount must be greater than 0")
        except (ValueError, TypeError):
            raise HTTPException(status_code=400, detail="Amount must be a valid number")
        
        # Prepare transaction data
        transaction_data = {
            "amount": amount,
            "receiver": receiver,
            "sender": data.get("sender", "Self"),
            "date": data.get("date"),
            "time": data.get("time", "00:00"),
            "transaction_id": data.get("transaction_id"),
            "category": data.get("category"),
            "ai_confidence": data.get("ai_confidence", 0.5),
            "corrected": data.get("corrected", False)
        }
        
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
