'use client'

import { useState, useEffect } from 'react';
import { createClient } from '../../lib/supabase/client.js';
import { formatINR } from '../../lib/formatters';

export default function WealthPanel() {
  const [taxRegime, setTaxRegime] = useState('old');
  const [risk, setRisk] = useState('medium');
  const [advice, setAdvice] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [monthlyAmount, setMonthlyAmount] = useState(1000);
  const [sipProjection, setSipProjection] = useState(null);
  const [projectionError, setProjectionError] = useState(null);
  const [uncategorizedTotal, setUncategorizedTotal] = useState(null);

  const supabase = createClient();

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setCurrentUserId(data.session?.user?.id || null);
      const token = data.session?.access_token;
      if (token) {
        localStorage.setItem('sb-token', token);
      }
    });
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setCurrentUserId(session?.user?.id || null);
      const token = session?.access_token;
      if (token) {
        localStorage.setItem('sb-token', token);
      }
    });
    return () => {
      active = false;
      authListener?.subscription?.unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    let ignore = false;
    const fetchAdvice = async () => {
      setAdvice(null);
      setLoading(true);
      setError(null);
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token || localStorage.getItem('sb-token') || 'dev-token';
        const url = `http://127.0.0.1:8000/api/recommendation?risk=${risk}&tax_regime=${taxRegime}&t=${Date.now()}`;
        const response = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        if (!response.ok) throw new Error('Backend unavailable');
        const dataJson = await response.json();
        if (!ignore) setAdvice(dataJson);
      } catch (err) {
        if (!ignore) setError(err.message);
      } finally {
        if (!ignore) setLoading(false);
      }
    };
    fetchAdvice();
    return () => { ignore = true; };
  }, [currentUserId, taxRegime, risk]);

  useEffect(() => {
    let ignore = false;
    const timeoutId = setTimeout(() => {
      const fetchProjections = async () => {
        setProjectionError(null);
        try {
          const params = new URLSearchParams({
            monthly_amount: String(monthlyAmount),
            years: '10',
            annual_return: '12',
            annual_amount: '10000',
            interest_rate: '7.1'
          });
          const url = `http://127.0.0.1:8000/ai/calculate-projections?${params.toString()}`;
          const response = await fetch(url);
          if (!response.ok) throw new Error('Projection fetch failed');
          const dataJson = await response.json();
          if (!ignore) setSipProjection(dataJson?.sip || null);
        } catch (err) {
          if (!ignore) setProjectionError(err.message);
        }
      };
      fetchProjections();
    }, 300);
    return () => {
      ignore = true;
      clearTimeout(timeoutId);
    };
  }, [monthlyAmount]);

  useEffect(() => {
    let ignore = false;
    const fetchStats = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token || localStorage.getItem('sb-token');
        if (!token) return;
        const res = await fetch('http://127.0.0.1:8000/user/financial-stats', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) return;
        const stats = await res.json();
        if (!ignore) setUncategorizedTotal(Number(stats?.uncategorized_total ?? 0));
      } catch (_) {
        if (!ignore) setUncategorizedTotal(null);
      }
    };
    if (currentUserId) fetchStats();
    return () => { ignore = true; };
  }, [currentUserId]);

  return (
    <section className={`mb-8 bg-white/85 backdrop-blur border border-white/70 rounded-3xl shadow-xl shadow-slate-200/60 p-6 transition-opacity ${loading ? 'opacity-50' : 'opacity-100'}`}>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Wealth & Investment Dashboard</h2>
          <p className="text-sm text-slate-600">AI-powered investment recommendations and live NAV tracking.</p>
        </div>
        <div className="text-xs uppercase tracking-[0.2em] text-slate-400">FinSight Wealth</div>
      </div>

      {/* Recommendation Card */}
      <div className="mb-8 bg-linear-to-br from-slate-50 to-slate-100/80 border border-slate-200/60 rounded-2xl p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Personalized Recommendation</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Tax Regime</label>
            <select
              value={taxRegime}
              onChange={(e) => setTaxRegime(e.target.value)}
              disabled={loading}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 focus:ring-2 focus:ring-slate-500 focus:border-slate-500 disabled:opacity-50"
            >
              <option value="old">Old Regime (80C Deduction)</option>
              <option value="new">New Regime (No 80C)</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Risk Profile</label>
            <select
              value={risk}
              onChange={(e) => setRisk(e.target.value)}
              disabled={loading}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 focus:ring-2 focus:ring-slate-500 focus:border-slate-500 disabled:opacity-50"
            >
              <option value="low">Low Risk</option>
              <option value="medium">Medium Risk</option>
              <option value="high">High Risk</option>
            </select>
          </div>
        </div>

        {loading && (
          <div className="flex items-center gap-3 text-slate-600">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-slate-600"></div>
            <p>Fetching recommendations...</p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 bg-red-100 rounded-full flex items-center justify-center text-red-600 font-semibold text-xs">!</div>
              <p className="text-red-800 font-medium">Connection Error</p>
            </div>
            <p className="text-red-600 text-sm mt-1">Unable to fetch investment data. Please check if the backend server is running.</p>
          </div>
        )}

        {advice && !loading && !error && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-5 h-5 bg-green-100 rounded-full flex items-center justify-center text-green-600 font-semibold text-xs">✓</div>
              <p className="text-green-800 font-medium">Recommendation</p>
            </div>
            <p className="text-green-700">{advice.recommendation ? advice.recommendation : 'No recommendation available.'}</p>
          </div>
        )}
      </div>

      {/* Live NAV Table */}
      {advice && !loading && (
        <div className="mb-8">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Live NAV Data</h3>
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Fund Type</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Fund Name</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Latest NAV</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {advice.elss_navs && Object.entries(advice.elss_navs).map(([name, nav]) => (
                    <tr key={name} className="hover:bg-slate-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">ELSS</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-700">{name}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900 font-mono">₹{nav.toFixed(2)}</td>
                    </tr>
                  ))}
                  {advice.sip_navs && Object.entries(advice.sip_navs).map(([name, nav]) => (
                    <tr key={name} className="hover:bg-slate-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">SIP</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-700">{name}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900 font-mono">₹{nav.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Projection Insights */}
      {advice && !loading && (
        <div className="bg-linear-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center text-blue-600">
              💡
            </div>
            <h3 className="text-lg font-semibold text-blue-900">Investment Projections</h3>
            {uncategorizedTotal !== null && Math.round(uncategorizedTotal) === Math.round(monthlyAmount) && (
              <span className="ml-2 inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">
                Opportunity Cost of Leaks
              </span>
            )}
          </div>
          <div className="mb-5 bg-white/60 rounded-lg p-4">
            <label className="block text-sm font-medium text-slate-700 mb-2">Monthly Amount</label>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min="500"
                max="20000"
                step="500"
                value={monthlyAmount}
                onChange={(e) => setMonthlyAmount(Number(e.target.value))}
                className="w-full"
              />
              <span className="text-sm font-semibold text-slate-900">{formatINR(monthlyAmount)}</span>
            </div>
            <p className="text-xs text-slate-500 mt-2">Adjust to see how your SIP grows over 10 years at 12%.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white/60 rounded-lg p-4">
              <h4 className="font-semibold text-slate-900 mb-2">PPF Maturity Example</h4>
              <p className="text-sm text-slate-600 mb-2">Annual investment of ₹10,000 for 15 years at 7.1% interest</p>
              <p className="text-2xl font-bold text-green-600">{formatINR(advice.ppf_example_maturity)}</p>
            </div>
            <div className="bg-white/60 rounded-lg p-4">
              <h4 className="font-semibold text-slate-900 mb-2">SIP Maturity Example</h4>
              <p className="text-sm text-slate-600 mb-2">Monthly investment of {formatINR(monthlyAmount)} for 10 years at 12% annual return</p>
              <p className="text-2xl font-bold text-green-600">{formatINR(sipProjection?.maturity_amount || 0)}</p>
              <p className="text-xs text-slate-600 mt-2">Potential Interest Earned: {formatINR(sipProjection?.total_interest || 0)}</p>
              {projectionError && (
                <p className="text-xs text-rose-600 mt-2">Projection unavailable. Please check backend.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
