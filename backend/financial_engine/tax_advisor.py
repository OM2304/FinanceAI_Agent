from tools.math_engine import IndiaTaxEngine, get_tax_recommendations


def get_recommendations(income, current_80c_investments):
    return get_tax_recommendations(income, current_80c_investments).get("tax_saving_recommendation")


__all__ = ["IndiaTaxEngine", "get_recommendations"]

