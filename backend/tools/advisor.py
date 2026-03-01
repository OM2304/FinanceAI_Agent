import os
import sys
import json
import pandas as pd
from typing import Optional, List

# 1. Get the absolute path of the current file
current_file_path = os.path.abspath(__file__)

# 2. Go up two levels to reach the Project Root (tools -> backend -> Project Root)
project_root = os.path.dirname(os.path.dirname(os.path.dirname(current_file_path)))

# 3. Add the Project Root to Python's search list if it's not already there
if project_root not in sys.path:
    sys.path.insert(0, project_root)

# Now you can safely import from any folder in the root
from data.guru_data import FINANCIAL_GURUS
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain.agents import create_agent
from langchain_core.tools import tool

# Import data processor and analytics
from tools.data_processor import load_and_clean_data, append_new_transaction
from tools.analytics import (
    calculate_budget_adherence, 
    get_spending_by_category, 
    get_top_n_merchants, 
    get_monthly_spending_trend,
    refresh_analysis
)

# ==================================================================
# 2. GLOBAL PROCESSING FUNCTIONS
# ==================================================================

def enrich_transaction_ai(description: str, amount: float) -> dict:
    """
    Uses LLM to clean up the receiver name and categorize the transaction.
    Returns a dict: {"receiver": "Clean Name", "category": "Category"}
    """
    try:
        from langchain_core.messages import HumanMessage
        
        prompt = f"""
        Analyze this bank statement transaction to identify the actual merchant/receiver and category.
        
        Transaction Description: "{description}"
        Amount: {amount}
        
        Task:
        1. Extract the CLEANEST possible receiver/merchant name (remove UPI IDs, bank codes, dates, "UPI/DR/", etc.).
           - Example: "UPI/DR/5701.../PAVNEET/SBIN..." -> "Pavneet"
           - Example: "Pos/Starbucks/12345" -> "Starbucks"
        2. Categorize the transaction into exactly one of these: 
           [Food, Travel, Shopping, Bills, Entertainment, Health, Education, Investment, Rent, Groceries, Transfer, Salary, Other]
        
        Output strictly in JSON format:
        {{
            "receiver": "Clean Name",
            "category": "Category"
        }}
        """
        
        response = llm.invoke([HumanMessage(content=prompt)])
        content = response.content.strip()
        
        # Clean up code blocks if present
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0].strip()
        elif "```" in content:
            content = content.split("```")[1].strip()
            
        return json.loads(content)
    except Exception as e:
        print(f"AI Enrichment Error: {e}")
        # Fallback
        return {"receiver": description[:20], "category": "Uncategorized"}

def process_statement_tool(pdf_path: str, user_id: str, user_token: Optional[str] = None) -> str:
    """Process bank statement PDF -> save transactions -> refresh analytics -> delete PDF"""
    from tools.statement_processor import parse_bank_statement
    from tools.supabase_db import save_transaction
    import time
    
    if not os.path.exists(pdf_path):
        return "❌ PDF file not found."
        
    df = parse_bank_statement(pdf_path)
    if df is None or df.empty:
        return "❌ Failed to parse bank statement or empty."
        
    count = 0
    # Iterate and save
    for _, row in df.iterrows():
        # Normalize keys to lower case for safer access
        row_data = {str(k).lower(): v for k, v in row.to_dict().items()}
        
        # Extract basic fields with fallbacks
        # Added 'transaction reference' and 'details' to fallbacks
        date_val = row_data.get('date', row_data.get('txn date', 'Unknown'))
        
        receiver_raw = row_data.get('description', 
                       row_data.get('particulars', 
                       row_data.get('narration', 
                       row_data.get('transaction reference', 
                       row_data.get('details', 'Unknown')))))
        
        # Amount handling: Check for debit/withdrawal or generic amount
        raw_amount = row_data.get('debit', row_data.get('withdrawal', row_data.get('amount', 0)))
        
        # Clean amount string if needed
        try:
            import math
            if isinstance(raw_amount, str):
                # Remove currency symbols and commas
                clean_amount = raw_amount.replace(',', '').replace('₹', '').strip()
                # Handle empty strings
                if not clean_amount:
                    amount_val = 0
                elif clean_amount.replace('.', '').isdigit():
                     amount_val = float(clean_amount)
                else:
                    amount_val = 0
            else:
                amount_val = float(raw_amount) if raw_amount else 0
                
            # Handle NaN and infinite values
            if math.isnan(amount_val) or math.isinf(amount_val):
                continue  # Skip this transaction
                
        except (ValueError, TypeError):
            continue  # Skip this transaction if amount is invalid
            
        # Skip if amount is 0 or negative
        if amount_val <= 0:
            continue
            
        transaction_id = row_data.get('ref no', row_data.get('cheque/ref no', row_data.get('txn id', row_data.get('ref.no./chq.no.', 'Unknown'))))
        
        # ---------------------------------------------------------
        # AI ENRICHMENT STEP
        # ---------------------------------------------------------
        # Use AI to clean the receiver name and categorize
        enriched = enrich_transaction_ai(str(receiver_raw), amount_val)
        
        data = {
            "date": str(date_val),
            "time": "00:00",
            "sender": "Self",
            "receiver": enriched.get("receiver", str(receiver_raw)),
            "transaction_id": str(transaction_id),
            "category": enriched.get("category", "Uncategorized"),
            "amount": amount_val,
            "ai_confidence": 0.9, 
            "corrected": False
        }
        
        # Save to Supabase instead of CSV
        save_transaction(user_id, data, user_token)
        count += 1
        
    # ✅ Refresh charts for this user
    from tools.analytics import refresh_analysis
    refresh_analysis(user_id)
    
    # ✅ DELETE TEMP PDF
    try:
        os.remove(pdf_path)
    except Exception:
        pass
        
    return f"Statement records saved successfully. Imported {count} transactions."

# ==================================================================
# 1. PATH & API CONFIG
# ==================================================================

# Updated for: backend/tools/advisor.py
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if BASE_DIR not in sys.path:
    sys.path.append(BASE_DIR)

from tools.llm_config import get_llm

llm = get_llm()

# ==================================================================
# 2. TOOLS GENERATOR
# ==================================================================

def create_tools(user_id: str):
    """Creates a list of tools bound to the specific user_id."""
    
    @tool
    def budget_status_check(query: str) -> str:
        """Check spending against budget."""
        df = load_and_clean_data(user_id)
        return json.dumps(calculate_budget_adherence(df), indent=2)

    @tool
    def spending_analytics_tool(query: str) -> str:
        """Category & merchant breakdown."""
        df = load_and_clean_data(user_id)
        return json.dumps({
            "categories": get_spending_by_category(df),
            "top_merchants": get_top_n_merchants(df, n=5)
        }, indent=2)

    @tool
    def analyze_trends_tool(query: str) -> str:
        """Monthly spending trends."""
        df = load_and_clean_data(user_id)
        return json.dumps(get_monthly_spending_trend(df), indent=2)

    @tool
    def process_receipt_tool(image_path: str) -> str:
        """OCR receipt -> save extracted data -> refresh analytics -> delete image"""
        from tools.ocr_processor import (
            ocr_space,
            extract_amount,
            extract_receiver,
            extract_date_time,
            extract_sender,
            extract_transaction_id
        )

        if not os.path.exists(image_path):
            return "❌ Image file not found."

        raw_text = ocr_space(image_path)
        try:
            os.remove(image_path)
        except Exception:
            pass
            
        return (
            f"✅ Receipt processed successfully!\n\n"
            f"💸 Amount: ₹{transaction_data['amount']}\n"
            f"🏪 Receiver: {transaction_data['receiver']}\n"
            f"📅 Date: {transaction_data['date']} {transaction_data['time']}"
        )
        
    @tool
    def process_statement_tool(pdf_path: str, user_id: str, user_token: Optional[str] = None) -> str:
        """Process bank statement PDF -> save transactions -> refresh analytics -> delete PDF"""
        from tools.statement_processor import parse_bank_statement
        from tools.supabase_db import save_transaction
        import time
        
        if not os.path.exists(pdf_path):
            return "❌ PDF file not found."
            
        df = parse_bank_statement(pdf_path)
        if df is None or df.empty:
            return "❌ Failed to parse bank statement or empty."
            
        count = 0
        # Iterate and save
        for _, row in df.iterrows():
            # Normalize keys to lower case for safer access
            row_data = {str(k).lower(): v for k, v in row.to_dict().items()}
            
            # Extract basic fields with fallbacks
            # Note: Bank statement formats vary wildly. This is a best-effort mapping.
            date_val = row_data.get('date', row_data.get('txn date', 'Unknown'))
            
            receiver_val = row_data.get('description', row_data.get('particulars', row_data.get('narration', 'Unknown')))
            
            # Amount handling: Check for debit/withdrawal or generic amount
            raw_amount = row_data.get('debit', row_data.get('withdrawal', row_data.get('amount', 0)))
            
            # Clean amount string if needed
            try:
                if isinstance(raw_amount, str):
                    # Remove currency symbols and commas
                    clean_amount = raw_amount.replace(',', '').replace('₹', '').strip()
                    if clean_amount.replace('.', '').isdigit():
                         amount_val = float(clean_amount)
                    else:
                        amount_val = 0
                else:
                    amount_val = float(raw_amount)
            except (ValueError, TypeError):
                amount_val = 0
                
            # Skip if amount is 0 or negative (unless we want to track refunds, but usually expenses are positive here)
            # If the statement uses negative for debits, we might need abs(). 
            # Assuming positive for now as per typical 'Debit' columns.
            if amount_val <= 0:
                continue
                
            transaction_id = row_data.get('ref no', row_data.get('cheque/ref no', row_data.get('txn id', 'Unknown')))
            
            data = {
                "date": str(date_val),
                "time": "00:00",
                "sender": "Self",
                "receiver": str(receiver_val),
                "transaction_id": str(transaction_id),
                "category": "Uncategorized",
                "amount": amount_val,
                "ai_confidence": 1.0, 
                "corrected": False
            }
            
            # Save to Supabase instead of CSV
            save_transaction(user_id, data, user_token)
            count += 1
            # Small delay to avoid hammering DB if needed, or just proceed
            
        # ✅ Refresh charts for this user
        from tools.analytics import refresh_analysis
        refresh_analysis(user_id)
        
        # ✅ DELETE TEMP PDF
        try:
            os.remove(pdf_path)
        except Exception:
            pass
            
        return f"Statement records saved successfully. Imported {count} transactions."
        
    return [
        budget_status_check,
        spending_analytics_tool,
        analyze_trends_tool,
        process_receipt_tool,
        process_statement_tool
    ]

# ==================================================================
# 3. COMPUTE METRICS & CONTEXT
# ==================================================================

def get_financial_context(user_id: str):
    """
    Fetches user data from Supabase and computes metrics for the system prompt.
    """
    try:
        df = load_and_clean_data(user_id)
    except Exception as e:
        print(f"DEBUG: Error in get_financial_context: {e}")
        # Return fallback context if data loading fails
        return {
            "top_categories": [],
            "savings_rate": 0.0,
            "spending_summary": "Unable to load transaction data. Please try again.",
            "liabilities": 0.0,
            "recent_transactions": []
        }
    
    # Defaults
    metrics = {
        "top_categories": [],
        "savings_rate": 0.0,
        "spending_summary": "No transaction data available yet.",
        "liabilities": 0.0,
        "recent_transactions": []
    }
    
    if df.empty:
        return metrics

    # Standardize column names (optional but recommended)
    df.columns = df.columns.str.strip().str.lower()
    
    # Sort by datetime to get recent transactions first (newest first)
    df_sorted = df.sort_values('datetime', ascending=False)
    
    # Get recent transactions (last 5)
    recent_transactions = []
    for _, row in df_sorted.head(5).iterrows():
        recent_transactions.append({
            "date": row['datetime'].strftime('%d-%m-%Y'),
            "description": row['description'],
            "amount": f"₹{row['amount']:,.2f}",
            "category": row['category']
        })
    
    metrics["recent_transactions"] = recent_transactions
    
    # 1. Separate Inflow (Credit) and Outflow (Debit)
    # Note: load_and_clean_data currently filters for 'Debit' only (expenses)
    # If we want income, we need to adjust load_and_clean_data or assume income is stored differently.
    # For now, we work with what we have (expenses).
    
    expense_df = df # All rows are expenses based on load_and_clean_data logic
    
    total_expenses = expense_df['amount'].sum()
    total_income = 0 # We might need a way to track income in Supabase to calculate savings rate correctly
    
    # 2. Compute Savings Rate (Placeholder if no income data)
    savings_rate = 0.0
        
    # 3. Compute Top Categories (from expense data only)
    if not expense_df.empty:
        category_totals = expense_df.groupby('category')['amount'].sum().sort_values(ascending=False)
        top_categories = category_totals.index.tolist()
        
        # 5. Create Spending Summary String
        summary = (
            f"User spent a total of ₹{total_expenses:,.2f}. "
            f"The highest expense was in '{top_categories[0]}' at ₹{category_totals.iloc[0]:,.2f}."
        )
    else:
        top_categories = []
        summary = "User has no expenses recorded."

    # 4. Compute Liabilities (Identify by description keywords or category name)
    debt_keywords = ['loan', 'emi', 'interest', 'debt', 'credit card payment', 'mortgage']
    liability_mask = (
        expense_df['description'].str.lower().str.contains('|'.join(debt_keywords), na=False) |
        expense_df['category'].str.lower().str.contains('|'.join(debt_keywords), na=False)
    )
    liabilities = expense_df[liability_mask]['amount'].sum()
    
    # Update metrics
    metrics.update({
        "top_categories": top_categories,
        "savings_rate": savings_rate,
        "spending_summary": summary,
        "liabilities": liabilities
    })
    
    return metrics

GURU_ALIASES = {
    "warren_buffett": "Warren Buffett",
    "robert_kiyosaki": "Robert Kiyosaki",
    "ramit_sethi": "Ramit Sethi",
}

def normalize_guru_preference(guru_preference: Optional[str]) -> Optional[str]:
    if not guru_preference:
        return None
    if isinstance(guru_preference, str):
        key = guru_preference.strip().lower().replace(" ", "_")
        # Accept either key-style or display name
        if key in GURU_ALIASES:
            return GURU_ALIASES[key]
        for display_name in GURU_ALIASES.values():
            if display_name.lower() == guru_preference.strip().lower():
                return display_name
    return None

def select_financial_principle(top_categories, savings_rate, liabilities, guru_preference: Optional[str] = None):
    preferred = normalize_guru_preference(guru_preference)
    if preferred:
        return preferred
    if liabilities > 5000:
        return "Robert Kiyosaki"
    if savings_rate < 20:
        return "Warren Buffett"
    if top_categories and any(cat in ["Shopping", "Entertainment", "Dining"] for cat in top_categories[:3]):
        return "Ramit Sethi"
    return "Warren Buffett"

# ==================================================================
# 4. AGENT INTERFACE
# ==================================================================

def chat_with_advisor(user_input: str, user_id: str, guru_preference: Optional[str] = None) -> str:
    # 1. Get Context
    context = get_financial_context(user_id)
    top_categories = context['top_categories']
    savings_rate = context['savings_rate']
    liabilities = context['liabilities']
    spending_summary = context['spending_summary']
    recent_transactions = context['recent_transactions']
    
    # 2. Select Guru
    selected_guru = select_financial_principle(top_categories, savings_rate, liabilities, guru_preference=guru_preference)
    guru_info = FINANCIAL_GURUS.get(selected_guru, FINANCIAL_GURUS["Warren Buffett"])
    principle_core_idea = guru_info["core_idea"]
    principle_guidance = guru_info["guidance"]
    
    # Format recent transactions for display
    recent_tx_display = ""
    if recent_transactions:
        recent_tx_display = "\nRecent Transactions (newest first):\n"
        for i, tx in enumerate(recent_transactions, 1):
            recent_tx_display += f"{i}. {tx['date']} - {tx['description']} - {tx['amount']} ({tx['category']})\n"
    
    # 3. Build System Prompt
    system_prompt = (
        """
        You are a professional Personal Finance AI Advisor following the {selected_guru} philosophy.
        
        USER DATA CONTEXT:
        - Spending Summary: {spending_summary}
        - Top Categories: {top_categories}
        - Savings Rate: {savings_rate}%
        {recent_tx_display}
        
        MODES OF OPERATION:
        
        1. GENERAL CHAT (Plain Text):
        - If the user greets you or talks casually, respond with a SHORT, friendly PLAIN TEXT message.
        - Do NOT use JSON for simple greetings or non-financial talk.
        
        2. FINANCIAL ADVICE (Raw JSON):
        - If the user asks for analysis, advice, or about their money, provide a detailed response in RAW JSON.
        - Do NOT wrap the JSON in markdown code blocks (no ```json).
        - Format the output as a structured JSON with these EXACT keys:
          "spending_insight", "financial_concern", "recommended_actions", "principle_guidance", "motivation_and_disclaimer".
        
        DETAILED ADVICE STRUCTURE:
        - Section 1 (Insight): Professional breakdown of current habits based on the data, 1-2 sentences.
        - Section 2 (Concern): Identify the single biggest financial risk, 1 sentence.
        - Section 3 (Actions): List 2-3 practical, specific steps for the Indian context (INR).
        - Section 4 (Philosophy): Connect advice to {selected_guru}'s core idea in 1 sentence.
        - Section 5 (Motivation): Short encouraging note with a standard educational disclaimer, 1 sentence.
        
        CONSTRAINTS:
        - Use Indian financial context (INR, UPI, etc.).
        - NO specific stock/investment tips or buy/sell calls.
        - Tone must be motivational but educational.
        - Do NOT invent numbers. If data is missing or unclear, say what is missing and ask a concise follow-up question.
        - Keep the whole response under 120 words or 6 short sentences max.
        """
    ).format(
        spending_summary=spending_summary,
        top_categories=", ".join(top_categories[:3]) if top_categories else "None",
        savings_rate=savings_rate,
        selected_guru=selected_guru,
        principle_core_idea=principle_core_idea,
        principle_guidance=principle_guidance,
        recent_tx_display=recent_tx_display
    )
    
    # 4. Create Agent with User-Bound Tools
    tools = create_tools(user_id)
    advisor_agent = create_agent(
        model=llm,
        tools=tools,
        system_prompt=system_prompt
    )
    
    # 5. Invoke Agent
    response = advisor_agent.invoke({"messages": [("user", user_input)]})
    last_message = response["messages"][-1].content
    
    # 6. Extract text
    if isinstance(last_message, list):
        full_text = "".join([item.get("text", "") for item in last_message if isinstance(item, dict)])
    else:
        full_text = str(last_message)

    # 7. Try to convert JSON-style answers into a simple friendly message
    friendly_text = full_text.strip()
    try:
        parsed = json.loads(friendly_text)
        if isinstance(parsed, dict):
            spending_insight = parsed.get("spending_insight")
            financial_concern = parsed.get("financial_concern")
            recommended_actions = parsed.get("recommended_actions") or []
            principle_guidance = parsed.get("principle_guidance")
            motivation_and_disclaimer = parsed.get("motivation_and_disclaimer")

            parts = []
            if spending_insight:
                parts.append(spending_insight)
            if financial_concern:
                parts.append(f"Main concern: {financial_concern}")
            if recommended_actions:
                # Keep it concise in UI
                recommended_actions = recommended_actions[:3]
                bullet_list = "\n".join(f"- {item}" for item in recommended_actions)
                parts.append(f"Recommended actions:\n{bullet_list}")
            if principle_guidance:
                parts.append(principle_guidance)
            if motivation_and_disclaimer:
                parts.append(motivation_and_disclaimer)

            if parts:
                friendly_text = "\n\n".join(parts).strip()
    except Exception:
        pass

    # Final safety: cap very long responses for UI comfort
    if len(friendly_text) > 900:
        friendly_text = friendly_text[:900].rsplit(" ", 1)[0].strip() + "..."

    # 8. DEBUG: Print current metrics to terminal
    print(f"\n--- Current Session Context (User: {user_id}) ---")
    print(f"Summary: {spending_summary}")
    print(f"Guru: {selected_guru}")
    print(f"-------------------------------\n")

    return friendly_text
