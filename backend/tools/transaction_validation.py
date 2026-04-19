from __future__ import annotations

import re
from datetime import date, datetime
from decimal import Decimal
from enum import Enum
from typing import Any, Optional

try:
    from pydantic.v1 import BaseModel, ValidationError, condecimal, constr, validator
except Exception:  # pragma: no cover
    from pydantic import BaseModel, ValidationError, condecimal, constr, validator


class TransactionCategory(str, Enum):
    FOOD = "Food"
    TRAVEL = "Travel"
    BILLS = "Bills"
    ENTERTAINMENT = "Entertainment"
    SHOPPING = "Shopping"
    HEALTHCARE = "Healthcare"
    EDUCATION = "Education"
    OTHER = "Other"


_DATE_FORMATS = (
    "%Y-%m-%d",
    "%d/%m/%Y",
    "%m/%d/%Y",
    "%d-%m-%Y",
    "%B %d, %Y",
    "%b %d, %Y",
    "%d %b %Y",
    "%d %B %Y",
)


def parse_date(value: Any) -> date:
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, str):
        raw = value.strip()
        for fmt in _DATE_FORMATS:
            try:
                return datetime.strptime(raw, fmt).date()
            except ValueError:
                continue
    raise ValueError("date must be a valid date")


def normalize_time(value: Any) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, str):
        raw = value.strip()
    else:
        raw = str(value).strip()

    if not raw:
        return None

    # Accept HH:MM (24h) or H:MM, and also 12-hour with AM/PM.
    candidates = (
        ("%H:%M", raw),
        ("%H:%M", raw.zfill(5)) if re.fullmatch(r"\d:\d{2}", raw) else None,
        ("%I:%M %p", raw.upper()),
        ("%I:%M%p", raw.upper().replace(" ", "")),
    )

    for item in candidates:
        if not item:
            continue
        fmt, candidate = item
        try:
            parsed = datetime.strptime(candidate, fmt)
            return parsed.strftime("%H:%M")
        except ValueError:
            continue

    raise ValueError("time must be in HH:MM (24-hour) format")


class TransactionConfirmModel(BaseModel):
    amount: condecimal(gt=0)  # type: ignore[valid-type]
    receiver: constr(strip_whitespace=True, min_length=2)  # type: ignore[valid-type]
    sender: constr(strip_whitespace=True, min_length=2) = "Self"  # type: ignore[valid-type]
    date: date
    time: Optional[str] = None
    category: TransactionCategory = TransactionCategory.OTHER
    transaction_id: Optional[constr(strip_whitespace=True, min_length=4)] = None  # type: ignore[valid-type]
    ai_confidence: float = 0.5
    corrected: bool = False

    @validator("date", pre=True)
    def _parse_date(cls, value: Any) -> date:
        parsed = parse_date(value)
        if parsed > date.today():
            raise ValueError("date must not be in the future")
        return parsed

    @validator("time", pre=True)
    def _normalize_time(cls, value: Any) -> Optional[str]:
        return normalize_time(value)

    @validator("ai_confidence", pre=True)
    def _ai_confidence_range(cls, value: Any) -> float:
        try:
            numeric = float(value)
        except Exception as exc:  # pragma: no cover
            raise ValueError("ai_confidence must be a number") from exc
        if numeric < 0.0 or numeric > 1.0:
            raise ValueError("ai_confidence must be between 0 and 1")
        return numeric

    def to_db_dict(self) -> dict:
        data = self.dict()
        amt = data.get("amount")
        if isinstance(amt, Decimal):
            data["amount"] = float(amt)
        if isinstance(data.get("date"), date):
            data["date"] = data["date"].isoformat()
        data["category"] = (
            data["category"].value if isinstance(data.get("category"), TransactionCategory) else data.get("category")
        )
        return data
