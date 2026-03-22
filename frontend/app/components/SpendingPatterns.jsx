'use client'

import { useEffect, useState } from 'react';
import { fetchSpendingPatterns } from '../../lib/api';

const formatCurrency = (value) => {
  const num = Number(value || 0);
  return `INR ${num.toFixed(2)}`;
};

export function SpendingPatterns() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const token = localStorage.getItem('sb-token');
      if (!token) return;
      setLoading(true);
      setError('');
      try {
        const res = await fetchSpendingPatterns(token);
        setData(res);
      } catch (err) {
        setError(err.message || 'Failed to load patterns');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) {
    return (
      <div className="bg-white/85 backdrop-blur border border-white/70 rounded-3xl shadow-xl shadow-slate-200/60 p-6">
        <p className="text-sm text-slate-500">Loading spending patterns...</p>
      </div>
    );
  }

  if (error || !data || data.status !== 'ok') {
    return (
      <div className="bg-white/85 backdrop-blur border border-white/70 rounded-3xl shadow-xl shadow-slate-200/60 p-6">
        <p className="text-sm text-slate-500">{error || data?.message || 'No pattern data yet.'}</p>
      </div>
    );
  }

  return (
    <section className="bg-white/85 backdrop-blur border border-white/70 rounded-3xl shadow-xl shadow-slate-200/60 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-slate-900">Spending Patterns</h2>
        <span className="text-xs uppercase tracking-[0.2em] text-slate-400">
          {data.period?.start} to {data.period?.end}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Avg Daily Spend</p>
          <p className="mt-2 text-xl font-semibold text-slate-900">{formatCurrency(data.avg_daily_spend)}</p>
          <p className="text-xs text-slate-500 mt-1">{data.period?.days} days</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Top Category</p>
          <p className="mt-2 text-base font-semibold text-slate-900">{data.top_category?.name || '—'}</p>
          <p className="text-xs text-slate-500 mt-1">
            {formatCurrency(data.top_category?.amount)} · {data.top_category?.percent || 0}%
          </p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Top Merchant</p>
          <p className="mt-2 text-base font-semibold text-slate-900">{data.top_merchant?.name || '—'}</p>
          <p className="text-xs text-slate-500 mt-1">{formatCurrency(data.top_merchant?.amount)}</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Busiest Day</p>
          <p className="mt-2 text-base font-semibold text-slate-900">{data.busiest_day?.day || '—'}</p>
          <p className="text-xs text-slate-500 mt-1">{formatCurrency(data.busiest_day?.amount)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Weekend vs Weekday</p>
          <div className="mt-3 flex items-center justify-between text-sm">
            <span className="text-slate-600">Weekend</span>
            <span className="font-semibold text-slate-900">{formatCurrency(data.weekend_total)}</span>
          </div>
          <div className="mt-2 flex items-center justify-between text-sm">
            <span className="text-slate-600">Weekday</span>
            <span className="font-semibold text-slate-900">{formatCurrency(data.weekday_total)}</span>
          </div>
          <p className="text-xs text-slate-500 mt-2">{data.weekend_share}% of spend happens on weekends.</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Month-over-Month</p>
          {data.month_over_month ? (
            <>
              <div className="mt-3 flex items-center justify-between text-sm">
                <span className="text-slate-600">Current</span>
                <span className="font-semibold text-slate-900">{formatCurrency(data.month_over_month.current)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between text-sm">
                <span className="text-slate-600">Previous</span>
                <span className="font-semibold text-slate-900">{formatCurrency(data.month_over_month.previous)}</span>
              </div>
              <p className="text-xs text-slate-500 mt-2">
                {data.month_over_month.percent}% change from last month.
              </p>
            </>
          ) : (
            <p className="text-sm text-slate-500 mt-2">Not enough data to calculate monthly change.</p>
          )}
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Recurring Merchants</p>
        {data.recurring_merchants && data.recurring_merchants.filter((m) => (m?.count ?? 0) >= 3).length > 0 ? (
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            {data.recurring_merchants
              .filter((m) => (m?.count ?? 0) >= 3)
              .map((m) => (
              <div key={m.name} className="flex items-center justify-between">
                <span className="text-slate-700">{m.name}</span>
                <span className="text-slate-900 font-semibold">{m.count} · {formatCurrency(m.total)}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500 mt-2">No recurring merchants detected yet.</p>
        )}
      </div>

      <div className="mt-4 rounded-2xl border border-slate-100 bg-white/70 p-4">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Budget Recommendations</p>
        {data.recommendations && data.recommendations.length > 0 ? (
          <div className="mt-3 space-y-3 text-sm">
            {data.recommendations.map((rec, idx) => (
              <div key={`${rec.title}-${idx}`} className="p-3 rounded-2xl border border-slate-100 bg-slate-50/70">
                <p className="font-semibold text-slate-900">{rec.title}</p>
                <p className="text-slate-600 mt-1">{rec.detail}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500 mt-2">No recommendations yet. Add more transactions or budget limits.</p>
        )}
      </div>
    </section>
  );
}
