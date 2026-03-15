def calculate_ppf(principal, years):
    """
    Calculate PPF maturity amount.
    principal: annual deposit
    years: number of years
    Returns: maturity amount
    """
    rate = 0.071
    amount = 0
    for _ in range(years):
        amount = (amount + principal) * (1 + rate)
    return amount

def calculate_sip(monthly_investment, months, annual_return):
    """
    Calculate SIP future value.
    monthly_investment: monthly amount
    months: number of months
    annual_return: expected annual return (e.g., 0.12 for 12%)
    Returns: future value
    """
    monthly_rate = annual_return / 12
    future_value = monthly_investment * (((1 + monthly_rate)**months - 1) / monthly_rate)
    return future_value