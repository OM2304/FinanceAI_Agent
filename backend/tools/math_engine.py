from typing import Dict, Any
from langchain_core.tools import tool


def _to_float(value, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _round_money(value: float) -> float:
    try:
        return round(float(value), 2)
    except (TypeError, ValueError):
        return 0.0


# ------------------------------
# Core Math Functions
# ------------------------------

def calculate_sip(monthly_amount: float, years: float, annual_return: float = 12.0) -> Dict[str, Any]:
    """
    SIP maturity with monthly compounding and contributions at period start.
    Returns a structured result for reliable downstream summarization.
    """
    monthly_amount = _to_float(monthly_amount)
    years = _to_float(years)
    annual_return = _to_float(annual_return)

    months = int(round(years * 12))
    if months <= 0 or monthly_amount <= 0:
        return {
            "status": "error",
            "reason": "months_or_amount_invalid",
            "months": months,
            "maturity_amount": 0.0,
            "total_invested": 0.0,
            "total_interest": 0.0,
        }

    r = (annual_return / 100.0) / 12.0
    if r == 0:
        maturity = monthly_amount * months
    else:
        maturity = monthly_amount * (((1 + r) ** months - 1) / r) * (1 + r)

    invested = monthly_amount * months
    interest = maturity - invested

    return {
        "status": "ok",
        "months": months,
        "monthly_amount": _round_money(monthly_amount),
        "annual_return_percent": _round_money(annual_return),
        "maturity_amount": _round_money(maturity),
        "total_invested": _round_money(invested),
        "total_interest": _round_money(interest),
    }


def calculate_ppf(annual_amount: float, years: float, interest_rate: float = 7.1) -> Dict[str, Any]:
    """
    PPF maturity with annual compounding and contributions at period start.
    Returns a structured result for reliable downstream summarization.
    """
    annual_amount = _to_float(annual_amount)
    years = _to_float(years)
    interest_rate = _to_float(interest_rate)

    n = int(round(years))
    if n <= 0 or annual_amount <= 0:
        return {
            "status": "error",
            "reason": "years_or_amount_invalid",
            "years": n,
            "maturity_amount": 0.0,
            "total_invested": 0.0,
            "total_interest": 0.0,
        }

    r = interest_rate / 100.0
    if r == 0:
        maturity = annual_amount * n
    else:
        maturity = annual_amount * (((1 + r) ** n - 1) / r) * (1 + r)

    invested = annual_amount * n
    interest = maturity - invested

    return {
        "status": "ok",
        "years": n,
        "annual_amount": _round_money(annual_amount),
        "interest_rate_percent": _round_money(interest_rate),
        "maturity_amount": _round_money(maturity),
        "total_invested": _round_money(invested),
        "total_interest": _round_money(interest),
    }


def calculate_cagr(begin_value: float, end_value: float, years: float) -> Dict[str, Any]:
    begin_value = _to_float(begin_value)
    end_value = _to_float(end_value)
    years = _to_float(years)
    if begin_value <= 0 or end_value <= 0 or years <= 0:
        return {
            "status": "error",
            "reason": "values_or_years_invalid",
            "cagr_percent": 0.0,
        }
    cagr = (end_value / begin_value) ** (1 / years) - 1
    return {
        "status": "ok",
        "begin_value": _round_money(begin_value),
        "end_value": _round_money(end_value),
        "years": _round_money(years),
        "cagr_percent": _round_money(cagr * 100.0),
    }


def calculate_emi(
    principal: float,
    annual_rate: float,
    years: float,
    payments_per_year: int = 12,
) -> Dict[str, Any]:
    principal = _to_float(principal)
    annual_rate = _to_float(annual_rate)
    years = _to_float(years)
    n = int(round(years * int(payments_per_year or 0)))
    if principal <= 0 or n <= 0:
        return {
            "status": "error",
            "reason": "principal_or_term_invalid",
            "emi": 0.0,
        }
    r = (annual_rate / 100.0) / float(payments_per_year or 1)
    if r == 0:
        emi = principal / n
    else:
        emi = principal * r * ((1 + r) ** n) / (((1 + r) ** n) - 1)
    total_payment = emi * n
    total_interest = total_payment - principal
    return {
        "status": "ok",
        "principal": _round_money(principal),
        "annual_rate_percent": _round_money(annual_rate),
        "years": _round_money(years),
        "payments_per_year": int(payments_per_year),
        "emi": _round_money(emi),
        "total_payment": _round_money(total_payment),
        "total_interest": _round_money(total_interest),
    }


def calculate_burn_rate(total_spent: float, days: float) -> Dict[str, Any]:
    total_spent = _to_float(total_spent)
    days = _to_float(days)
    if days <= 0:
        return {
            "status": "error",
            "reason": "days_invalid",
            "average_daily_burn_rate": 0.0,
        }
    burn = total_spent / days
    return {
        "status": "ok",
        "total_spent": _round_money(total_spent),
        "days": _round_money(days),
        "average_daily_burn_rate": _round_money(burn),
    }


def calculate_runway(current_balance: float, average_daily_burn_rate: float) -> Dict[str, Any]:
    current_balance = _to_float(current_balance)
    average_daily_burn_rate = _to_float(average_daily_burn_rate)
    if average_daily_burn_rate <= 0:
        return {
            "status": "error",
            "reason": "burn_rate_invalid",
            "runway_days": None,
        }
    runway_days = current_balance / average_daily_burn_rate
    return {
        "status": "ok",
        "current_balance": _round_money(current_balance),
        "average_daily_burn_rate": _round_money(average_daily_burn_rate),
        "runway_days": _round_money(runway_days),
    }


def adjust_for_inflation(
    amount: float,
    annual_inflation_rate: float,
    years: float,
    direction: str = "future",
) -> Dict[str, Any]:
    amount = _to_float(amount)
    annual_inflation_rate = _to_float(annual_inflation_rate)
    years = _to_float(years)
    if years < 0:
        return {
            "status": "error",
            "reason": "years_invalid",
            "adjusted_amount": 0.0,
        }
    r = annual_inflation_rate / 100.0
    factor = (1 + r) ** years
    if direction == "present":
        adjusted = amount / factor if factor else 0.0
    else:
        adjusted = amount * factor
    return {
        "status": "ok",
        "direction": direction,
        "amount": _round_money(amount),
        "annual_inflation_rate_percent": _round_money(annual_inflation_rate),
        "years": _round_money(years),
        "adjusted_amount": _round_money(adjusted),
    }


def calculate_percentage_change(old_value: float, new_value: float) -> Dict[str, Any]:
    old_value = _to_float(old_value)
    new_value = _to_float(new_value)
    if old_value == 0:
        return {
            "status": "error",
            "reason": "old_value_zero",
            "percent_change": None,
        }
    change = ((new_value - old_value) / old_value) * 100.0
    return {
        "status": "ok",
        "old_value": _round_money(old_value),
        "new_value": _round_money(new_value),
        "percent_change": _round_money(change),
    }


# ------------------------------
# India Tax Engine (Moved)
# ------------------------------

class IndiaTaxEngine:
    def __init__(self) -> None:
        pass

    def format_inr(self, amount: float) -> str:
        amount = int(_to_float(amount))
        s = str(amount)
        if len(s) <= 3:
            return s
        first_part = s[:-3]
        last_part = s[-3:]
        formatted_first = ""
        while len(first_part) > 2:
            formatted_first = "," + first_part[-2:] + formatted_first
            first_part = first_part[:-2]
        if first_part:
            formatted_first = first_part + formatted_first
        return formatted_first + "," + last_part

    def calculate_new_regime_tax(self, gross_income: float) -> float:
        taxable = max(0.0, _to_float(gross_income) - 75000.0)
        tax = self._calculate_new_slabs(taxable)
        if taxable <= 1275000:
            tax = 0.0
        return tax

    def _calculate_new_slabs(self, taxable: float) -> float:
        tax = 0.0
        if taxable > 1500000:
            tax += (taxable - 1500000) * 0.30
            taxable = 1500000
        if taxable > 1200000:
            tax += (taxable - 1200000) * 0.20
            taxable = 1200000
        if taxable > 900000:
            tax += (taxable - 900000) * 0.15
            taxable = 900000
        if taxable > 600000:
            tax += (taxable - 600000) * 0.10
            taxable = 600000
        if taxable > 300000:
            tax += (taxable - 300000) * 0.05
        return tax

    def calculate_old_regime_tax(
        self,
        gross_income: float,
        deductions_80c: float = 0.0,
        deductions_80d: float = 0.0,
    ) -> float:
        total_deductions = 50000 + min(_to_float(deductions_80c), 150000) + _to_float(deductions_80d)
        taxable = max(0.0, _to_float(gross_income) - total_deductions)
        tax = self._calculate_old_slabs(taxable)
        return tax

    def _calculate_old_slabs(self, taxable: float) -> float:
        tax = 0.0
        if taxable > 1000000:
            tax += (taxable - 1000000) * 0.30
            taxable = 1000000
        if taxable > 500000:
            tax += (taxable - 500000) * 0.20
            taxable = 500000
        if taxable > 250000:
            tax += (taxable - 250000) * 0.05
        return tax


def get_tax_recommendations(income: float, current_80c_investments: float) -> Dict[str, Any]:
    engine = IndiaTaxEngine()
    tax_new = engine.calculate_new_regime_tax(income)
    tax_old = engine.calculate_old_regime_tax(income, current_80c_investments, 0)

    if tax_new <= tax_old:
        tax_save = tax_old - tax_new
        recommendation = (
            f"Opt for the New Tax Regime. Your tax liability would be INR {engine.format_inr(tax_new)}, "
            f"saving you INR {engine.format_inr(tax_save)} compared to the Old Regime (INR {engine.format_inr(tax_old)})."
        )
    else:
        tax_save = tax_new - tax_old
        recommendation = (
            f"Opt for the Old Tax Regime. Your tax liability would be INR {engine.format_inr(tax_old)}, "
            f"saving you INR {engine.format_inr(tax_save)} compared to the New Regime (INR {engine.format_inr(tax_new)})."
        )

        gap = 150000 - _to_float(current_80c_investments)
        if gap > 0:
            recommendation += (
                f" To maximize your tax savings, consider investing an additional INR {engine.format_inr(gap)} "
                "in Section 80C eligible instruments such as ELSS for potential equity growth or PPF for guaranteed returns and safety."
            )

        recommendation += " Additionally, you can claim an extra deduction of up to INR 50,000 under Section 80CCD(1B) for investments in NPS."

    return {
        "tax_new_regime": _round_money(tax_new),
        "tax_old_regime": _round_money(tax_old),
        "tax_saving_recommendation": recommendation,
    }


# ------------------------------
# LangChain Tool Wrappers
# ------------------------------

def create_math_tools():
    @tool
    def sip_projection(monthly_amount: float, years: float, annual_return: float = 12.0) -> Dict[str, Any]:
        """Calculate SIP maturity amount, total invested, and total interest."""
        return calculate_sip(monthly_amount, years, annual_return)

    @tool
    def ppf_projection(annual_amount: float, years: float, interest_rate: float = 7.1) -> Dict[str, Any]:
        """Calculate PPF maturity amount, total invested, and total interest."""
        return calculate_ppf(annual_amount, years, interest_rate)

    @tool
    def cagr(begin_value: float, end_value: float, years: float) -> Dict[str, Any]:
        """Calculate CAGR percentage."""
        return calculate_cagr(begin_value, end_value, years)

    @tool
    def emi(principal: float, annual_rate: float, years: float, payments_per_year: int = 12) -> Dict[str, Any]:
        """Calculate EMI, total payment, and total interest."""
        return calculate_emi(principal, annual_rate, years, payments_per_year)

    @tool
    def burn_rate(total_spent: float, days: float) -> Dict[str, Any]:
        """Calculate average daily burn rate."""
        return calculate_burn_rate(total_spent, days)

    @tool
    def runway(current_balance: float, average_daily_burn_rate: float) -> Dict[str, Any]:
        """Calculate runway in days given balance and burn rate."""
        return calculate_runway(current_balance, average_daily_burn_rate)

    @tool
    def inflation_adjustment(amount: float, annual_inflation_rate: float, years: float, direction: str = "future") -> Dict[str, Any]:
        """Adjust amount for inflation (direction: 'future' or 'present')."""
        return adjust_for_inflation(amount, annual_inflation_rate, years, direction)

    @tool
    def percentage_change(old_value: float, new_value: float) -> Dict[str, Any]:
        """Calculate percentage change from old to new."""
        return calculate_percentage_change(old_value, new_value)

    @tool
    def tax_regime_comparison(annual_income: float, existing_80c: float = 0.0) -> Dict[str, Any]:
        """Compare old vs new tax regime and provide a recommendation."""
        return get_tax_recommendations(annual_income, existing_80c)

    return [
        sip_projection,
        ppf_projection,
        cagr,
        emi,
        burn_rate,
        runway,
        inflation_adjustment,
        percentage_change,
        tax_regime_comparison,
    ]
