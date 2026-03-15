def recommend_investment(risk_level, tax_regime):
    """
    Recommend PPF or ELSS based on risk and tax regime.
    risk_level: 'low', 'medium', 'high'
    tax_regime: 'old', 'new'
    Returns: 'PPF' or 'ELSS'
    """
    if tax_regime == 'old':
        if risk_level in ['low', 'medium']:
            return 'PPF'
        else:
            return 'ELSS'
    else:
        # In new tax regime, no 80C deduction, ELSS loses tax benefit
        return 'PPF'