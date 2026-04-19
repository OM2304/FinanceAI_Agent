import re
import json
from difflib import SequenceMatcher
from typing import Any, Dict, Optional

from tools.llm_config import get_llm


PRIMARY_TRANSACTION_AMOUNT_INSTRUCTIONS = (
    'Locate the primary transaction amount. It is usually the largest numerical value on the screen, '
    'often near symbols like ₹, INR, or words like "Paid".'
)

LLM_FINANCIAL_EXTRACTION_SYSTEM_PROMPT = (
    "You are a financial data extractor. I will provide a raw text dump from a payment screenshot. "
    "Extract the: Amount (float), Date (DD/MM/YYYY), Time (HH:MM AM/PM), Receiver, and Category.\n\n"
    "Rules:\n"
    "- Ignore long numeric strings that look like Transaction IDs.\n"
    "- Prioritize the largest numerical value as the Amount.\n"
    "- Return the result ONLY as a valid JSON object.\n"
)

_OCR_MONTH_FIXES = {
    "DeG": "Dec",
    "SeB": "Sep",
    "Janu": "Jan",
}

_MONTHS = [
    ("jan", "Jan"),
    ("feb", "Feb"),
    ("mar", "Mar"),
    ("apr", "Apr"),
    ("may", "May"),
    ("jun", "Jun"),
    ("jul", "Jul"),
    ("aug", "Aug"),
    ("sep", "Sep"),
    ("oct", "Oct"),
    ("nov", "Nov"),
    ("dec", "Dec"),
]


def _best_month_token(token: str) -> Optional[str]:
    raw = (token or "").strip()
    if not raw:
        return None

    lower = raw.lower()
    for key, proper in _MONTHS:
        if lower.startswith(key):
            return proper

    best = None
    best_score = 0.0
    for key, proper in _MONTHS:
        score = SequenceMatcher(a=lower, b=key).ratio()
        if score > best_score:
            best_score = score
            best = proper
    return best if best_score >= 0.6 else None


def sanitize_ocr_date(date_str: str) -> str:
    """
    Sanitize OCR date strings by fixing common month hallucinations and
    normalizing to a parseable format.
    """
    raw = str(date_str or "").strip()
    if not raw or raw.lower() == "not found":
        return "Not found"

    for bad, good in _OCR_MONTH_FIXES.items():
        raw = re.sub(re.escape(bad), good, raw, flags=re.I)

    # Common formats:
    # - 01 Dec 2025
    # - 01-Dec-2025
    # - 01/12/2025
    m = re.search(r"(?P<d>\d{1,2})\s*[-/ ]\s*(?P<m>[A-Za-z]{3,})\s*[-/ ]\s*(?P<y>\d{4})", raw)
    if m:
        day = int(m.group("d"))
        year = m.group("y")
        month_token = _best_month_token(m.group("m"))
        if not month_token:
            # Try to pull any alphabetic token and match the closest month.
            candidates = re.findall(r"[A-Za-z]{3,9}", raw)
            for cand in candidates:
                month_token = _best_month_token(cand)
                if month_token:
                    break
        if month_token:
            return f"{day:02d} {month_token} {year}"

    m2 = re.search(r"(?P<d>\d{1,2})[/-](?P<m>\d{1,2})[/-](?P<y>\d{4})", raw)
    if m2:
        day = int(m2.group("d"))
        month = int(m2.group("m"))
        year = int(m2.group("y"))
        if 1 <= month <= 12 and 1 <= day <= 31:
            return f"{day:02d}/{month:02d}/{year:04d}"

    return raw


def clean_amount_to_float(value: object) -> Optional[float]:
    """
    Convert an OCR amount-like value into a clean float.

    Keeps only digits and a single decimal point; strips currency symbols,
    commas, spaces, and other OCR noise. Returns None when no valid numeric
    value can be produced.
    """
    if value is None:
        return None

    if isinstance(value, (int, float)):
        try:
            numeric = float(value)
        except Exception:
            return None
        return numeric if numeric == numeric else None  # NaN guard

    raw = str(value).strip()
    if not raw:
        return None

    digits_and_dot = []
    dot_seen = False
    for ch in raw:
        if ch.isdigit():
            digits_and_dot.append(ch)
            continue
        if ch == "." and not dot_seen:
            digits_and_dot.append(ch)
            dot_seen = True

    cleaned = "".join(digits_and_dot).strip(".")
    if not cleaned or cleaned == ".":
        return None

    try:
        return float(cleaned)
    except Exception:
        return None


_AMOUNT_KEYWORDS = ("paid", "amount", "total", "payable", "debited", "credited")
_CURRENCY_KEYWORDS = ("₹", "rs", "inr", "rupee", "rupees")
_ID_CONTEXT_KEYWORDS = ("txn", "transaction", "utr", "rrn", "ref", "reference", "id", "upi")


def extract_transaction_amount(ocr_text: str) -> Optional[float]:
    """
    Identify the primary transaction amount from OCR text.

    Logic:
    - Find all numeric candidates (ints/floats with optional commas).
    - Ignore candidates that look like transaction IDs (long digit strings, or numbers near ID-ish labels).
    - Prefer the largest number that appears near amount/currency keywords ("Paid", "Amount", "₹", "Total").

    Returns a clean float, or None if no plausible amount can be found.
    """
    raw = (ocr_text or "").strip()
    if not raw:
        return None

    lowered = raw.lower()

    # Match comma-separated and plain numbers, optionally with decimals.
    number_pattern = re.compile(r"\b\d[\d,]{0,18}(?:\.\d{1,4})?\b")

    candidates: list[tuple[int, int, str]] = []
    for m in number_pattern.finditer(raw):
        candidates.append((m.start(), m.end(), m.group(0)))

    if not candidates:
        return None

    def is_id_like(num_str: str, start: int, end: int) -> bool:
        digits_only = re.sub(r"\D", "", num_str or "")
        digit_len = len(digits_only)
        has_decimal = "." in (num_str or "")

        # Long digit sequences are usually IDs (RRN/UTR/Txn/Ref).
        if not has_decimal and digit_len >= 10:
            return True

        # Context-based ID filtering (e.g., "Txn ID: 1234567890").
        ctx_start = max(0, start - 30)
        ctx_end = min(len(lowered), end + 30)
        context = lowered[ctx_start:ctx_end]
        if any(k in context for k in _ID_CONTEXT_KEYWORDS) and digit_len >= 8 and not has_decimal:
            return True

        return False

    def score_candidate(num_str: str, start: int, end: int) -> tuple[int, float]:
        ctx_start = max(0, start - 40)
        ctx_end = min(len(lowered), end + 40)
        context = lowered[ctx_start:ctx_end]

        score = 0
        if any(k in context for k in _AMOUNT_KEYWORDS):
            score += 3
        if any(k in context for k in _CURRENCY_KEYWORDS):
            score += 3

        # Slight boost if the number appears very close to the keyword.
        # This is a best-effort heuristic to prefer "Paid ₹123" over other numbers.
        window = lowered[max(0, start - 12) : min(len(lowered), end + 12)]
        if any(k in window for k in _AMOUNT_KEYWORDS) or any(k in window for k in _CURRENCY_KEYWORDS):
            score += 2

        value = clean_amount_to_float(num_str)
        return score, float(value) if value is not None else -1.0

    best_score = -1
    best_value: Optional[float] = None

    for start, end, token in candidates:
        if is_id_like(token, start, end):
            continue

        value = clean_amount_to_float(token)
        if value is None:
            continue

        if value != value:  # NaN
            continue

        # Filter implausible amounts and likely years unless decimals are present.
        if value <= 0 or value > 2000000:
            continue
        if float(int(value)) == value and 1900 <= int(value) <= 2099 and "." not in token:
            continue

        score, numeric = score_candidate(token, start, end)
        if numeric <= 0:
            continue

        if score > best_score or (score == best_score and (best_value is None or numeric > best_value)):
            best_score = score
            best_value = numeric

    # If nothing was near keywords, still return the largest plausible number we found.
    if best_value is not None:
        return float(best_value)

    return None


def build_amount_extraction_prompt(ocr_text: str) -> str:
    text = (ocr_text or "").strip()
    return (
        "You are extracting data from an OCR payment screenshot.\n"
        f"INSTRUCTIONS: {PRIMARY_TRANSACTION_AMOUNT_INSTRUCTIONS}\n"
        "Return ONLY the amount as a number, with an optional decimal point.\n"
        "No currency symbols, no commas, no words.\n\n"
        f"OCR_TEXT:\n{text[:2500]}"
    )


def _extract_json_object(text: str) -> Optional[dict]:
    raw = (text or "").strip()
    if not raw:
        return None

    # Remove fenced blocks if present.
    fence = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", raw, flags=re.I | re.S)
    if fence:
        raw = fence.group(1).strip()

    # Best-effort: find the first JSON object in the text.
    start = raw.find("{")
    end = raw.rfind("}")
    if start < 0 or end <= start:
        return None

    candidate = raw[start : end + 1].strip()
    try:
        parsed = json.loads(candidate)
    except Exception:
        return None

    return parsed if isinstance(parsed, dict) else None


def llm_extract_financial_fields(ocr_text: str) -> Dict[str, Any]:
    """
    LLM-first structured extraction from raw OCR text.

    Returns a dict with keys: amount, date, time, receiver, category (best-effort).
    If the model output is invalid/garbled, returns {} so callers can fall back.
    """
    text = (ocr_text or "").strip()
    if not text:
        return {}

    llm = get_llm()

    prompt = (
        f"System: {LLM_FINANCIAL_EXTRACTION_SYSTEM_PROMPT}\n"
        "OCR_TEXT:\n"
        f"{text[:8000]}\n"
    )

    try:
        response = llm.invoke(prompt)
        content = getattr(response, "content", None) or str(response)
    except Exception as exc:
        print(f"LLM extraction error: {exc}")
        return {}

    parsed = _extract_json_object(content)
    if not parsed:
        return {}

    # Normalize keys to expected lowercase shape.
    normalized: Dict[str, Any] = {}
    for key, value in parsed.items():
        if not isinstance(key, str):
            continue
        normalized[key.strip().lower()] = value

    result = {
        "amount": normalized.get("amount"),
        "date": normalized.get("date"),
        "time": normalized.get("time"),
        "receiver": normalized.get("receiver") or normalized.get("payee"),
        "category": normalized.get("category"),
    }

    return result
