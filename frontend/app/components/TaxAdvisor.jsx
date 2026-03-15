'use client'

import { useState } from 'react';
import { createClient } from '../../lib/supabase/client.js';
import { formatINR } from '../../lib/formatters';

export default function TaxAdvisor() {
  const [annualIncome, setAnnualIncome] = useState('');
  const [existing80c, setExisting80c] = useState('');
  const [recommendation, setRecommendation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const supabase = createClient();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setRecommendation(null);

    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token || localStorage.getItem('sb-token') || 'dev-token';

      const response = await fetch('http://127.0.0.1:8000/api/tax-saving-plan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          annual_income: parseFloat(annualIncome),
          existing_80c: parseFloat(existing80c) || 0
        })
      });

      if (!response.ok) throw new Error('Failed to get tax recommendation');

      const dataJson = await response.json();
      setRecommendation(dataJson);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="mb-8 bg-white/85 backdrop-blur border border-white/70 rounded-3xl shadow-xl shadow-slate-200/60 p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Indian Tax Advisor</h2>
          <p className="text-sm text-slate-600">Get personalized tax regime recommendations for FY 2025-26/2026-27.</p>
        </div>
        <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Tax Optimization</div>
      </div>

      <form onSubmit={handleSubmit} className="mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Annual Income (₹)</label>
            <input
              type="number"
              value={annualIncome}
              onChange={(e) => setAnnualIncome(e.target.value)}
              placeholder="e.g., 1000000"
              required
              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 focus:ring-2 focus:ring-slate-500 focus:border-slate-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Existing 80C Investments (₹)</label>
            <input
              type="number"
              value={existing80c}
              onChange={(e) => setExisting80c(e.target.value)}
              placeholder="e.g., 50000"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 focus:ring-2 focus:ring-slate-500 focus:border-slate-500"
            />
          </div>
        </div>
        <button
          type="submit"
          disabled={loading}
          className="px-6 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Getting Recommendation...' : 'Get Tax Recommendation'}
        </button>
      </form>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {recommendation && (
        <div className="bg-linear-to-br from-slate-50 to-slate-100/80 border border-slate-200/60 rounded-2xl p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Tax Recommendation</h3>
          <p className="text-slate-700 mb-4">{recommendation.recommendation}</p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <div className="bg-white p-4 rounded-lg border border-slate-200">
              <h4 className="font-medium text-slate-900">New Regime Tax</h4>
              <p className="text-2xl font-bold text-slate-700">{formatINR(recommendation.tax_new_regime)}</p>
            </div>
            <div className="bg-white p-4 rounded-lg border border-slate-200">
              <h4 className="font-medium text-slate-900">Old Regime Tax</h4>
              <p className="text-2xl font-bold text-slate-700">{formatINR(recommendation.tax_old_regime)}</p>
            </div>
            <div className="bg-white p-4 rounded-lg border border-slate-200">
              <h4 className="font-medium text-slate-900">Potential Savings</h4>
              <p className="text-2xl font-bold text-green-600">{formatINR(recommendation.potential_savings)}</p>
            </div>
          </div>

          {recommendation.investment_gap_80c && (
            <div className="mb-4">
              <h4 className="font-medium text-slate-900 mb-2">Investment Gap (80C)</h4>
              <p className="text-slate-700">{formatINR(recommendation.investment_gap_80c)}</p>
            </div>
          )}

          {recommendation.suggestions && recommendation.suggestions.length > 0 && (
            <div>
              <h4 className="font-medium text-slate-900 mb-2">Suggestions</h4>
              <ul className="list-disc list-inside text-slate-700">
                {recommendation.suggestions.map((suggestion, index) => (
                  <li key={index}>{suggestion}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}