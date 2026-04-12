from tools.math_engine import calculate_ppf as _calculate_ppf
from tools.math_engine import calculate_sip as _calculate_sip


def calculate_ppf(principal, years):
    result = _calculate_ppf(principal, years, 7.1)
    return result.get("maturity_amount", 0.0)


def calculate_sip(monthly_investment, months, annual_return):
    years = float(months) / 12.0
    result = _calculate_sip(monthly_investment, years, annual_return * 100 if annual_return <= 1 else annual_return)
    return result.get("maturity_amount", 0.0)


__all__ = ["calculate_ppf", "calculate_sip"]

