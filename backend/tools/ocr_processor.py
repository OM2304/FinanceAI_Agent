import cv2
import requests
import re
import os
from typing import Optional
from dotenv import load_dotenv

from tools.llm_config import get_llm
from tools.ml_categorizer import AdaptiveCategorizer
from tools.ocr import (
    build_amount_extraction_prompt,
    clean_amount_to_float,
    extract_transaction_amount,
    llm_extract_financial_fields,
    sanitize_ocr_date,
)

load_dotenv()
OCR_SPACE_API_KEY = os.getenv("OCR_SPACE_API_KEY")

llm = get_llm()
ml_categorizer = AdaptiveCategorizer()

# ---------------- OCR WITH PREPROCESSING ----------------
def ocr_space(image_path):
    if not OCR_SPACE_API_KEY:
        raise RuntimeError("Missing OCR_SPACE_API_KEY in environment")

    img = cv2.imread(image_path)
    if img is None:
        return None

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    binary = cv2.adaptiveThreshold(
        gray, 255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY, 11, 2
    )

    temp_path = "temp_ocr.jpg"
    cv2.imwrite(temp_path, binary)

    with open(temp_path, "rb") as f:
        r = requests.post(
            "https://api.ocr.space/parse/image",
            files={"file": f},
            data={
                "apikey": OCR_SPACE_API_KEY,
                "language": "eng",
                "OCREngine": 2
            }
        )

    os.remove(temp_path)
    result = r.json()

    if result.get("IsErroredOnProcessing"):
        return None

    return result["ParsedResults"][0]["ParsedText"]


# ---------------- STRONG AMOUNT EXTRACTION ----------------
def _extract_primary_amount_strict(text: str) -> Optional[float]:
    raw = (text or "").strip()
    if not raw:
        return None

    # Primary path: shared extraction logic in tools.ocr.
    try:
        extracted = extract_transaction_amount(raw)
        if extracted is not None:
            return float(extracted)
    except Exception as exc:
        print(f"Primary amount extraction error: {exc}")

    def valid_amount(value: Optional[float]) -> Optional[float]:
        if value is None:
            return None
        if value != value:  # NaN
            return None
        if value < 1 or value > 2000000:
            return None
        # Filter likely years unless decimals are present.
        if float(int(value)) == value and 1900 <= int(value) <= 2099:
            return None
        return value

    currency_hits: list[float] = []
    labelled_hits: list[float] = []
    any_hits: list[float] = []

    # Currency anchored: ₹, INR, Rs.
    for match in re.finditer(r"(?:₹|\u20b9|rs\.?|inr)\s*([0-9][0-9,\s]*\.?[0-9]{0,3})", raw, re.I):
        val = valid_amount(clean_amount_to_float(match.group(1)))
        if val is not None:
            currency_hits.append(val)

    # Keyword labelled: Paid/Amount/Total near a number.
    for match in re.finditer(
        r"(?:paid|debited|credited|sent|received|amount|total|payable)\D{0,20}([0-9][0-9,\s]*\.?[0-9]{0,3})",
        raw,
        re.I,
    ):
        val = valid_amount(clean_amount_to_float(match.group(1)))
        if val is not None:
            labelled_hits.append(val)

    # Any plausible number (fallback).
    for match in re.finditer(r"\b([0-9][0-9,\s]{0,10}(?:\.[0-9]{1,3})?)\b", raw):
        val = valid_amount(clean_amount_to_float(match.group(1)))
        if val is not None:
            any_hits.append(val)

    if currency_hits:
        return max(currency_hits)
    if labelled_hits:
        return max(labelled_hits)
    if any_hits:
        return max(any_hits)

    # LLM fallback: only used when heuristics fail completely.
    try:
        prompt = build_amount_extraction_prompt(raw)
        response = llm.invoke(prompt)
        candidate = getattr(response, "content", response)
        return valid_amount(clean_amount_to_float(candidate))
    except Exception as exc:
        print(f"Amount LLM fallback error: {exc}")
        return None


def extract_amount(text):
    print(f"DEBUG: Raw OCR Text for Amount Extraction:\n{text}") # Debug log
    lines = [l.strip() for l in text.splitlines() if l.strip()]

    strict_val = _extract_primary_amount_strict(text)
    if strict_val is not None:
        return strict_val

    # Priority 1: Currency-anchored amounts (e.g. INR 50,000, Rs 500)
    currency_candidates = []
    
    for line in lines:
        clean = line.replace("✔", "").replace("●", "").replace("O", "0")
        
        # Matches: INR 50,000 | Rs. 450.50 | INR 1200 | ₹ 50000
        m = re.search(r'(?:₹|\u20b9|rs\.?|inr)\s*([\d,]+\.?\d*)', clean, re.I)
        if m:
            raw_val = m.group(1).replace(',', '')
            try:
                val = float(raw_val)
                if 1 <= val <= 2000000: 
                    currency_candidates.append(val)
            except:
                pass

        # Matches: Paid to ... ₹500 or Paid to ... INR 500
        m = re.search(r'paid\s+to.*?(?:₹|\u20b9|rs\.?|inr)\s*([\d,]+\.?\d*)', clean, re.I)
        if m:
            raw_val = m.group(1).replace(',', '')
            try:
                val = float(raw_val)
                if 1 <= val <= 2000000:
                    currency_candidates.append(val)
            except Exception:
                pass

    if currency_candidates:
        return max(currency_candidates)

    # Priority 2: Labelled amounts (e.g. Amount: 340, Paid: 340)
    labelled_candidates = []
    for line in lines:
        clean = line.replace(",", "").strip()
        # Matches: Amount 340 | Total 340 | Paid 340 | Pay 340
        m = re.search(r'(?:Amount|Total|Paid|Payable|Bill)\s*[:\-\s]*([\d,]+\.?\d*)', clean, re.I)
        if m:
            raw_val = m.group(1).replace(',', '')
            try:
                val = float(raw_val)
                # Avoid dates (2025) or phone numbers
                if 1 <= val <= 2000000 and val != 2025: 
                    labelled_candidates.append(val)
            except:
                pass
    
    if labelled_candidates:
        return max(labelled_candidates)

    # Priority 3: Standalone numbers (Fallback)
    standalone_candidates = []
    
    for line in lines:
        clean = line.replace(",", "").strip()
        # Look for simple integer or float
        # Relaxed: Allow trailing dot or spaces
        # Strict start/end to avoid partial matches in text
        if re.fullmatch(r'\d{1,7}(\.\d+)?\.?', clean):
            try:
                val = float(clean.rstrip('.'))
                if 1 <= val <= 500000: 
                    # Filter out likely years if they appear alone (e.g. 2024, 2025)
                    # Unless it looks like a price (has decimals)
                    if val in [2023, 2024, 2025, 2026] and "." not in clean:
                         continue
                    standalone_candidates.append(val)
            except:
                pass

    if not standalone_candidates:
        return "Not found"

    # Correction logic for standalone numbers
    corrected_candidates = []
    for val in standalone_candidates:
        corrected_candidates.append(val)
        
        # OCR inflation cases (7950 → 95)
        if val > 999:
            s = str(int(val))
            if len(s) >= 3 and s[0] in '789':
                try:
                    collapsed = float(s[1:])
                    if 1 <= collapsed <= 500000:
                        corrected_candidates.append(collapsed)
                except:
                    pass

    return max(corrected_candidates)


# ---------------- DATE & TIME ----------------
def extract_date_time(text):
    # Date: allow common OCR variants; normalize month via sanitize_ocr_date.
    date_match = re.search(
        r"(\d{1,2}\s*[-/ ]\s*[A-Za-z]{3,9}\s*[-/ ]\s*\d{4}|\d{1,2}[/-]\d{1,2}[/-]\d{4})",
        text,
        re.I,
    )
    date_str = sanitize_ocr_date(date_match.group(1)) if date_match else "Not found"

    # Time: must come from image; if missing, return null (None).
    time_match = re.search(r"(\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?)", text, re.I)
    time_str = time_match.group(1).strip().upper() if time_match else None

    return date_str, time_str


# ---------------- SENDER ----------------
def extract_sender(text):
    # Matches "Debited from NAME" or "from NAME" (case-insensitive)
    # Also handles "Sender : NAME" or "Payer : NAME"
    patterns = [
        r'(?:Debited\s+from|from)\s*[:\-]?\s*([A-Z][A-Za-z ]+)',
        r'(?:Sender|Payer)\s*[:\-]\s*([A-Z][A-Za-z ]+)'
    ]
    for p in patterns:
        m = re.search(p, text, re.I)
        if m:
            return m.group(1).strip()
    return "Not found"


# ---------------- RECEIVER ----------------
def extract_receiver(text):
    # Matches "Paid to NAME" or "to NAME"
    # Also handles "Receiver : NAME" or "Payee : NAME"
    patterns = [
        r'(?:Paid\s+to|to)\s+([A-Z][A-Za-z ]+)',
        r'(?:Receiver|Payee)\s*[:\-]\s*([A-Z][A-Za-z ]+)'
    ]
    for p in patterns:
        m = re.search(p, text, re.I)
        if m:
            return m.group(1).strip()
    return "Not found"


# ---------------- TRANSACTION ID ----------------
def extract_transaction_id(text):
    # Matches "UPI transaction ID" or "UPI txn ID", with optional colons/spaces
    # Also handles "Ref No", "Reference ID", "Txn ID", "Order ID", or just "Transaction ID"
    patterns = [
        r'UPI\s*(?:transaction|txn)\s*ID\s*[:\s-]*([0-9A-Za-z]{8,})',
        r'(?:Ref\s*No|Reference\s*ID|Txn\s*ID|Order\s*ID|Transaction\s*ID)\s*[:\s-]*([0-9A-Za-z]{8,})'
    ]
    for p in patterns:
        m = re.search(p, text, re.I)
        if m:
            return m.group(1)
    return "Not found"


# ---------------- CONFIDENCE SCORING ----------------
def calculate_confidence(value, field_type, raw_text=""):
    """
    Calculate confidence score (0-1) for extracted fields.
    Higher score = more reliable extraction.
    """
    if value == "Not found" or value is None:
        return 0.0
    
    if field_type == "amount":
        # High confidence if amount is in reasonable range and was currency-anchored
        if isinstance(value, (int, float)):
            if 1 <= value <= 10000:
                # Check if it was found with currency symbol (higher confidence)
                if "₹" in raw_text or "rs" in raw_text.lower() or "inr" in raw_text.lower():
                    return 0.85 if value <= 5000 else 0.75
                return 0.65 if value <= 5000 else 0.55
        return 0.3
    
    elif field_type == "receiver":
        # High confidence if found with "Paid to" pattern
        if "paid to" in raw_text.lower() or "to " in raw_text.lower():
            return 0.8
        return 0.5
    
    elif field_type == "sender":
        # High confidence if found with "Debited from" pattern
        if "debited from" in raw_text.lower() or "from " in raw_text.lower():
            return 0.8
        return 0.5
    
    elif field_type == "date":
        # High confidence if date pattern matched
        if value != "Not found":
            return 0.75
        return 0.2
    
    elif field_type == "time":
        # High confidence if time pattern matched
        if value != "Not found" and ":" in str(value):
            return 0.75
        return 0.2
    
    elif field_type == "transaction_id":
        # High confidence if found with "UPI transaction ID" pattern
        if "upi transaction id" in raw_text.lower() or "upi txn id" in raw_text.lower():
            return 0.85
        return 0.4
    
    return 0.5


# ---------------- 4. HYBRID CATEGORIZATION LOGIC (ML + AI) ----------------
def categorize_transaction_hybrid(receiver, amount, raw_text):
    """
    Priority: ML Prediction -> AI Fallback.
    Fulfills Track B requirement for Adaptive Categorization using DB data. [cite: 1, 26]
    """
    # 1. Use ML Model (AdaptiveCategorizer) [cite: 26]
    # This checks the public.transactions table and base data for known patterns.
    category, confidence = ml_categorizer.predict_category(receiver)
    
    # 2. Fallback to LLM if ML confidence is low 
    if confidence < 0.6:
        try:
            # Construct the detailed prompt as provided [cite: 1]
            prompt = f"""
            Analyze this UPI transaction receipt text and details to categorize it.
            
            Details:
            - Receiver: {receiver}
            - Amount: {amount}
            - Raw Text Context: {raw_text[:200]}...
            
            Categories: Food, Travel, Shopping, Bills, Entertainment, Health, Education, Investment, Rent, Groceries, Other.
            
            Instructions:
            1. Identify the merchant/receiver type.
            2. Assign the most appropriate category from the list.
            3. If unsure or personal transfer, use "Other".
            4. Return ONLY the category name. No explanations.
            """
            
            response = llm.invoke(prompt)
            ai_category = response.content.strip().replace(".", "").replace('"', "")
            
            valid_categories = [
                "Food", "Travel", "Shopping", "Bills", "Entertainment", 
                "Health", "Education", "Investment", "Rent", "Groceries", "Other"
            ]
            
            # Use AI category if valid, otherwise fallback to "Other"
            category = ai_category if ai_category in valid_categories else "Other"
            confidence = 0.5  # Standardized confidence for AI fallback [cite: 237]
            
        except Exception as e:
            print(f"AI Categorization Fallback Error: {e}")
            category, confidence = "Other", 0.1
            
    return category, confidence


# ---------------- FINAL PARSER WITH CONFIDENCE ----------------
def parse_transaction(image_path):
    raw_text = ocr_space(image_path)
    if not raw_text:
        return None

    extracted = llm_extract_financial_fields(raw_text)
    amount = extracted.get("amount") if isinstance(extracted, dict) else None
    date = extracted.get("date") if isinstance(extracted, dict) else None
    time = extracted.get("time") if isinstance(extracted, dict) else None
    receiver = extracted.get("receiver") if isinstance(extracted, dict) else None
    category = extracted.get("category") if isinstance(extracted, dict) else None

    # Fallbacks if the LLM output is incomplete/garbled.
    if not receiver:
        receiver = extract_receiver(raw_text)
    if not date or date == "Not found":
        date, _time = extract_date_time(raw_text)
        if not time:
            time = _time
    if amount is None or amount == "Not found":
        amount = extract_amount(raw_text)

    sender = extract_sender(raw_text)
    transaction_id = extract_transaction_id(raw_text)

    if not category or str(category).strip().lower() in {"", "not found", "unknown"}:
        category, _ = categorize_transaction_hybrid(receiver, amount, raw_text)

    return {
        "amount": amount,
        "sender": sender,
        "receiver": receiver,
        "date": date if date is not None else "Not found",
        "time": time if time is not None else None,
        "transaction_id": transaction_id,
        "category": category,
        "raw_text": raw_text,
        "confidence": {
            "amount": calculate_confidence(amount, "amount", raw_text),
            "sender": calculate_confidence(sender, "sender", raw_text),
            "receiver": calculate_confidence(receiver, "receiver", raw_text),
            "date": calculate_confidence(date, "date", raw_text),
            "time": calculate_confidence(time, "time", raw_text),
            "transaction_id": calculate_confidence(transaction_id, "transaction_id", raw_text)
        }
    }
