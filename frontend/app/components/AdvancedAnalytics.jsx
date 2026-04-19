'use client';

import { useEffect, useMemo, useState } from 'react';
import { formatINR } from '../../lib/formatters';
import { fetchSpendingPatterns } from '../../lib/api';
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  Sankey,
} from 'recharts';
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
  if (typeof value === 'string') {
    const cleaned = value.replace(/,/g, '').replace(/[^\d.-]/g, '');
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

function normalizeTransferBucket(label) {
  const raw = String(label ?? '').trim();
  if (!raw) return 'Savings';

  const low = raw.toLowerCase();
  if (low.includes('saving') || low.includes('deposit') || low.includes('sip') || low.includes('investment')) {
    return 'Savings';
  }
  if (low.includes('loan') || low.includes('emi')) return 'Debt';
  if (low.includes('rent') || low.includes('landlord')) return 'Housing';
  return raw.length > 22 ? `${raw.slice(0, 22)}...` : raw;
}

function buildTransferFlow(expenses) {
  const transferRows = (expenses ?? []).filter((tx) => {
    const category = String(tx?.category ?? '').toLowerCase();
    return category.includes('transfer');
  });

  if (!transferRows.length) return { status: 'empty' };

  const bucketTotals = {};
  let total = 0;
  for (const tx of transferRows) {
    const amount = toFiniteAmount(tx?.amount);
    total += amount;
    const label = normalizeTransferBucket(tx?.receiver ?? tx?.description ?? 'Savings');
    bucketTotals[label] = (bucketTotals[label] ?? 0) + amount;
  }

  const sorted = Object.entries(bucketTotals).sort((a, b) => b[1] - a[1]);
  const split = sorted.slice(0, 4).map(([label, amount]) => ({ label, amount }));
  const remainder = sorted.slice(4).reduce((sum, [, amount]) => sum + amount, 0);

  if (remainder > 0) {
    const savings = split.find((item) => item.label === 'Savings');
    if (savings) savings.amount += remainder;
    else split.push({ label: 'Savings', amount: remainder });
  }

  const nodes = [{ name: 'Transfers' }, ...split.map((item) => ({ name: item.label }))];
  const links = split.map((item, idx) => ({ source: 0, target: idx + 1, value: Number(item.amount.toFixed(2)) }));

  return {
    status: 'ok',
    total,
    split,
    data: { nodes, links },
  };
}

function computeMonthlyCalendar(expenses) {
  const parsed = (expenses ?? [])
    .map((tx) => ({ dt: parseTransactionDateTime(tx), amount: toFiniteAmount(tx?.amount) }))
    .filter((row) => row.dt);

  if (!parsed.length) return { status: 'empty' };

  const end = parsed.reduce((acc, row) => (row.dt > acc ? row.dt : acc), parsed[0].dt);
  const month = end.getMonth();
  const year = end.getFullYear();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const dailyTotals = Array.from({ length: 31 }, () => 0);

  for (const row of parsed) {
    if (row.dt.getMonth() === month && row.dt.getFullYear() === year) {
      const index = row.dt.getDate() - 1;
      if (index >= 0 && index < 31) dailyTotals[index] += row.amount;
    }
  }

  const maxDaily = Math.max(1, ...dailyTotals);
  const total = dailyTotals.slice(0, daysInMonth).reduce((sum, value) => sum + value, 0);
  const peakValue = Math.max(...dailyTotals.slice(0, daysInMonth));
  const peakDay = peakValue > 0 ? dailyTotals.findIndex((value) => value === peakValue) + 1 : null;

  return {
    status: 'ok',
    label: end.toLocaleString('en-IN', { month: 'long', year: 'numeric' }),
    daysInMonth,
    dailyTotals,
    maxDaily,
    total,
    peakDay,
    peakValue,
  };
}

function calendarCellStyle(value, maxDaily, isActiveDate) {
  if (!isActiveDate) return { backgroundColor: '#f8fafc', opacity: 0.45 };
  if (value <= 0) return { backgroundColor: '#e2e8f0' };
  const opacity = 0.22 + (0.74 * (value / maxDaily));
  return { backgroundColor: `rgba(15, 23, 42, ${opacity.toFixed(3)})` };
}

export default function AdvancedAnalytics({ expenses }) {
  const [spendingPatterns, setSpendingPatterns] = useState(null);
  const [spendingPatternsError, setSpendingPatternsError] = useState('');
  const [spendingPatternsLoading, setSpendingPatternsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      try {
        const token = localStorage.getItem('sb-token');
        if (!token) {
          if (!isMounted) return;
          setSpendingPatterns({
            weekend_vs_weekday: { weekend: 0, weekday: 0 },
            category_distribution: [],
            monthly_trend: [],
            has_data: false,
          });
          setSpendingPatternsLoading(false);
          return;
        }

        setSpendingPatternsLoading(true);
        setSpendingPatternsError('');
        const res = await fetchSpendingPatterns(token);
        if (!isMounted) return;
        setSpendingPatterns(res);
      } catch (err) {
        if (!isMounted) return;
        setSpendingPatternsError(err?.message || 'Failed to fetch spending patterns');
        setSpendingPatterns(null);
      } finally {
        if (isMounted) setSpendingPatternsLoading(false);
      }
    };

    load();
    return () => {
      isMounted = false;
    };
  }, []);

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

  const riskHeatmapData = useMemo(() => {
    const grouped = {};
    for (const tx of expenses ?? []) {
      const receiver = String(tx?.receiver ?? tx?.description ?? 'Unknown').trim() || 'Unknown';
      if (!grouped[receiver]) {
        grouped[receiver] = {
          receiver,
          category: String(tx?.category ?? 'Uncategorized').trim() || 'Uncategorized',
          count: 0,
          totalAmount: 0,
          confidenceSum: 0,
        };
      }
      const entry = grouped[receiver];
      entry.count += 1;
      entry.totalAmount += toFiniteAmount(tx?.amount);
      entry.confidenceSum += toFiniteAmount(tx?.ai_confidence ?? 0.5);
    }
    return Object.values(grouped)
      .map((row) => ({
        receiver: row.receiver,
        category: row.category,
        frequency: row.count,
        total_amount: row.totalAmount,
        ai_confidence: row.count > 0 ? row.confidenceSum / row.count : 0.5,
        z: Math.max(10, Math.min(400, (row.count * 20) + (row.totalAmount / 200))),
      }))
      .sort((a, b) => b.total_amount - a.total_amount)
      .slice(0, 40);
  }, [expenses]);

  const heatmapDomain = useMemo(() => {
    const maxX = Math.max(1, ...riskHeatmapData.map((d) => d.frequency));
    const maxY = Math.max(1, ...riskHeatmapData.map((d) => d.total_amount));
    return { maxX, maxY };
  }, [riskHeatmapData]);

  const anomalyLevel = (row) =>
    row.category?.toLowerCase() === 'uncategorized' || row.total_amount > 5000 ? 'High' : 'Low';

  const transferFlow = useMemo(() => buildTransferFlow(expenses ?? []), [expenses]);
  const monthlyCalendar = useMemo(() => computeMonthlyCalendar(expenses ?? []), [expenses]);
  const totalSpend = useMemo(
    () => (expenses ?? []).reduce((sum, tx) => sum + toFiniteAmount(tx?.amount), 0),
    [expenses]
  );
  const highRiskCount = useMemo(
    () => riskHeatmapData.filter((row) => anomalyLevel(row) === 'High').length,
    [riskHeatmapData]
  );

  const bubbleColor = (row) =>
    row.category?.toLowerCase() === 'uncategorized' || row.total_amount > 5000 ? '#ef4444' : '#22c55e';

  const renderTooltip = ({ active, payload }) => {
    if (!active || !payload || !payload.length) return null;
    const data = payload[0].payload;
    const level = anomalyLevel(data);
    return (
      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-lg text-sm text-slate-700">
        <p className="font-semibold text-slate-900">{data.receiver}</p>
        <p className="text-xs text-slate-500">Category: {data.category}</p>
        <p className="mt-2 text-xs text-slate-700">
          Mentor Insight: {data.receiver} is a Category {level} anomaly impacting your Health Score.
        </p>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-slate-100/80 p-5 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Quick Executive Brief</p>
            <h2 className="text-lg font-semibold text-[#0f172a]">Snapshot For Fast Decisions</h2>
          </div>
          <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600">
            {expenses?.length ?? 0} txns
          </span>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Total Spend</p>
            <p className="mt-1 text-base font-semibold text-[#0f172a]">{formatINR(totalSpend)}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Transfers</p>
            <p className="mt-1 text-base font-semibold text-[#0f172a]">
              {transferFlow.status === 'ok' ? formatINR(transferFlow.total) : '₹0.00'}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Mentor Alerts</p>
            <p className="mt-1 text-base font-semibold text-[#0f172a]">{highRiskCount}</p>
          </div>
        </div>
      </section>

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
            <h2 className="text-lg font-semibold text-slate-900">Risk Heatmap</h2>
            <span className="text-xs uppercase tracking-[0.2em] text-slate-400">Repeat Visits x Amount</span>
          </div>
          {riskHeatmapData.length ? (
            <div>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 8, right: 12, bottom: 8, left: 0 }}>
                    <CartesianGrid stroke="#e2e8f0" strokeDasharray="4 4" />
                    <XAxis
                      type="number"
                      dataKey="frequency"
                      name="Repeat Visits"
                      domain={[0, heatmapDomain.maxX + 1]}
                      tick={{ fontSize: 11 }}
                    />
                    <YAxis
                      type="number"
                      dataKey="total_amount"
                      name="Total Amount"
                      domain={[0, heatmapDomain.maxY * 1.1]}
                      tick={{ fontSize: 11 }}
                      tickFormatter={(value) => formatINR(value)}
                    />
                    <ZAxis type="number" dataKey="z" range={[10, 400]} />
                    <Tooltip content={renderTooltip} />
                    <Scatter data={riskHeatmapData}>
                      {riskHeatmapData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={bubbleColor(entry)} fillOpacity={0.75} />
                      ))}
                    </Scatter>
                  </ScatterChart>
                </ResponsiveContainer>
              </div>

              <div className="mt-5 rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
                <div className="mb-3 flex items-center justify-between gap-4">
                  <h3 className="text-sm font-semibold text-slate-900">Daily Spend Calendar</h3>
                  <span className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
                    {monthlyCalendar.status === 'ok' ? monthlyCalendar.label : 'This month'}
                  </span>
                </div>
                {monthlyCalendar.status !== 'ok' ? (
                  <p className="text-sm text-slate-500">No daily trend data yet.</p>
                ) : (
                  <div className="space-y-3">
                    <div className="grid grid-cols-7 gap-2">
                      {monthlyCalendar.dailyTotals.map((value, idx) => {
                        const day = idx + 1;
                        const isActiveDate = day <= monthlyCalendar.daysInMonth;
                        return (
                          <div
                            key={`calendar-day-${day}`}
                            title={
                              isActiveDate
                                ? `Day ${day}: ${formatINR(value)}`
                                : `Day ${day}: not in month`
                            }
                            style={calendarCellStyle(value, monthlyCalendar.maxDaily, isActiveDate)}
                            className="h-7 rounded-md border border-white/60 text-[10px] text-slate-700 flex items-center justify-center"
                          >
                            {day}
                          </div>
                        );
                      })}
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Total: {formatINR(monthlyCalendar.total)} | Peak day:{' '}
                      {monthlyCalendar.peakDay ? `${monthlyCalendar.peakDay} (${formatINR(monthlyCalendar.peakValue)})` : 'None'}
                    </p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-500">No anomaly signals yet.</p>
          )}
        </section>

        <section className="bg-white/85 backdrop-blur border border-white/70 rounded-3xl shadow-xl shadow-slate-200/60 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-900">Transfer Flow</h2>
            <span className="text-xs uppercase tracking-[0.2em] text-slate-400">Sankey View</span>
          </div>
          {transferFlow.status !== 'ok' ? (
            <p className="text-sm text-slate-500">No transfer data available yet.</p>
          ) : (
            <div className="space-y-4">
              <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Transfers Pool</p>
                <p className="mt-2 text-xl font-semibold text-slate-900">{formatINR(transferFlow.total)}</p>
                <p className="text-[11px] text-slate-500 mt-1">Movement split into known destinations and Savings.</p>
              </div>

              <div className="h-[450px]">
                <ResponsiveContainer width="100%" height="100%">
                  <Sankey
                    data={transferFlow.data}
                    nodePadding={30}
                    nodeWidth={14}
                    margin={{ top: 8, right: 8, bottom: 8, left: 8 }}
                    link={{ stroke: '#64748b' }}
                  >
                    <Tooltip
                      formatter={(value) => formatINR(value)}
                      contentStyle={{ borderRadius: '12px', borderColor: '#e2e8f0' }}
                    />
                  </Sankey>
                </ResponsiveContainer>
              </div>

              <div className="space-y-2">
                {transferFlow.split.map((item) => (
                  <div key={`flow-split-${item.label}`} className="flex items-center justify-between text-sm">
                    <span className="text-slate-600 truncate">{item.label}</span>
                    <span className="font-semibold text-slate-900">{formatINR(item.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>

      <PredictiveAnalytics showCoreCards={false} />
      <SpendingPatterns data={spendingPatterns} loading={spendingPatternsLoading} error={spendingPatternsError} />
    </div>
  );
}
