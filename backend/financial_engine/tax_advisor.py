class IndiaTaxEngine:
    def __init__(self):
        pass

    def format_inr(self, amount):
        """
        Format amount in Indian Rupee format
        """
        amount = int(amount)
        s = str(amount)
        if len(s) <= 3:
            return s
        # Indian numbering: groups of 2 after first 3 digits
        first_part = s[:-3]
        last_part = s[-3:]
        formatted_first = ""
        while len(first_part) > 2:
            formatted_first = "," + first_part[-2:] + formatted_first
            first_part = first_part[:-2]
        if first_part:
            formatted_first = first_part + formatted_first
        return formatted_first + "," + last_part

    def calculate_new_regime_tax(self, gross_income):
        """
        Calculate tax under New Regime for FY 2025-26/2026-27
        Standard Deduction: ₹75,000
        Slabs: 0-3L (Nil), 3-6L (5%), 6-9L (10%), 9-12L (15%), 12-15L (20%), >15L (30%)
        Section 87A rebate for income up to ₹7L taxable (simplified to ₹12.75L as per requirement)
        """
        taxable = max(0, gross_income - 75000)
        tax = self._calculate_new_slabs(taxable)
        if taxable <= 1275000:
            tax = 0  # Section 87A rebate
        return tax

    def _calculate_new_slabs(self, taxable):
        tax = 0
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

    def calculate_old_regime_tax(self, gross_income, deductions_80c=0, deductions_80d=0):
        """
        Calculate tax under Old Regime
        Standard Deduction: ₹50,000
        Deductions: 80C (max ₹1.5L), 80D
        Slabs: 0-2.5L (Nil), 2.5-5L (5%), 5-10L (20%), >10L (30%)
        """
        total_deductions = 50000 + min(deductions_80c, 150000) + deductions_80d
        taxable = max(0, gross_income - total_deductions)
        tax = self._calculate_old_slabs(taxable)
        return tax

    def _calculate_old_slabs(self, taxable):
        tax = 0
        if taxable > 1000000:
            tax += (taxable - 1000000) * 0.30
            taxable = 1000000
        if taxable > 500000:
            tax += (taxable - 500000) * 0.20
            taxable = 500000
        if taxable > 250000:
            tax += (taxable - 250000) * 0.05
        return tax


def get_recommendations(income, current_80c_investments):
    """
    Compare New and Old Regime taxes and provide recommendations
    """
    engine = IndiaTaxEngine()
    tax_new = engine.calculate_new_regime_tax(income)
    tax_old = engine.calculate_old_regime_tax(income, current_80c_investments, 0)  # Assuming 80D = 0

    if tax_new <= tax_old:
        tax_save = tax_old - tax_new
        recommendation = f"Opt for the New Tax Regime. Your tax liability would be ₹{engine.format_inr(tax_new)}, saving you ₹{engine.format_inr(tax_save)} compared to the Old Regime (₹{engine.format_inr(tax_old)})."
    else:
        tax_save = tax_new - tax_old
        recommendation = f"Opt for the Old Tax Regime. Your tax liability would be ₹{engine.format_inr(tax_old)}, saving you ₹{engine.format_inr(tax_save)} compared to the New Regime (₹{engine.format_inr(tax_new)})."
        
        gap = 150000 - current_80c_investments
        if gap > 0:
            recommendation += f" To maximize your tax savings, consider investing an additional ₹{engine.format_inr(gap)} in Section 80C eligible instruments such as ELSS for potential equity growth or PPF for guaranteed returns and safety."
        
        recommendation += " Additionally, you can claim an extra deduction of up to ₹50,000 under Section 80CCD(1B) for investments in NPS."

    return recommendation