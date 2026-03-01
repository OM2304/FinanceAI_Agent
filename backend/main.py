from fastapi import FastAPI, UploadFile, HTTPException, Form, Depends, Header
from tools.advisor import chat_with_advisor, process_statement_tool
from tools.supabase_db import save_transaction, get_user_transactions, delete_transaction, verify_user_token
from tools.analytics import refresh_analysis
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional
import os
import shutil
import pandas as pd
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
        return {"id": user.id, "email": user.email, "token": token}
    if isinstance(user, dict):
        user["token"] = token
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
        response = chat_with_advisor(
            msg,
            current_user["id"],
            guru_preference=guru_preference,
            user_token=current_user.get("token")
        )
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
                result_message = process_statement_tool(
                    unlocked_pdf_path,
                    current_user["id"],
                    current_user.get("token")
                )
                
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
        result = save_transaction(current_user["id"], transaction_data, current_user.get("token"))
        
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
        transactions = get_user_transactions(current_user["id"], current_user.get("token"))
        
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

@app.delete("/expenses/{expense_id}")
def delete_expense(expense_id: int, current_user: dict = Depends(get_current_user)):
    """Delete a transaction for the authenticated user"""
    try:
        success = delete_transaction(expense_id, current_user["id"], current_user.get("token"))
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
