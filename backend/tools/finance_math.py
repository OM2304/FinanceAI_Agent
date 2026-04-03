def calculate_sip(monthly_amount, years, annual_return=12):
    """
    Calculate SIP maturity and total interest earned.
    Assumes monthly contribution and monthly compounding, contributions at period start.
    Returns (maturity_amount, total_interest).
    """
    monthly_amount = float(monthly_amount)
    years = float(years)
    annual_return = float(annual_return)

    n = int(round(years * 12))
    if n <= 0 or monthly_amount <= 0:
        return 0.0, 0.0

    r = (annual_return / 100.0) / 12.0
    if r == 0:
        maturity = monthly_amount * n
    else:
        maturity = monthly_amount * (((1 + r) ** n - 1) / r) * (1 + r)
    invested = monthly_amount * n
    interest = maturity - invested
    return round(maturity, 2), round(interest, 2)


def calculate_ppf(annual_amount, years, interest_rate=7.1):
    """
    Calculate PPF maturity and total interest earned.
    Assumes annual contribution and annual compounding, contributions at period start.
    Returns (maturity_amount, total_interest).
    """
    annual_amount = float(annual_amount)
    years = float(years)
    interest_rate = float(interest_rate)

    n = int(round(years))
    if n <= 0 or annual_amount <= 0:
        return 0.0, 0.0

    r = (interest_rate / 100.0)
    if r == 0:
        maturity = annual_amount * n
    else:
        maturity = annual_amount * (((1 + r) ** n - 1) / r) * (1 + r)
    invested = annual_amount * n
    interest = maturity - invested
    return round(maturity, 2), round(interest, 2)
