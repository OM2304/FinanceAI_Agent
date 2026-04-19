'use client'

import { UploadComponent } from './components/UploadComponent';
import { DeleteButton } from './components/DeleteButton';
import { MentorChat } from './components/MentorChat';
import { BackendCharts } from './components/BackendCharts';
import { BudgetPanel } from './components/BudgetPanel';
import { GuruLibrary } from './components/GuruLibrary';
import { SplitwisePanel } from './components/SplitwisePanel';
import WealthPanel from './components/WealthPanel';
import TaxAdvisor from './components/TaxAdvisor';
import { TransactionConfirmationModal } from './components/TransactionConfirmationModal';
import { confirmTransaction, fetchExpenses, fetchPredictiveInsights } from '../lib/api';
import { formatINR } from '../lib/formatters';
import { useEffect, useMemo, useState, useCallback, lazy, Suspense } from 'react';
import { PieChart, Pie, Cell } from 'recharts';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { createClient } from '../lib/supabase/client';

const ExportDropdown = dynamic(() => import('./components/ExportDropdown'), { ssr: false });
const AdvancedAnalytics = lazy(() => import('./components/AdvancedAnalytics'));

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

export default function Home() {
  const [expenses, setExpenses] = useState([]);
  const [backendConnected, setBackendConnected] = useState(true);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [theme, setTheme] = useState('light');
  const router = useRouter();
  const [financialStats, setFinancialStats] = useState(null);
  const [predictive, setPredictive] = useState(null);
  const [currentBalance, setCurrentBalance] = useState('0');
  const [guruId, setGuruId] = useState('ramit');

  const [toolsOpen, setToolsOpen] = useState(false);
  const [resourcesOpen, setResourcesOpen] = useState(false);

  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [confirmationData, setConfirmationData] = useState(null);
  const [confirmationSaving, setConfirmationSaving] = useState(false);
  const [confirmationError, setConfirmationError] = useState('');
  const [confirmationNonce, setConfirmationNonce] = useState(0);

  const loadStats = useCallback(async () => {
    try {
      const token = localStorage.getItem('sb-token');
      if (!token) return;

      const res = await fetch('http://localhost:8000/user/financial-stats', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) throw new Error('Unauthorized');
      if (!res.ok) throw new Error('Failed to fetch financial stats');
      const data = await res.json();
      setFinancialStats(data);
    } catch (err) {
      console.error('Failed to fetch financial stats', err);
    }
  }, []);

  const loadPredictive = useCallback(async () => {
    try {
      const token = localStorage.getItem('sb-token');
      if (!token) return;

      const data = await fetchPredictiveInsights(token);
      setPredictive(data);
    } catch (err) {
      console.error('Failed to fetch predictive insights', err);
    }
  }, []);

  const loadExpenses = useCallback(async () => {
    try {
      const token = localStorage.getItem('sb-token');
      if (!token) {
        return;
      }

      const data = await fetchExpenses(token);
      setExpenses(data);
      setBackendConnected(true);
    } catch (error) {
      console.error('Failed to fetch expenses:', error);
      if (error.message === 'Unauthorized') {
        localStorage.removeItem('sb-token');
        router.push('/login');
        return;
      }
      setBackendConnected(false);
    } finally {
      setLoading(false);
    }
  }, [router]);

  const refreshAll = useCallback(async () => {
    await Promise.all([loadExpenses(), loadStats(), loadPredictive()]);
  }, [loadExpenses, loadPredictive, loadStats]);

  useEffect(() => {
    const token = localStorage.getItem('sb-token');
    if (!token) {
      router.push('/login');
      return;
    }

    loadExpenses();
  }, [router, loadExpenses]);

  useEffect(() => {
    const token = localStorage.getItem('sb-token');
    if (!token) return;

    loadStats();
    loadPredictive();
  }, [router, loadPredictive, loadStats]);

  useEffect(() => {
    const stored = localStorage.getItem('theme');
    const initial = stored || 'light';
    setTheme(initial);
    document.documentElement.setAttribute('data-theme', initial);
  }, []);

  useEffect(() => {
    try {
      const storedGuru = localStorage.getItem('mentor_chat_guru_id');
      if (storedGuru) setGuruId(String(storedGuru).trim().toLowerCase());
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('mentor_chat_guru_id', guruId);
    } catch {
      // ignore
    }
  }, [guruId]);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('theme', next);
    document.documentElement.setAttribute('data-theme', next);
  };

  const openConfirmation = useCallback((extractedData) => {
    setConfirmationData(extractedData);
    setConfirmationError('');
    setConfirmationOpen(true);
    setConfirmationNonce((n) => n + 1);
  }, []);

  const discardConfirmation = useCallback(() => {
    setConfirmationOpen(false);
    setConfirmationData(null);
    setConfirmationError('');
  }, []);

  const confirmFromModal = useCallback(
    async (confirmedData) => {
      try {
        setConfirmationSaving(true);
        setConfirmationError('');

        const supabase = createClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) {
          setConfirmationError('Your session has expired. Please log in again.');
          return;
        }

        const dataToSave = { ...(confirmedData || {}) };
        delete dataToSave.confidence;
        await confirmTransaction(dataToSave, session.access_token);

        discardConfirmation();
        await loadExpenses();
        router.refresh();
      } catch (error) {
        console.error('Error saving transaction:', error);
        setConfirmationError(error?.message || 'Failed to save transaction. Please try again.');
      } finally {
        setConfirmationSaving(false);
      }
    },
    [discardConfirmation, loadExpenses, router]
  );

  const sortedExpenses = useMemo(() => {
    return (expenses ?? [])
      .slice()
      .sort((a, b) => {
        const aDt = parseTransactionDateTime(a);
        const bDt = parseTransactionDateTime(b);
        const aTs = aDt ? aDt.getTime() : 0;
        const bTs = bDt ? bDt.getTime() : 0;
        return bTs - aTs;
      });
  }, [expenses]);

  const { totalAmount, malformedExpenseCount } = useMemo(() => {
    let total = 0;
    let malformed = 0;
    for (const item of expenses ?? []) {
      const raw = item?.amount;
      const num = Number(raw);
      if (!Number.isFinite(num)) {
        malformed += 1;
        continue;
      }
      total += num;
    }
    return { totalAmount: total, malformedExpenseCount: malformed };
  }, [expenses]);

  useEffect(() => {
    if ((expenses?.length ?? 0) > 0 && totalAmount === 0 && malformedExpenseCount > 0) {
      console.warn('Total spending is 0 due to malformed expense amounts.', {
        malformedExpenseCount,
        sample: expenses?.slice?.(0, 3),
      });
    }
  }, [expenses, malformedExpenseCount, totalAmount]);
  const totalCategories = useMemo(
    () => [...new Set(expenses.map((e) => e.category))].length,
    [expenses]
  );
  const healthScore = Number(financialStats?.health_score ?? 0);
  const burnRate = Number(predictive?.burn_rate?.average_daily_burn_rate ?? financialStats?.daily_burn ?? 0);

  const topCategories = useMemo(() => {
    const totals = {};
    for (const tx of expenses ?? []) {
      const category = String(tx?.category ?? 'Uncategorized').trim() || 'Uncategorized';
      totals[category] = (totals[category] ?? 0) + Number(tx?.amount ?? 0);
    }
    return Object.entries(totals)
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 3);
  }, [expenses]);

  const topCategoryMax = Math.max(1, ...(topCategories.map((c) => c.amount) || [1]));
  const largestCategory = topCategories[0]?.category || 'spending';

  const gaugeColor = healthScore < 40 ? '#ef4444' : healthScore <= 70 ? '#f59e0b' : '#22c55e';
  const gaugeData = [
    { name: 'score', value: healthScore },
    { name: 'rest', value: Math.max(0, 100 - healthScore) },
  ];

  const numericBalance = Number(currentBalance ?? 0);
  const safeBalance = Number.isFinite(numericBalance) ? numericBalance : 0;
  const runwayDays = burnRate > 0 && safeBalance > 0 ? Math.floor(safeBalance / burnRate) : null;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center app-bg">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-900 mx-auto"></div>
          <p className="mt-4 text-slate-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen app-bg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <header className="mb-10">
          <div className="flex flex-col gap-6">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
                <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-2xl bg-linear-to-br from-slate-900 via-slate-800 to-slate-700 shadow-lg shadow-slate-300/40 flex items-center justify-center text-white font-bold">
                  FM
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">FinSight Console</p>
                  <h1 className="text-3xl sm:text-4xl font-semibold text-slate-900">Finance Manager</h1>
                  <p className="text-slate-600 mt-1">Clarity-first tracking with AI guidance for modern founders.</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={toggleTheme}
                  className="px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white/80 text-slate-700 hover:bg-slate-100"
                >
                  {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
                </button>
                <div className="bg-white/80 backdrop-blur border border-white/60 shadow-lg shadow-slate-200/60 rounded-2xl px-5 py-3">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Total Spending</p>
                  <p className="text-2xl font-semibold text-slate-900">{formatINR(totalAmount)}</p>
                </div>
                <button
                  onClick={() => {
                    localStorage.removeItem('sb-token');
                    router.push('/login');
                  }}
                  className="px-4 py-2 text-sm font-semibold text-rose-600 hover:text-rose-700 border border-rose-200 rounded-xl hover:bg-rose-50 transition-colors"
                >
                  Logout
                </button>
              </div>
            </div>

            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div className="bg-white/70 backdrop-blur border border-white/60 shadow-md shadow-slate-200/50 rounded-2xl px-4 py-3 flex items-center gap-2 relative z-10">
                <button
                  type="button"
                  onClick={() => setActiveTab('overview')}
                  className={`px-4 py-2 text-sm font-semibold rounded-xl transition-all ${
                    activeTab === 'overview'
                      ? 'bg-slate-900 text-white shadow-md'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white'
                  }`}
                >
                  Overview
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('advanced')}
                  className={`px-4 py-2 text-sm font-semibold rounded-xl transition-all ${
                    activeTab === 'advanced'
                      ? 'bg-slate-900 text-white shadow-md'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white'
                  }`}
                >
                  Advanced Analytics
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('charts')}
                  className={`px-4 py-2 text-sm font-semibold rounded-xl transition-all ${
                    activeTab === 'charts'
                      ? 'bg-slate-900 text-white shadow-md'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white'
                  }`}
                >
                  Charts
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('assistant')}
                  className={`px-4 py-2 text-sm font-semibold rounded-xl transition-all ${
                    activeTab === 'assistant'
                      ? 'bg-slate-900 text-white shadow-md'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white'
                  }`}
                >
                  Assistant
                </button>
                <div
                  className="relative"
                  onMouseEnter={() => { setToolsOpen(true); setResourcesOpen(false); }}
                  onMouseLeave={() => setToolsOpen(false)}
                >
                  <button
                    type="button"
                    className={`px-4 py-2 text-sm font-semibold rounded-xl transition-all ${
                      ['budget', 'splitwise', 'wealth'].includes(activeTab)
                        ? 'bg-slate-900 text-white shadow-md'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-white'
                    }`}
                  >
                    Tools ▼
                  </button>
                  {toolsOpen && (
                    <div className="absolute left-0 top-full z-[9999] pt-2">
                      <div className="bg-white border border-slate-200 rounded-xl shadow-lg p-2 flex flex-col gap-1">
                        <button
                          type="button"
                          onClick={() => { setActiveTab('budget'); setToolsOpen(false); }}
                          className="px-3 py-1 text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded"
                        >
                          Budget
                        </button>
                        <button
                          type="button"
                          onClick={() => { setActiveTab('splitwise'); setToolsOpen(false); }}
                          className="px-3 py-1 text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded"
                        >
                          Splitwise
                        </button>
                        <button
                          type="button"
                          onClick={() => { setActiveTab('wealth'); setToolsOpen(false); }}
                          className="px-3 py-1 text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded"
                        >
                          Wealth
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                <div
                  className="relative"
                  onMouseEnter={() => { setResourcesOpen(true); setToolsOpen(false); }}
                  onMouseLeave={() => setResourcesOpen(false)}
                >
                  <button
                    type="button"
                    className={`px-4 py-2 text-sm font-semibold rounded-xl transition-all ${
                      ['library', 'tax'].includes(activeTab)
                        ? 'bg-slate-900 text-white shadow-md'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-white'
                    }`}
                  >
                    Resources ▼
                  </button>
                  {resourcesOpen && (
                    <div className="absolute left-0 top-full z-[9999] pt-2">
                      <div className="bg-white border border-slate-200 rounded-xl shadow-lg p-2 flex flex-col gap-1">
                        <button
                          type="button"
                          onClick={() => { setActiveTab('library'); setResourcesOpen(false); }}
                          className="px-3 py-1 text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded"
                        >
                          Library
                        </button>
                        <button
                          type="button"
                          onClick={() => { setActiveTab('tax'); setResourcesOpen(false); }}
                          className="px-3 py-1 text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded"
                        >
                          Tax
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('upload')}
                  className={`px-4 py-2 text-sm font-semibold rounded-xl transition-all ml-auto ${
                    activeTab === 'upload'
                      ? 'bg-slate-900 text-white shadow-md'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white'
                  }`}
                >
                  <span className="text-lg mr-1">+</span> Upload
                </button>
              </div>

              <div className="flex flex-wrap gap-3">
                <div className="bg-white/70 backdrop-blur border border-white/60 rounded-2xl px-4 py-3 text-sm text-slate-600">
                  <span className="font-semibold text-slate-900">{expenses.length}</span> transactions synced
                </div>
                <div className="bg-white/70 backdrop-blur border border-white/60 rounded-2xl px-4 py-3 text-sm text-slate-600">
                  <span className="font-semibold text-slate-900">{totalCategories}</span> active categories
                </div>
              </div>
            </div>
          </div>
        </header>

        {!backendConnected && (
          <section className="mb-8 bg-slate-50/90 border border-slate-200 p-4 rounded-2xl shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-slate-100 rounded-full flex items-center justify-center text-slate-700 font-semibold">
                !
              </div>
              <div>
                <p className="font-semibold text-[#0f172a]">Backend server is not running</p>
                <p className="text-sm text-slate-700 mt-1">
                  Start it with: <code className="bg-slate-100 px-2 py-1 rounded text-xs">cd backend && uvicorn main:app --reload</code>
                </p>
              </div>
            </div>
          </section>
        )}

        {activeTab === 'upload' && (
          <section className="mb-8 bg-white/85 backdrop-blur border border-white/70 rounded-3xl shadow-xl shadow-slate-200/60 p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">Document Intake</h2>
                <p className="text-sm text-slate-600">Upload receipts or bank statements. We will extract and categorize instantly.</p>
              </div>
              <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Secure OCR</div>
            </div>
            <UploadComponent onUploadSuccess={loadExpenses} onRequestConfirmation={openConfirmation} />
          </section>
        )}

        {activeTab === 'overview' && (
          <>
            <div className="flex justify-end mb-4">
              {/* Export button top right */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={refreshAll}
                  className="px-4 py-2 text-sm font-semibold rounded-xl border border-slate-200 bg-white/90 text-slate-700 hover:bg-slate-100"
                >
                  Refresh Data
                </button>
                <ExportDropdown transactions={sortedExpenses} totalAmount={totalAmount} />
              </div>
            </div>
            <section className="mb-6 bg-white/90 backdrop-blur border border-white/70 rounded-3xl shadow-xl shadow-slate-200/60 p-6">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold text-slate-900">Mentor&apos;s Brief</h2>
                <span className="text-xs uppercase tracking-[0.2em] text-slate-400">Intelligence</span>
              </div>
              {safeBalance <= 0 ? (
                <p className="text-sm text-slate-800">
                  I can&apos;t tell you how long you&apos;ll last without knowing your balance. Enter your cash on hand below.
                </p>
              ) : (
                <p className="text-sm text-slate-800">
                  At your current burn of <span className="font-semibold text-slate-900">₹{burnRate.toFixed(2)}</span>, your{' '}
                  <span className="font-semibold text-slate-900">₹{safeBalance.toFixed(2)}</span> will vanish in{' '}
                  <span className="font-semibold text-slate-900">{runwayDays ?? '—'}</span> days. This is a red alert.
                </p>
              )}
            </section>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
              <section className="bg-white/85 backdrop-blur border border-white/70 rounded-3xl shadow-lg shadow-slate-200/60 p-6 flex flex-col items-center justify-center">
                <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Financial Health</p>
                <div className="relative mt-4">
                  <PieChart width={220} height={220}>
                    <Pie
                      data={gaugeData}
                      dataKey="value"
                      cx="50%"
                      cy="50%"
                      innerRadius={70}
                      outerRadius={90}
                      startAngle={90}
                      endAngle={-270}
                      stroke="none"
                    >
                      <Cell fill={gaugeColor} />
                      <Cell fill="#e5e7eb" />
                    </Pie>
                  </PieChart>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <p className="text-3xl font-semibold text-slate-900">{healthScore}</p>
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Score</p>
                  </div>
                </div>
              </section>

              <section className="bg-white/85 backdrop-blur border border-white/70 rounded-3xl shadow-lg shadow-slate-200/60 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-slate-900">Top Categories</h2>
                  <span className="text-xs uppercase tracking-[0.2em] text-slate-400">Focus</span>
                </div>
                <div className="space-y-4">
                  {topCategories.length > 0 ? (
                    topCategories.map((row) => {
                      const pct = Math.min(100, (row.amount / topCategoryMax) * 100);
                      return (
                        <div key={row.category}>
                          <div className="flex items-center justify-between text-sm text-slate-700">
                            <span className="font-semibold text-slate-900">{row.category}</span>
                            <span>{formatINR(row.amount)}</span>
                          </div>
                          <div className="mt-2 h-2 rounded-full bg-slate-100">
                            <div
                              className="h-2 rounded-full bg-slate-900"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-sm text-slate-500">No categories yet.</p>
                  )}
                </div>
              </section>

              <section className="bg-white/85 backdrop-blur border border-white/70 rounded-3xl shadow-lg shadow-slate-200/60 p-6 space-y-4">
                <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Daily Burn</p>
                  <p className="mt-2 text-lg font-semibold text-slate-900">{formatINR(burnRate)}</p>
                </div>
                <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Runway (Days)</p>
                  <p className="mt-2 text-lg font-semibold text-slate-900">
                    {runwayDays === null || runwayDays === undefined ? '—' : String(runwayDays)}
                  </p>
                  <label className="mt-3 block text-[11px] text-slate-500">Total Cash on Hand</label>
                  <input
                    value={currentBalance}
                    onChange={(e) => setCurrentBalance(e.target.value)}
                    placeholder="e.g. 50000"
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-slate-300"
                    inputMode="decimal"
                  />
                </div>
              </section>
            </div>

            <section className="bg-white/90 backdrop-blur border border-white/70 rounded-3xl shadow-xl shadow-slate-200/60 overflow-hidden">
              <div className="p-6 border-b border-slate-200/70">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">Recent Transactions</h2>
                    <p className="text-sm text-slate-500">Last 5 entries (fast view)</p>
                  </div>
                  <span className="text-xs uppercase tracking-[0.2em] text-slate-400">Updated</span>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-6 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Date</th>
                      <th className="px-6 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Time</th>
                      <th className="px-6 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Sender</th>
                      <th className="px-6 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Receiver</th>
                      <th className="px-6 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Category</th>
                      <th className="px-6 py-3 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Amount</th>
                      <th className="px-6 py-3 text-center text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Action</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-100">
                    {sortedExpenses.slice(0, 5).map((tx) => (
                      <tr key={tx.id} className="hover:bg-slate-50/60">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">{tx.date}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{tx.time}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">{tx.sender}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-slate-900">{tx.receiver}</td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-slate-900 text-white">
                            {tx.category}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-semibold text-slate-900">INR {tx.amount}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium">
                          <DeleteButton id={tx.id} onDeleted={loadExpenses} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {expenses.length === 0 && (
                  <div className="text-center py-12">
                    <div className="text-slate-400 text-5xl mb-4">
                      <svg viewBox="0 0 24 24" className="h-12 w-12 mx-auto" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M4 19V5M10 19V9M16 19V13M22 19V7" strokeLinecap="round" />
                      </svg>
                    </div>
                    <p className="text-slate-500">No transactions found</p>
                    <p className="text-sm text-slate-400 mt-1">Upload a receipt to get started</p>
                  </div>
                )}
              </div>
            </section>
          </>
        )}

        {activeTab === 'advanced' && (
          <section className="bg-white/40 backdrop-blur border border-white/70 rounded-3xl shadow-xl shadow-slate-200/60 p-6">
            <Suspense fallback={<div className="text-sm text-slate-600">Loading analytics...</div>}>
              <AdvancedAnalytics expenses={sortedExpenses} />
            </Suspense>
          </section>
        )}

        {activeTab === 'charts' && (
          <section className="bg-white/85 backdrop-blur border border-white/70 rounded-3xl shadow-xl shadow-slate-200/60 p-6">
            <BackendCharts />
          </section>
        )}

        {activeTab === 'assistant' && (
          <section className="bg-white/85 backdrop-blur border border-white/70 rounded-3xl shadow-xl shadow-slate-200/60 p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Guru Persona</div>
              <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/90 p-2">
                {['ramit', 'kiyosaki', 'buffett'].map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setGuruId(id)}
                    className={`px-3 py-2 text-xs font-semibold rounded-xl transition-colors ${
                      guruId === id
                        ? 'bg-[#0f172a] text-white'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                    }`}
                  >
                    {id === 'ramit' ? 'Ramit' : id === 'kiyosaki' ? 'Kiyosaki' : 'Buffett'}
                  </button>
                ))}
              </div>
            </div>
            <MentorChat guruId={guruId} onGuruChange={setGuruId} />
          </section>
        )}

        {activeTab === 'budget' && (
          <section className="bg-white/40 backdrop-blur border border-white/70 rounded-3xl shadow-xl shadow-slate-200/60 p-6">
            <BudgetPanel categories={[...new Set(expenses.map((e) => e.category))]} />
          </section>
        )}

        {activeTab === 'library' && (
          <section className="bg-white/40 backdrop-blur border border-white/70 rounded-3xl shadow-xl shadow-slate-200/60 p-6">
            <GuruLibrary />
          </section>
        )}

        {activeTab === 'splitwise' && (
          <section className="bg-white/40 backdrop-blur border border-white/70 rounded-3xl shadow-xl shadow-slate-200/60 p-6">
            <SplitwisePanel />
          </section>
        )}

        {activeTab === 'wealth' && <WealthPanel />}

        {activeTab === 'tax' && <TaxAdvisor />}
      </div>

      {confirmationOpen && confirmationData && (
        <TransactionConfirmationModal
          key={confirmationNonce}
          isOpen={confirmationOpen}
          extractedData={confirmationData}
          onConfirm={confirmFromModal}
          onDiscard={discardConfirmation}
          isSaving={confirmationSaving}
          errorMessage={confirmationError}
        />
      )}
    </main>
  );
}
