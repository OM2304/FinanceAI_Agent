import pdfplumber
import pandas as pd
import re
import pikepdf

def unlock_pdf(pdf_path, password=None):
    """
    Attempts to unlock a PDF. 
    Returns (True, unlocked_path) if successful or (False, "Password Required").
    """
    try:
        # Open with the provided password (only pass password if it's not None)
        # pikepdf expects either a string or no password parameter at all
        if password is not None:
            with pikepdf.open(pdf_path, password=password) as pdf:
                # Save a temporary decrypted copy for parsing
                unlocked_path = "temp_unlocked.pdf"
                pdf.save(unlocked_path)
                return True, unlocked_path
        else:
            # Try to open without password first (for unprotected PDFs)
            with pikepdf.open(pdf_path) as pdf:
                unlocked_path = "temp_unlocked.pdf"
                pdf.save(unlocked_path)
                return True, unlocked_path
    except pikepdf.PasswordError:
        return False, "Password Required"
    except Exception as e:
        return False, str(e)
    

def parse_bank_statement(pdf_path):
    transactions = []
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            table = page.extract_table()
            if table:
                # Use the first row as columns
                headers = [str(h).strip().lower() if h else f"col_{i}" for i, h in enumerate(table[0])]
                
                # Create DataFrame
                df_page = pd.DataFrame(table[1:], columns=headers)
                
                # FIX: Drop completely empty columns that often cause duplicate index errors
                df_page = df_page.dropna(axis=1, how='all')
                
                # FIX: Handle duplicate column names by appending a suffix
                cols = pd.Series(df_page.columns)
                for dup in cols[cols.duplicated()].unique(): 
                    cols[cols == dup] = [f"{dup}_{i}" if i != 0 else dup for i in range(sum(cols == dup))]
                df_page.columns = cols
                
                transactions.append(df_page)
    
    if not transactions:
        return None

    # Use ignore_index=True to ensure the row index is unique
    full_df = pd.concat(transactions, ignore_index=True)
    return full_df
