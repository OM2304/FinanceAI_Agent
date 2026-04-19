import os
from supabase import create_client, Client
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Initialize Supabase client
_supabase_client = None

def get_supabase_client() -> Client:
    """Get Supabase client instance with caching and error handling"""
    global _supabase_client
    if _supabase_client:
        return _supabase_client
        
    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = (
        os.getenv("SUPABASE_SERVICE_KEY")
        or os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        or os.getenv("SUPABASE_KEY")
        or os.getenv("SUPABASE_ANON_KEY")
    )
    
    if not supabase_url or not supabase_key:
        raise ValueError("Missing Supabase credentials. Please set SUPABASE_URL and one of SUPABASE_SERVICE_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_KEY, SUPABASE_ANON_KEY in .env file.")
    
    try:
        _supabase_client = create_client(supabase_url, supabase_key)
        return _supabase_client
    except Exception as e:
        print(f"CRITICAL ERROR: Failed to initialize Supabase client. Check your SUPABASE_URL and SUPABASE_KEY in .env file.")
        print(f"Error details: {str(e)}")
        # Raise a RuntimeError that can be caught by the caller or crash the app with a clear message
        raise RuntimeError(f"Invalid Supabase Configuration: {str(e)}")

# Database operations
def save_transaction(user_id: str, transaction_data: dict) -> dict:
    """Save transaction to Supabase"""
    supabase = get_supabase_client()
    
    # Handle "Not found" values and set defaults
    date_value = transaction_data.get("date")
    if not date_value or date_value == "Not found":
        from datetime import datetime
        date_value = datetime.now().strftime('%Y-%m-%d')  # PostgreSQL date format
    else:
        # Convert DD-MM-YYYY to YYYY-MM-DD for PostgreSQL
        try:
            from datetime import datetime
            date_obj = datetime.strptime(date_value, '%d-%m-%Y')
            date_value = date_obj.strftime('%Y-%m-%d')
        except ValueError:
            # If conversion fails, use current date
            from datetime import datetime
            date_value = datetime.now().strftime('%Y-%m-%d')
    
    time_value = transaction_data.get("time", "00:00")
    if time_value == "Not found":
        time_value = "00:00"
    
    receiver_value = transaction_data.get("receiver")
    if not receiver_value or receiver_value == "Not found":
        receiver_value = "Unknown"
    
    sender_value = transaction_data.get("sender")
    if not sender_value or sender_value == "Not found":
        sender_value = "Self"
    
    transaction_id_value = transaction_data.get("transaction_id")
    if not transaction_id_value or transaction_id_value == "Not found":
        transaction_id_value = None
    
    # Prepare data for Supabase
    try:
        # Validate amount before converting to float
        amount_value = transaction_data.get("amount", 0)
        if amount_value is None or amount_value == "":
            raise ValueError("Amount cannot be None or empty")
        
        # Convert to float and validate range
        try:
            import math
            amount_float = float(amount_value)
            
            # Handle NaN and infinite values
            if math.isnan(amount_float) or math.isinf(amount_float):
                raise ValueError(f"Amount {amount_float} is NaN or infinite")
                
            if not (-1e10 <= amount_float <= 1e10):  # JSON safe range
                raise ValueError(f"Amount {amount_float} is out of JSON safe range")
                
            # Skip zero or negative amounts for expense tracking
            if amount_float <= 0:
                raise ValueError(f"Amount {amount_float} must be positive for expense tracking")
                
        except (ValueError, TypeError):
            raise ValueError(f"Invalid amount value: {amount_value}")
        
        db_data = {
            "user_id": user_id,
            "date": date_value,
            "time": time_value,
            "sender": sender_value,
            "receiver": receiver_value,
            "transaction_id": transaction_id_value,
            "category": transaction_data.get("category"),
            "amount": amount_float,
            "ai_confidence": float(transaction_data.get("ai_confidence", 0.5)),
            "corrected": transaction_data.get("corrected", False)
        }
        
        result = supabase.table("transactions").insert(db_data).execute()
        return result.data[0] if result.data else None
        
    except ValueError as e:
        print(f"Validation error in save_transaction: {e}")
        raise
    except Exception as e:
        print(f"Database error in save_transaction: {e}")
        raise

def get_user_transactions(user_id: str) -> list:
    """Get all transactions for a user"""
    print(f"DEBUG: Fetching transactions for user_id: {user_id}")
    supabase = get_supabase_client()
    
    result = supabase.table("transactions").select("*").eq("user_id", user_id).order("date", desc=True).execute()
    print(f"DEBUG: Query result: {result.data}")
    
    if not result.data:
        print(f"DEBUG: No transactions found for user {user_id}")
        return []
    
    # Convert dates back to DD-MM-YYYY format for frontend
    transactions = []
    for tx in result.data:
        tx_copy = tx.copy()
        if tx_copy.get("date"):
            try:
                from datetime import datetime
                date_obj = datetime.strptime(tx_copy["date"], '%Y-%m-%d')
                tx_copy["date"] = date_obj.strftime('%d-%m-%Y')
            except ValueError:
                pass  # Keep original if conversion fails
        transactions.append(tx_copy)
    
    return transactions

def delete_transaction(transaction_id: int, user_id: str) -> bool:
    """Delete a transaction for a user"""
    supabase = get_supabase_client()
    
    result = supabase.table("transactions").delete().eq("id", transaction_id).eq("user_id", user_id).execute()
    # Supabase may return an empty data list even when delete succeeds.
    if result.data:
        return len(result.data) > 0

    # If no rows were returned, check if the record still exists.
    check = (
        supabase.table("transactions")
        .select("id")
        .eq("id", transaction_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    return False if (check.data and len(check.data) > 0) else True

def verify_user_token(token: str) -> dict:
    """Verify JWT token and get user info"""
    # For development: bypass network issues with a fallback user
    if token == "dev-token" or not token:
        return {"id": "dev-user", "email": "dev@example.com"}
    
    supabase = get_supabase_client()
    
    try:
        user = supabase.auth.get_user(token)
        if user and user.user:
            return user.user
        return {"id": "dev-user", "email": "dev@example.com"}
    except Exception as e:
        print(f"Token verification error: {e}")
        # For SSL timeout errors, we might want to be more lenient or retry
        if "SSL" in str(e) or "timeout" in str(e).lower() or "handshake" in str(e).lower():
            print("SSL/Timeout error during token verification - this might be a network issue")
            # For development, you could add a fallback here
            return {"id": "dev-user", "email": "dev@example.com"}  # Uncomment for testing
            # Return None to force re-authentication
            # return None
        return None


def get_splitwise_token(user_id: str) -> dict:
    """Get Splitwise token for a user."""
    supabase = get_supabase_client()
    result = supabase.table("splitwise_tokens").select("*").eq("user_id", user_id).limit(1).execute()
    if not result.data:
        return {}
    return result.data[0]


def set_splitwise_token(user_id: str, access_token: str, token_type: str = "bearer") -> dict:
    """Upsert Splitwise token for a user."""
    supabase = get_supabase_client()
    payload = {
        "user_id": user_id,
        "access_token": access_token,
        "token_type": token_type,
    }
    result = supabase.table("splitwise_tokens").upsert(payload, on_conflict="user_id").execute()
    if not result.data:
        return {}
    return result.data[0]


def get_budget_limits(user_id: str) -> dict:
    """Get budget limits for a user from Supabase."""
    supabase = get_supabase_client()
    result = supabase.table("budget_limits").select("category,amount").eq("user_id", user_id).execute()
    if not result.data:
        return {}
    return {row["category"]: float(row["amount"]) for row in result.data}


def set_budget_limits(user_id: str, budget_limits: dict) -> dict:
    """Upsert budget limits for a user into Supabase."""
    supabase = get_supabase_client()
    rows = []
    for category, amount in budget_limits.items():
        rows.append({
            "user_id": user_id,
            "category": category,
            "amount": float(amount),
        })
    if not rows:
        return {}
    result = supabase.table("budget_limits").upsert(rows, on_conflict="user_id,category").execute()
    if not result.data:
        return {}
    return {row["category"]: float(row["amount"]) for row in result.data}


def _format_inr(value: float) -> str:
    """Format a number into a compact INR-ish string (e.g., 18000 -> ₹18k)."""
    try:
        num = float(value)
    except Exception:
        return "₹0"
    abs_num = abs(num)
    if abs_num >= 1_00_00_000:
        return f"₹{abs_num/1_00_00_000:.1f}Cr".replace(".0", "")
    if abs_num >= 1_00_000:
        return f"₹{abs_num/1_00_00_000:.1f}L".replace(".0", "")
    if abs_num >= 1000:
        return f"₹{abs_num/1000:.1f}k".replace(".0", "")
    return f"₹{abs_num:,.0f}"


def get_financial_summary(user_id: str) -> str:
    """Return a short financial summary string for a user."""
    if not user_id:
        return "No transactions found."

    supabase = get_supabase_client()
    result = (
        supabase.table("transactions")
        .select("amount, category, receiver")
        .eq("user_id", user_id)
        .execute()
    )

    rows = result.data or []
    if not rows:
        return "No transactions found."

    # Total spent
    total_spent = 0.0
    category_totals = {}
    largest_amount = -1.0
    largest_receiver = None

    for row in rows:
        try:
            amt = float(row.get("amount") or 0)
        except Exception:
            amt = 0.0
        total_spent += amt

        cat = row.get("category") or "Other"
        category_totals[cat] = category_totals.get(cat, 0.0) + amt

        if amt > largest_amount:
            largest_amount = amt
            largest_receiver = row.get("receiver") or "Unknown"

    # Top 3 categories
    top_cats = sorted(category_totals.items(), key=lambda x: x[1], reverse=True)[:3]
    if top_cats:
        top_parts = []
        for i, (cat, amt) in enumerate(top_cats):
            amt_str = _format_inr(amt)
            if i < 2:
                top_parts.append(f"{cat} ({amt_str})")
            else:
                top_parts.append(f"and {cat} ({amt_str})")
        top_categories_text = ", ".join(top_parts[:-1] + ([top_parts[-1]] if top_parts else []))
    else:
        top_categories_text = "None"

    largest_text = "None"
    if largest_amount >= 0 and largest_receiver:
        largest_text = f"{_format_inr(largest_amount)} for \"{largest_receiver}\""

    return (
        f"You spent {_format_inr(total_spent)} total. "
        f"Top categories: {top_categories_text}. "
        f"Largest expense: {largest_text}."
    )


def save_chat_message(user_id: str, role: str, message: str, guru_id: str = None) -> dict:
    """Save a chat message to chat_history."""
    supabase = get_supabase_client()
    
    # Ensure 'ai' becomes 'assistant' to match the database CHECK constraint
    db_role = 'assistant' if str(role).lower() == 'ai' else str(role)
    
    payload = {
        "user_id": user_id,
        "role": db_role,
        "content": str(message),
    }
    if guru_id:
        payload["guru_id"] = str(guru_id)

    # `guru_id` is optional and may not exist as a column in older DBs.
    if guru_id:
        try:
            result = supabase.table("chat_history").insert(payload).execute()
            return result.data[0] if result.data else {}
        except Exception:
            payload.pop("guru_id", None)

    result = supabase.table("chat_history").insert(payload).execute()
    return result.data[0] if result.data else {}


def get_chat_history(user_id: str, limit: int = 50) -> list:
    """Fetch recent chat history for a user (most recent first)."""
    supabase = get_supabase_client()
    try:
        result = (
            supabase.table("chat_history")
            .select("id,user_id,role,content,created_at,guru_id")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(int(limit))
            .execute()
        )
        return result.data or []
    except Exception:
        result = (
            supabase.table("chat_history")
            .select("id,user_id,role,content,created_at")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(int(limit))
            .execute()
        )
        return result.data or []
