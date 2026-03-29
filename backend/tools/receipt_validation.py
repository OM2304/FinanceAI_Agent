from __future__ import annotations

import os
import re
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from enum import Enum
from typing import Any, Dict, Iterable, Optional, Tuple

try:
    # Pydantic v2 ships a v1-compat layer used by older FastAPI versions.
    from pydantic.v1 import BaseModel, Field, ValidationError, condecimal, validator
except Exception:  # pragma: no cover
    from pydantic import BaseModel, Field, ValidationError, condecimal, validator


class ExpenseCategory(str, Enum):
    FOOD = "Food"
    TRAVEL = "Travel"
    BILLS = "Bills"
    ENTERTAINMENT = "Entertainment"
    SHOPPING = "Shopping"
    HEALTHCARE = "Healthcare"
    EDUCATION = "Education"
    OTHER = "Other"


ALLOWED_CATEGORIES = {c.value for c in ExpenseCategory}
SUPPORTED_RECEIPT_EXTENSIONS = {".png", ".jpg", ".jpeg", ".pdf"}
ALLOWED_TYPES = ["payment_screenshot", "printed_receipt", "invoice"]


class OCRError(Exception):
    """
    Raised for user-actionable OCR and ingestion failures.

    `code` is stable for programmatic handling; `message` is safe to display to end users.
    """

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message

    @classmethod
    def low_confidence(cls) -> "OCRError":
        return cls(
            code="LOW_CONFIDENCE",
            message="The receipt image is too blurry/illegible. Please upload a clearer photo or scan.",
        )

    @classmethod
    def missing_fields(cls, missing: Iterable[str]) -> "OCRError":
        missing_list = ", ".join(sorted(set(missing)))
        return cls(
            code="MISSING_FIELDS",
            message=f"Could not detect required fields: {missing_list}. Please upload a clearer receipt.",
        )

    @classmethod
    def invalid_file(cls) -> "OCRError":
        supported = ", ".join(sorted(SUPPORTED_RECEIPT_EXTENSIONS))
        return cls(
            code="INVALID_FILE",
            message=f"Unsupported file type. Please upload one of: {supported}.",
        )

    @classmethod
    def invalid_image_type(cls) -> "OCRError":
        return cls(
            code="INVALID_IMAGE_TYPE",
            message="This image does not appear to be a payment screenshot or receipt. Please upload a valid financial document.",
        )


class Expense(BaseModel):
    amount: condecimal(gt=0) = Field(..., description="Positive expense total amount.")
    date: date = Field(..., description="Expense date; must not be in the future.")
    category: ExpenseCategory = Field(..., description=f"One of: {', '.join(sorted(ALLOWED_CATEGORIES))}.")

    merchant: Optional[str] = Field(default=None, description="Optional merchant/vendor name.")
    currency: Optional[str] = Field(default=None, description="Optional currency code/symbol (e.g., INR, USD).")

    @validator("date")
    def _date_not_in_future(cls, value: date) -> date:
        if value > date.today():
            raise ValueError("date must not be in the future")
        return value

    @validator("category", pre=True)
    def _normalize_category(cls, value: Any) -> Any:
        if value is None:
            return value
        if isinstance(value, ExpenseCategory):
            return value
        if isinstance(value, str):
            normalized = value.strip().lower()
            for cat in ExpenseCategory:
                if cat.value.lower() == normalized:
                    return cat
        return value


@dataclass(frozen=True)
class ReceiptExtraction:
    total_amount: Optional[Decimal]
    receipt_date: Optional[date]
    receipt_time: Optional[str] = None
    merchant: Optional[str] = None
    currency: Optional[str] = None
    suggested_category: ExpenseCategory = ExpenseCategory.OTHER


def _is_supported_receipt_file(file_name: str) -> bool:
    _, ext = os.path.splitext(file_name or "")
    return ext.lower() in SUPPORTED_RECEIPT_EXTENSIONS


def _parse_decimal_amount(raw: str) -> Decimal:
    normalized = raw.strip().replace(",", "")
    try:
        value = Decimal(normalized)
    except (InvalidOperation, ValueError) as exc:
        raise ValueError("invalid amount format") from exc
    return value


_TOTAL_AMOUNT_PATTERNS: Tuple[re.Pattern[str], ...] = (
    re.compile(
        r"(?:grand\s*total|total\s*amount|amount\s*due|total)\s*[:\-]?\s*(?:inr|rs\.?|₹|\$|€)?\s*([0-9][0-9,]*\.?[0-9]{0,2})",
        re.IGNORECASE,
    ),
    re.compile(r"(?:inr|rs\.?|₹|\$|€)\s*([0-9][0-9,]*\.?[0-9]{0,2})", re.IGNORECASE),
)


def _extract_total_amount(text: str) -> Optional[Decimal]:
    for pattern in _TOTAL_AMOUNT_PATTERNS:
        match = pattern.search(text or "")
        if not match:
            continue
        value = _parse_decimal_amount(match.group(1))
        if value > 0:
            return value
    return None


_DATE_CANDIDATE_PATTERNS: Tuple[re.Pattern[str], ...] = (
    re.compile(r"\b(\d{4}-\d{2}-\d{2})\b"),  # 2026-03-29
    re.compile(r"\b(\d{2}/\d{2}/\d{4})\b"),  # 29/03/2026
    re.compile(r"\b(\d{2}-\d{2}-\d{4})\b"),  # 29-03-2026
    re.compile(r"\b([A-Za-z]{3,9}\s+\d{1,2},\s*\d{4})\b"),  # March 29, 2026
)


_DATE_FORMATS: Tuple[str, ...] = (
    "%Y-%m-%d",
    "%d/%m/%Y",
    "%m/%d/%Y",
    "%d-%m-%Y",
    "%B %d, %Y",
    "%b %d, %Y",
)


def _extract_receipt_date(text: str) -> Optional[date]:
    candidates: list[str] = []
    for pattern in _DATE_CANDIDATE_PATTERNS:
        candidates.extend(pattern.findall(text or ""))

    for candidate in candidates:
        candidate = candidate.strip()
        for fmt in _DATE_FORMATS:
            try:
                return datetime.strptime(candidate, fmt).date()
            except ValueError:
                continue
    return None


def _suggest_category(text: str) -> ExpenseCategory:
    haystack = (text or "").lower()
    if any(token in haystack for token in ("uber", "ola", "flight", "train", "metro", "taxi", "hotel")):
        return ExpenseCategory.TRAVEL
    if any(token in haystack for token in ("restaurant", "cafe", "coffee", "pizza", "burger", "dine")):
        return ExpenseCategory.FOOD
    if any(token in haystack for token in ("electricity", "water bill", "internet", "broadband", "gas bill")):
        return ExpenseCategory.BILLS
    if any(token in haystack for token in ("movie", "cinema", "netflix", "prime video", "spotify")):
        return ExpenseCategory.ENTERTAINMENT
    if any(token in haystack for token in ("pharmacy", "hospital", "clinic", "medical")):
        return ExpenseCategory.HEALTHCARE
    if any(token in haystack for token in ("school", "tuition", "course", "university")):
        return ExpenseCategory.EDUCATION
    if any(token in haystack for token in ("mall", "shopping", "store", "supermarket", "amazon")):
        return ExpenseCategory.SHOPPING
    return ExpenseCategory.OTHER


def _simulate_ocr(file_name: str) -> Tuple[str, float]:
    """
    Returns (ocr_text, confidence) for demo/testing without an OCR provider.
    """
    base = (os.path.basename(file_name or "")).lower()
    if "blurry" in base or "illegible" in base:
        return ".... .... ....", 0.25
    if "missing" in base:
        return "Thank you for your purchase\nMerchant: Demo Store\n", 0.85
    return "Merchant: Demo Cafe\nDate: 2026-03-29\nTotal Amount: INR 450.50\n", 0.92


def classify_document_type(*, file_name: str = "", ocr_text: str = "") -> str:
    """
    AI-assisted (with heuristic fallback) classification to prevent processing non-financial images.

    Returns one of ALLOWED_TYPES or "unknown".
    """
    text = (ocr_text or "").strip()
    fname = (file_name or "").lower()

    # Heuristic fallback (fast + offline safe)
    haystack = f"{fname}\n{text}".lower()
    if "invoice" in haystack:
        return "invoice"
    if any(token in haystack for token in ("screenshot", "upi", "payment", "paid", "txn", "transaction")):
        return "payment_screenshot"
    if any(token in haystack for token in ("receipt", "total", "subtotal", "tax", "gst", "amount", "bill")):
        return "printed_receipt"

    # Optional AI refinement when an LLM is configured (best-effort)
    try:
        from tools.llm_config import get_llm

        llm = get_llm()
        prompt = (
            "Classify this OCR text into one of: payment_screenshot, printed_receipt, invoice, unknown.\n"
            "Return ONLY the label.\n\n"
            f"FILENAME: {file_name}\n"
            f"OCR_TEXT:\n{text[:2500]}"
        )
        response = llm.invoke(prompt)
        label = str(getattr(response, "content", response)).strip().strip('"').strip("'").lower()
        if label in ALLOWED_TYPES:
            return label
    except Exception:
        pass

    return "unknown"


def extract_receipt_fields(ocr_text: str) -> ReceiptExtraction:
    total_amount = _extract_total_amount(ocr_text)
    receipt_date = _extract_receipt_date(ocr_text)
    receipt_time = _extract_receipt_time(ocr_text)

    currency_match = re.search(r"\b(INR|USD|EUR)\b", ocr_text or "", flags=re.IGNORECASE)
    currency = currency_match.group(1).upper() if currency_match else None
    merchant_match = re.search(r"(?:merchant|vendor|store)\s*[:\-]\s*(.+)", ocr_text or "", flags=re.IGNORECASE)
    merchant = merchant_match.group(1).strip() if merchant_match else None
    suggested_category = _suggest_category(ocr_text)

    return ReceiptExtraction(
        total_amount=total_amount,
        receipt_date=receipt_date,
        receipt_time=receipt_time,
        merchant=merchant,
        currency=currency,
        suggested_category=suggested_category,
    )


_TIME_PATTERNS: Tuple[re.Pattern[str], ...] = (
    re.compile(r"\b((?:[01]\d|2[0-3]):[0-5]\d)\b"),  # 23:59
    re.compile(r"\b((?:0?[1-9]|1[0-2]):[0-5]\d\s?(?:AM|PM))\b", re.IGNORECASE),  # 1:05 PM
)


def _extract_receipt_time(text: str) -> Optional[str]:
    for pattern in _TIME_PATTERNS:
        match = pattern.search(text or "")
        if not match:
            continue
        return match.group(1).strip()
    return None


def _expense_to_json_dict(expense: Expense) -> Dict[str, Any]:
    payload: Dict[str, Any]
    if hasattr(expense, "model_dump"):
        payload = expense.model_dump()  # type: ignore[attr-defined]
    else:
        payload = expense.dict()

    amount = payload.get("amount")
    if isinstance(amount, Decimal):
        payload["amount"] = str(amount)
    if isinstance(payload.get("date"), date):
        payload["date"] = payload["date"].isoformat()
    if isinstance(payload.get("category"), ExpenseCategory):
        payload["category"] = payload["category"].value
    return payload


def flatten_pydantic_error(exc: ValidationError) -> str:
    """
    Convert Pydantic ValidationError into a compact, user-readable string.
    """
    try:
        items = []
        for err in exc.errors():
            loc = err.get("loc") or []
            field = ".".join(str(p) for p in loc) if loc else "field"
            msg = err.get("msg") or "Invalid value"
            items.append(f"{field}: {msg}")
        return "; ".join(items) if items else str(exc)
    except Exception:  # pragma: no cover
        return str(exc)


def process_receipt_ocr(
    file_name: str,
    *,
    ocr_text: Optional[str] = None,
    ocr_confidence: Optional[float] = None,
    category: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Simulates OCR extraction + validates a receipt into an Expense.

    Returns a clean JSON-ready dict on success and a user-friendly error payload on failure.
    """
    try:
        if not _is_supported_receipt_file(file_name):
            raise OCRError.invalid_file()

        if ocr_text is None or ocr_confidence is None:
            simulated_text, simulated_conf = _simulate_ocr(file_name)
            ocr_text = simulated_text if ocr_text is None else ocr_text
            ocr_confidence = simulated_conf if ocr_confidence is None else ocr_confidence

        if not (ocr_text or "").strip():
            return {
                "success": False,
                "error": "OCR_FAILED",
                "message": "OCR failed to read the image. Please upload a clearer photo or scan.",
            }

        document_type = classify_document_type(file_name=file_name, ocr_text=ocr_text or "")
        if document_type not in ALLOWED_TYPES:
            err = OCRError.invalid_image_type()
            return {
                "success": False,
                "error": err.code,
                "message": err.message,
                "document_type": document_type,
                "allowed_types": ALLOWED_TYPES,
            }

        extracted = extract_receipt_fields(ocr_text or "")
        chosen_category = category or extracted.suggested_category.value

        is_manual_fix_required = any(
            value is None for value in (extracted.total_amount, extracted.receipt_date, extracted.receipt_time)
        )

        expense = None
        if extracted.total_amount is not None and extracted.receipt_date is not None:
            expense = Expense(
                amount=extracted.total_amount,
                date=extracted.receipt_date,
                category=chosen_category,
                merchant=extracted.merchant,
                currency=extracted.currency,
            )
        return {
            "success": True,
            "is_manual_fix_required": is_manual_fix_required,
            "document_type": document_type,
            "allowed_types": ALLOWED_TYPES,
            "extracted_data": {
                "amount": str(extracted.total_amount) if extracted.total_amount is not None else None,
                "date": extracted.receipt_date.isoformat() if extracted.receipt_date is not None else None,
                "time": extracted.receipt_time or None,
                "category": chosen_category,
                "merchant": extracted.merchant,
                "currency": extracted.currency,
            },
            "expense": _expense_to_json_dict(expense) if expense is not None else None,
        }
    except OCRError as exc:
        return {
            "success": False,
            "error": exc.code,
            "message": exc.message,
        }
    except ValidationError as exc:
        return {
            "success": False,
            "error": "VALIDATION_ERROR",
            "message": flatten_pydantic_error(exc),
        }
