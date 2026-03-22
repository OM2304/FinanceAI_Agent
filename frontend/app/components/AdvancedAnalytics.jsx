'use client';

import { useMemo } from 'react';
import { formatINR } from '../../lib/formatters';
import { SpendingPatterns } from './SpendingPatterns';
import { PredictiveAnalytics } from './PredictiveAnalytics';

function parseTransactionDateTime(tx) {
  const dateRaw = String(tx?.date ?? '').trim();
  const timeRaw = String(tx?.time ?? '').trim();

  if (!dateRaw) return null;

  let year;
  let month;
  let day;
  const parts = dateRaw.split('-').map((p) => p.trim());
  if (parts.length === 3) {
    // Supports YYYY-MM-DD and DD-MM-YYYY.
    if (parts[0].length === 4) {
      year = Number(parts[0]);
      month = Number(parts[1]);
      day = Number(parts[2]);
    } else if (parts[2].length === 4) {
      day = Number(parts[0]);
      month = Number(parts[1]);
      year = Number(parts[2]);
    }
  }

  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    const parsed = new Date(dateRaw);
    if (Number.isNaN(parsed.getTime())) return null;
    year = parsed.getFullYear();
    month = parsed.getMonth() + 1;
    day = parsed.getDate();
  }

  let hours = 0;
  let minutes = 0;
  if (timeRaw) {
    const timeParts = timeRaw.split(':').map((p) => p.trim());
    if (timeParts.length >= 2) {
      const h = Number(timeParts[0]);
      const m = Number(timeParts[1]);
      hours = Number.isFinite(h) ? h : 0;
      minutes = Number.isFinite(m) ? m : 0;
    }
  }

  const asDate = new Date(year, month - 1, day, hours, minutes, 0, 0);
  return Number.isNaN(asDate.getTime()) ? null : asDate;
}

function toFiniteAmount(value) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

function computeCategoryGrowth(expenses, periodDays = 30) {
  const parsed = expenses
    .map((tx) => ({ tx, dt: parseTransactionDateTime(tx) }))
    .filter((row) => row.dt);

  if (parsed.length < 2) {
    return { status: 'empty' };
  }

  const end = parsed.reduce((acc, row) => (row.dt > acc ? row.dt : acc), parsed[0].dt);
  const currentStart = new Date(end);
  currentStart.setDate(currentStart.getDate() - (periodDays - 1));
  currentStart.setHours(0, 0, 0, 0);

  const prevEnd = new Date(currentStart);
  prevEnd.setMilliseconds(prevEnd.getMilliseconds() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevStart.getDate() - (periodDays - 1));
  prevStart.setHours(0, 0, 0, 0);

  const currentTotals = {};
  const previousTotals = {};

  for (const { tx, dt } of parsed) {
    const category = String(tx?.category ?? 'Uncategorized').trim() || 'Uncategorized';
    const amount = toFiniteAmount(tx?.amount);
    if (dt >= currentStart && dt <= end) {
      currentTotals[category] = (currentTotals[category] ?? 0) + amount;
    } else if (dt >= prevStart && dt <= prevEnd) {
      previousTotals[category] = (previousTotals[category] ?? 0) + amount;
    }
  }

  const categories = new Set([...Object.keys(currentTotals), ...Object.keys(previousTotals)]);
  const deltas = [...categories].map((category) => {
    const current = currentTotals[category] ?? 0;
    const previous = previousTotals[category] ?? 0;
    return { category, current, previous, diff: current - previous };
  });

  deltas.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  const biggestIncrease = deltas.filter((d) => d.diff > 0).sort((a, b) => b.diff - a.diff)[0] ?? null;
  const biggestDecrease = deltas.filter((d) => d.diff < 0).sort((a, b) => a.diff - b.diff)[0] ?? null;

  return {
    status: 'ok',
    period: {
      currentStart: currentStart.toISOString().slice(0, 10),
      currentEnd: end.toISOString().slice(0, 10),
      previousStart: prevStart.toISOString().slice(0, 10),
      previousEnd: prevEnd.toISOString().slice(0, 10),
    },
    biggestIncrease,
    biggestDecrease,
  };
}

export default function AdvancedAnalytics({ expenses, totalAmount }) {
  const receiverTotals = useMemo(() => {
    const totals = {};
    for (const tx of expenses ?? []) {
      const receiver = String(tx?.receiver ?? tx?.description ?? 'Unknown').trim() || 'Unknown';
      totals[receiver] = (totals[receiver] ?? 0) + toFiniteAmount(tx?.amount);
    }
    return Object.entries(totals)
      .map(([receiver, amount]) => ({ receiver, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);
  }, [expenses]);

  const anomalies = useMemo(() => {
    const total = toFiniteAmount(totalAmount);
    if (total <= 0) return [];
    return (expenses ?? [])
      .filter((tx) => toFiniteAmount(tx?.amount) > total * 0.1)
      .slice()
      .sort((a, b) => toFiniteAmount(b?.amount) - toFiniteAmount(a?.amount));
  }, [expenses, totalAmount]);

  const categoryGrowth = useMemo(() => computeCategoryGrowth(expenses ?? [], 30), [expenses]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="bg-white/85 backdrop-blur border border-white/70 rounded-3xl shadow-xl shadow-slate-200/60 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-900">Merchant Concentration</h2>
            <span className="text-xs uppercase tracking-[0.2em] text-slate-400">Top 5</span>
          </div>
          {receiverTotals.length ? (
            <div className="space-y-3">
              {receiverTotals.map((row) => (
                <div key={row.receiver} className="flex items-center justify-between gap-4">
                  <span className="text-sm text-slate-700 truncate">{row.receiver}</span>
                  <span className="text-sm font-semibold text-slate-900">{formatINR(row.amount)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">Not enough data yet.</p>
          )}
        </section>

        <section className="bg-white/85 backdrop-blur border border-white/70 rounded-3xl shadow-xl shadow-slate-200/60 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-900">Anomaly List</h2>
            <span className="text-xs uppercase tracking-[0.2em] text-slate-400">&gt; 10%</span>
          </div>
          {anomalies.length ? (
            <div className="space-y-3">
              {anomalies.slice(0, 8).map((tx) => (
                <div key={tx.id ?? `${tx.date}-${tx.time}-${tx.receiver}-${tx.amount}`} className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">{tx.receiver}</p>
                    <p className="text-xs text-slate-500">
                      {tx.date} {tx.time ? `· ${tx.time}` : ''} {tx.category ? `· ${tx.category}` : ''}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-rose-700">{formatINR(tx.amount)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">No large transactions detected.</p>
          )}
        </section>

        <section className="bg-white/85 backdrop-blur border border-white/70 rounded-3xl shadow-xl shadow-slate-200/60 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-900">Category Growth</h2>
            <span className="text-xs uppercase tracking-[0.2em] text-slate-400">30D vs Prev</span>
          </div>
          {categoryGrowth.status !== 'ok' ? (
            <p className="text-sm text-slate-500">Not enough data to compare periods.</p>
          ) : (
            <div className="space-y-4">
              <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Biggest Increase</p>
                {categoryGrowth.biggestIncrease ? (
                  <div className="mt-2 flex items-center justify-between gap-4">
                    <span className="text-sm font-semibold text-slate-900 truncate">{categoryGrowth.biggestIncrease.category}</span>
                    <span className="text-sm font-semibold text-emerald-700">
                      +{formatINR(categoryGrowth.biggestIncrease.diff)}
                    </span>
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-slate-500">No increases detected.</p>
                )}
              </div>
              <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Biggest Decrease</p>
                {categoryGrowth.biggestDecrease ? (
                  <div className="mt-2 flex items-center justify-between gap-4">
                    <span className="text-sm font-semibold text-slate-900 truncate">{categoryGrowth.biggestDecrease.category}</span>
                    <span className="text-sm font-semibold text-rose-700">
                      {formatINR(categoryGrowth.biggestDecrease.diff)}
                    </span>
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-slate-500">No decreases detected.</p>
                )}
              </div>
              <p className="text-[11px] text-slate-500">
                Current: {categoryGrowth.period.currentStart} → {categoryGrowth.period.currentEnd} · Previous: {categoryGrowth.period.previousStart} → {categoryGrowth.period.previousEnd}
              </p>
            </div>
          )}
        </section>
      </div>

      <PredictiveAnalytics />
      <SpendingPatterns />
    </div>
  );
}
