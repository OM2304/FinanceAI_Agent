'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchPredictiveInsights } from '../../lib/api';
import { formatINR } from '../../lib/formatters';

function toFiniteNumber(value) {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function ZScoreDistributionIcon({ zScore }) {
  const z = toFiniteNumber(zScore);
  const normalized = clamp((z + 3) / 6, 0, 1);
  const markerX = 10 + (normalized * 64);
  const markerColor = Math.abs(z) >= 2 ? '#e11d48' : '#0f766e';

  return (
    <div className="inline-flex items-center gap-2">
      <svg width="84" height="26" viewBox="0 0 84 26" aria-label={`z-score ${z.toFixed(2)}`}>
        <path d="M10 22 C22 22, 24 5, 42 5 C60 5, 62 22, 74 22" fill="none" stroke="#94a3b8" strokeWidth="1.6" />
        <line x1="10" y1="22" x2="74" y2="22" stroke="#cbd5e1" strokeWidth="1" />
        <line x1={markerX} y1="6" x2={markerX} y2="23" stroke={markerColor} strokeWidth="2" />
        <circle cx={markerX} cy="6" r="2.2" fill={markerColor} />
      </svg>
      <span className="text-[11px] text-slate-500">z {z.toFixed(2)}</span>
    </div>
  );
}

export function PredictiveAnalytics({ showCoreCards = true } = {}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  // Draft input states (instant UI updates while typing)
  const [draftCurrentBalance, setDraftCurrentBalance] = useState('');
  const [draftScenarioCategory, setDraftScenarioCategory] = useState('Transfer');
  const [draftScenarioPercentage, setDraftScenarioPercentage] = useState('20');

  // Committed calculation params (only update after debounce / blur)
  const [params, setParams] = useState({
    currentBalance: null,
    scenarioCategory: 'Transfer',
    scenarioPercentage: 20,
  });

  const debounceRef = useRef(null);

  const query = useMemo(
    () => ({
      currentBalance: params.currentBalance,
      scenarioCategory: params.scenarioCategory,
      scenarioPercentage: params.scenarioPercentage,
    }),
    [params]
  );

  const commitParamsNow = () => {
    const balanceValue = draftCurrentBalance.trim() === '' ? null : draftCurrentBalance.trim();
    const pct = toFiniteNumber(draftScenarioPercentage);
    setParams({
      currentBalance: balanceValue,
      scenarioCategory: (draftScenarioCategory || 'Transfer').trim() || 'Transfer',
      scenarioPercentage: pct,
    });
  };

  // Debounce: only recompute/refetch after the user stops typing
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      commitParamsNow();
    }, 500);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftCurrentBalance, draftScenarioCategory, draftScenarioPercentage]);

  useEffect(() => {
    const load = async () => {
      const token = localStorage.getItem('sb-token');
      if (!token) return;
      setLoading(true);
      setError('');
      try {
        const res = await fetchPredictiveInsights(token, query);
        setData(res);
      } catch (err) {
        setError(err.message || 'Failed to load predictive insights');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [query]);

  if (loading && !data) {
    return (
      <section className="bg-white/85 backdrop-blur border border-white/70 rounded-3xl shadow-xl shadow-slate-200/60 p-6">
        <p className="text-sm text-slate-500">Loading predictive analysis...</p>
      </section>
    );
  }

  if (error || !data || (data.status && data.status !== 'ok' && data.status !== 'empty')) {
    return (
      <section className="bg-white/85 backdrop-blur border border-white/70 rounded-3xl shadow-xl shadow-slate-200/60 p-6">
        <p className="text-sm text-slate-500">{error || data?.message || 'No predictive data yet.'}</p>
      </section>
    );
  }

  const burn = data?.burn_rate ?? {};
  const runway = burn?.runway ?? null;
  const forecast = data?.cash_flow_forecast ?? {};
  const nextWeek = forecast?.next_week_sma ?? {};
  const monthProj = forecast?.monthly_projection ?? {};
  const scenario = data?.scenario_planning ?? {};
  const anomalies = data?.anomalies ?? {};
  const flagged = Array.isArray(anomalies?.flagged_transactions) ? anomalies.flagged_transactions : [];

  return (
    <div className="space-y-6">
      <section className="bg-white/85 backdrop-blur border border-white/70 rounded-3xl shadow-xl shadow-slate-200/60 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900">Predictive Analysis</h2>
          {loading ? <span className="text-xs uppercase tracking-[0.2em] text-slate-400">Updating…</span> : null}
          {burn?.period?.start && burn?.period?.end ? (
            <span className="text-xs uppercase tracking-[0.2em] text-slate-400">
              {burn.period.start} → {burn.period.end}
            </span>
          ) : null}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {showCoreCards && (
            <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Average Daily Burn</p>
              <p className="mt-2 text-lg font-semibold text-slate-900">{formatINR(toFiniteNumber(burn.average_daily_burn_rate))}</p>
              <p className="mt-1 text-[11px] text-slate-500">
                Total: {formatINR(toFiniteNumber(burn.total_spent))} · Days: {burn?.period?.days ?? 0}
              </p>
            </div>
          )}

          {showCoreCards && (
            <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Runway (Days)</p>
              <p className="mt-2 text-lg font-semibold text-slate-900">
                {runway?.runway_days === null || runway?.runway_days === undefined ? '—' : String(runway.runway_days)}
              </p>
              <div className="mt-3 flex items-center gap-3">
                <label className="text-[11px] text-slate-500">Balance</label>
                <input
                  value={draftCurrentBalance}
                  onChange={(e) => setDraftCurrentBalance(e.target.value)}
                  onBlur={commitParamsNow}
                  placeholder="e.g. 50000"
                  className="w-40 rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-slate-300"
                  inputMode="decimal"
                />
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Next 7 Days (SMA)</p>
            <p className="mt-2 text-lg font-semibold text-slate-900">{formatINR(toFiniteNumber(nextWeek.forecast_next_7_days_total))}</p>
            <p className="mt-1 text-[11px] text-slate-500">SMA/day: {formatINR(toFiniteNumber(nextWeek.sma_daily))}</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Month-End Projection</p>
            <p className="mt-2 text-lg font-semibold text-slate-900">{formatINR(toFiniteNumber(monthProj.predicted_month_total))}</p>
            <p className="mt-1 text-[11px] text-slate-500">
              MTD: {formatINR(toFiniteNumber(monthProj.month_to_date_spent))} · As of {monthProj.as_of}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
            <div className="flex items-center justify-between gap-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">What-If Reduction</p>
              <div className="flex items-center gap-2">
                <input
                  value={draftScenarioCategory}
                  onChange={(e) => setDraftScenarioCategory(e.target.value)}
                  onBlur={commitParamsNow}
                  className="w-32 rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-slate-300"
                  placeholder="Category"
                />
                <input
                  value={draftScenarioPercentage}
                  onChange={(e) => setDraftScenarioPercentage(e.target.value)}
                  onBlur={commitParamsNow}
                  className="w-20 rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-slate-300"
                  placeholder="20"
                  inputMode="numeric"
                />
              </div>
            </div>

            <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <p className="text-[11px] text-slate-500">Cut Amount</p>
                <p className="text-sm font-semibold text-emerald-700">{formatINR(toFiniteNumber(scenario.reduction_amount))}</p>
              </div>
              <div>
                <p className="text-[11px] text-slate-500">New Total</p>
                <p className="text-sm font-semibold text-slate-900">{formatINR(toFiniteNumber(scenario.new_total_spent))}</p>
              </div>
              <div>
                <p className="text-[11px] text-slate-500">6-Month Impact</p>
                <p className="text-sm font-semibold text-emerald-700">{formatINR(toFiniteNumber(scenario.six_month_savings_impact))}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-white/85 backdrop-blur border border-white/70 rounded-3xl shadow-xl shadow-slate-200/60 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-900">Mentor Alerts</h3>
          <span className="text-xs uppercase tracking-[0.2em] text-slate-400">Z-Score / &gt;10%</span>
        </div>

        {flagged.length ? (
          <div className="space-y-3">
            {flagged.slice(0, 8).map((tx, idx) => (
              <div
                key={`anomaly-${idx}-${String(tx.transaction_id ?? '')}-${String(tx.datetime ?? '')}-${String(tx.amount ?? '')}`}
                className="flex items-center justify-between gap-4"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 truncate">{tx.description || 'Unknown'}</p>
                  <p className="text-xs text-slate-500">
                    {tx.date || (tx.datetime ? String(tx.datetime).slice(0, 10) : '')}
                    {tx.category ? ` · ${tx.category}` : ''}
                    {Array.isArray(tx.reasons) && tx.reasons.length ? ` · ${tx.reasons.join(', ')}` : ''}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-rose-700">{formatINR(toFiniteNumber(tx.amount))}</p>
                  <ZScoreDistributionIcon zScore={tx.z_score} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500">No anomalies flagged yet.</p>
        )}
      </section>
    </div>
  );
}
