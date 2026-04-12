import math

from tools.math_engine import (
    calculate_sip,
    calculate_ppf,
    calculate_cagr,
    calculate_emi,
    calculate_burn_rate,
    calculate_runway,
    adjust_for_inflation,
    calculate_percentage_change,
    IndiaTaxEngine,
    get_tax_recommendations,
)


def assert_close(a, b, tol=0.01):
    assert math.isclose(float(a), float(b), rel_tol=0.0, abs_tol=tol)


def test_calculate_sip_basic():
    # 1,000 monthly for 1 year at 12% annual return
    result = calculate_sip(1000, 1, 12)
    assert result["status"] == "ok"
    # Expected maturity computed with formula (contrib at period start)
    expected_maturity = 1000 * (((1 + 0.01) ** 12 - 1) / 0.01) * (1 + 0.01)
    assert_close(result["maturity_amount"], expected_maturity)
    assert_close(result["total_invested"], 12000)
    assert_close(result["total_interest"], expected_maturity - 12000)


def test_calculate_ppf_basic():
    # 10,000 annual for 2 years at 7.1% annual
    result = calculate_ppf(10000, 2, 7.1)
    assert result["status"] == "ok"
    r = 0.071
    expected_maturity = 10000 * (((1 + r) ** 2 - 1) / r) * (1 + r)
    assert_close(result["maturity_amount"], expected_maturity)
    assert_close(result["total_invested"], 20000)
    assert_close(result["total_interest"], expected_maturity - 20000)


def test_calculate_cagr():
    result = calculate_cagr(100, 121, 2)
    assert result["status"] == "ok"
    # CAGR should be 10%
    assert_close(result["cagr_percent"], 10.0)


def test_calculate_emi_zero_rate():
    result = calculate_emi(120000, 0, 1, payments_per_year=12)
    assert result["status"] == "ok"
    assert_close(result["emi"], 10000.0)
    assert_close(result["total_payment"], 120000.0)
    assert_close(result["total_interest"], 0.0)


def test_calculate_emi_standard():
    # Example: 100,000 at 12% for 1 year (monthly)
    result = calculate_emi(100000, 12, 1, payments_per_year=12)
    assert result["status"] == "ok"
    r = 0.12 / 12
    n = 12
    expected = 100000 * r * ((1 + r) ** n) / (((1 + r) ** n) - 1)
    assert_close(result["emi"], expected)


def test_burn_rate_and_runway():
    burn = calculate_burn_rate(30000, 30)
    assert burn["status"] == "ok"
    assert_close(burn["average_daily_burn_rate"], 1000.0)

    runway = calculate_runway(50000, burn["average_daily_burn_rate"])
    assert runway["status"] == "ok"
    assert_close(runway["runway_days"], 50.0)


def test_inflation_adjustment_future_and_present():
    future = adjust_for_inflation(1000, 10, 2, direction="future")
    assert future["status"] == "ok"
    expected_future = 1000 * (1.1 ** 2)
    assert_close(future["adjusted_amount"], expected_future)

    present = adjust_for_inflation(1210, 10, 2, direction="present")
    assert present["status"] == "ok"
    expected_present = 1210 / (1.1 ** 2)
    assert_close(present["adjusted_amount"], expected_present)


def test_percentage_change():
    result = calculate_percentage_change(100, 110)
    assert result["status"] == "ok"
    assert_close(result["percent_change"], 10.0)


def test_tax_engine_new_vs_old():
    engine = IndiaTaxEngine()
    tax_new = engine.calculate_new_regime_tax(1000000)
    tax_old = engine.calculate_old_regime_tax(1000000, 150000, 0)
    # Sanity: taxes should be non-negative
    assert tax_new >= 0
    assert tax_old >= 0


def test_tax_recommendations_payload():
    payload = get_tax_recommendations(1000000, 50000)
    assert "tax_new_regime" in payload
    assert "tax_old_regime" in payload
    assert "tax_saving_recommendation" in payload
