import pandas as pd
import json
import os
import datetime
from typing import Optional

try:
    from tools.supabase_db import get_user_transactions, save_transaction
except ImportError:
    from backend.tools.supabase_db import get_user_transactions, save_transaction

# Paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(os.path.dirname(BASE_DIR))
DATA_DIR = os.path.join(PROJECT_ROOT, 'data')
BUDGET_FILE = os.path.join(DATA_DIR, "budget_limit.json")

def load_and_clean_data(user_id: str) -> pd.DataFrame:
    """
    Loads transaction data from Supabase, cleans it, ensures correct data types,
    and returns a DataFrame.

    Args:
        user_id (str): The user ID to fetch transactions for.

    Returns:
        pd.DataFrame: A cleaned DataFrame ready for expense analysis.
    """
    if not user_id:
        print("Error: No user_id provided for load_and_clean_data")
        return pd.DataFrame()

    try:
        # 1. Load data from Supabase
        transactions = get_user_transactions(user_id)
        print(f"DEBUG: Raw transactions from Supabase: {len(transactions) if transactions else 0}")
        
        if not transactions:
            print(f"DEBUG: No transactions returned from get_user_transactions for user {user_id}")
            return pd.DataFrame()
            
        # Convert to DataFrame
        # Map Supabase fields to DataFrame columns expected by the application
        # Supabase: date, time, sender, receiver, transaction_id, category, amount, ai_confidence, corrected
        # DataFrame expects: datetime, description, amount, transaction_type, payment_mode, category
        
        data_list = []
        for tx in transactions:
            date_str = tx.get('date')
            time_str = tx.get('time', '00:00')
            
            # FIXED: Initialize datetime_str with the original value first
            datetime_str = date_str 
            
            # Handle datetime conversion properly
            if date_str:
                try:
                    from datetime import datetime
                    # Attempt to convert YYYY-MM-DD to DD-MM-YYYY
                    datetime_obj = datetime.strptime(date_str, '%Y-%m-%d')
                    datetime_str = datetime_obj.strftime('%d-%m-%Y')
                except ValueError:
                    pass  # usage of datetime_str above ensures it falls back to date_str
            
            data_list.append({
                'datetime': datetime_str,
                'description': tx.get('receiver', 'Unknown'),
                'amount': float(tx.get('amount', 0)),
                'transaction_type': 'Debit', 
                'payment_mode': 'UPI',
                'category': tx.get('category', 'Others'),
                'transaction_id': tx.get('transaction_id')
            })
            
        df = pd.DataFrame(data_list)
        
    except Exception as e:
        print(f"Error loading data from Supabase: {e}")
        return pd.DataFrame()
    
    if df.empty:
        print(f"DEBUG: DataFrame is empty, returning empty")
        return df

    # 2. Convert to correct types
    # Handle datetime conversion properly
    # 2. Convert to correct types
    # Handle datetime conversion properly
    if 'datetime' in df.columns:
        print("DEBUG: Converting datetime column to datetime objects")
        # Force conversion to datetime objects. 
        # dayfirst=True ensures DD-MM-YYYY strings are parsed correctly.
        df['datetime'] = pd.to_datetime(df['datetime'], dayfirst=True, errors='coerce')
    else:
        print("DEBUG: No datetime column found")
        pass
    # Ensure amount is a number
    df['amount'] = pd.to_numeric(df['amount'], errors='coerce')

    # 3. Filter for expenses (Debit) and drop rows with errors (NaN values)
    # Note: We assign 'Debit' to all rows above, so this filter is redundant but keeps structure
    expenses_df = df[df['transaction_type'] == 'Debit'].copy()
    
    # Drop any rows where critical data (datetime, amount, description) failed cleaning
    expenses_df.dropna(subset=['datetime', 'amount', 'description'], inplace=True)
    
    return expenses_df


def load_budget_limits(file_path: str = BUDGET_FILE) -> dict:
    """
    Loads the user's defined budget limits from a JSON file.
    """
    try:
        with open(file_path, 'r') as f:
            budget_data = json.load(f)
        return budget_data
    except (FileNotFoundError, json.JSONDecodeError):
        # print(f"Budget file not found or invalid at {file_path}. Using empty budget.")
        return {}


def auto_categorize_ml(description: str) -> str:
    """Matches descriptions to categories using simple keywords or LLM."""
    # Simple keyword matching first for speed
    desc = description.lower()
    mappings = {
        'Food': ['zomato', 'swiggy', 'restaurant', 'cafe', 'starbucks', 'blinkit', 'mcdonalds', 'burger', 'pizza', 'food', 'tea', 'coffee'],
        'Transport': ['uber', 'ola', 'petrol', 'fuel', 'train', 'irctc', 'metro', 'bus', 'cab', 'auto'],
        'Shopping': ['amazon', 'flipkart', 'myntra', 'mall', 'electronics', 'cloth', 'shoe', 'market'],
        'Utilities': ['recharge', 'electricity', 'bill', 'jio', 'airtel', 'gas', 'water', 'wifi', 'internet', 'mobile'],
        'Health': ['medical', 'hospital', 'pharmacy', 'apollo', 'doctor', 'clinic', 'medicine', 'health'],
        'Education': ['college', 'fees', 'books', 'school', 'course', 'udemy', 'coursera', 'learning'],
        'Entertainment': ['netflix', 'spotify', 'cinema', 'movie', 'prime', 'hotstar', 'game', 'play']
    }
    
    for category, keywords in mappings.items():
        if any(keyword in desc for keyword in keywords):
            return category
            
    # Fallback to LLM if available
    try:
        # Import inside function to avoid circular import if advisor imports data_processor
        from tools.advisor import llm
        from langchain_core.messages import HumanMessage
        
        prompt = f"""
        Categorize this Indian transaction description into EXACTLY one of these categories:
        [Food, Transport, Shopping, Utilities, Health, Education, Entertainment, Others]
        
        Description: {description}
        Category:"""
        
        response = llm.invoke([HumanMessage(content=prompt)])
        category = response.content.strip()
        
        valid_categories = ['Food', 'Transport', 'Shopping', 'Utilities', 'Health', 'Education', 'Entertainment', 'Others']
        # Clean up category string just in case
        for vc in valid_categories:
            if vc.lower() in category.lower():
                return vc
                
        return "Others"
    except Exception as e:
        # print(f"ML Categorization failed: {e}")
        return "Others"


# backend/tools/data_processor.py

def append_new_transaction(data: dict, user_id: str) -> bool:
    if not user_id:
        print("Error: No user_id provided")
        return False

    try:
        # 1. FIX: Ensure date is NEVER "Not found"
        date_str = data.get('date')
        if not date_str or date_str == 'Not found' or date_str == 'Unknown' or date_str.strip() == "":
             # Use current date as fallback so database doesn't crash
             date_str = datetime.datetime.now().strftime('%Y-%m-%d')
        
        # 2. FIX: Ensure time is valid
        time_str = data.get('time')
        if not time_str or time_str == 'Not found' or time_str.strip() == "":
            time_str = "00:00"

        db_data = {
            "date": date_str,      # Now guaranteed to be a valid string
            "time": time_str,
            "sender": data.get('sender', 'Self'),
            "receiver": data.get('receiver', 'Unknown'),
            "amount": float(data.get('amount', 0)),
            "category": data.get('category', 'Others'),
            "transaction_id": data.get('transaction_id'),
            "ai_confidence": float(data.get('ai_confidence', 0.9)),
            "corrected": data.get('corrected', False)
        }
        
        return save_transaction(user_id, db_data)
    except Exception as e:
        print(f"Error: {e}")
        return False