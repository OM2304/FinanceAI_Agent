'use client'

import { UploadComponent } from './components/UploadComponent';
import { ExpenseChart } from './components/ExpenseChart';
import { DeleteButton } from './components/DeleteButton';
import { AiAssistant } from './components/AiAssistant';
import { BackendCharts } from './components/BackendCharts';
import { BudgetPanel } from './components/BudgetPanel';
import { GuruLibrary } from './components/GuruLibrary';
import { SplitwisePanel } from './components/SplitwisePanel';
import { SpendingPatterns } from './components/SpendingPatterns';
import { fetchExpenses } from '../lib/api';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const [expenses, setExpenses] = useState([]);
  const [backendConnected, setBackendConnected] = useState(true);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [theme, setTheme] = useState('light');
  const router = useRouter();

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

  useEffect(() => {
    const token = localStorage.getItem('sb-token');
    if (!token) {
      router.push('/login');
      return;
    }

    loadExpenses();
  }, [router, loadExpenses]);

  useEffect(() => {
    const stored = localStorage.getItem('theme');
    const initial = stored || 'light';
    setTheme(initial);
    document.documentElement.setAttribute('data-theme', initial);
  }, []);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('theme', next);
    document.documentElement.setAttribute('data-theme', next);
  };

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

  const totalAmount = expenses.reduce((sum, item) => sum + item.amount, 0);
  const totalCategories = [...new Set(expenses.map((e) => e.category))].length;
  const avgAmount = expenses.length > 0 ? (totalAmount / expenses.length).toFixed(2) : '0';

  return (
    <main className="min-h-screen app-bg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <header className="mb-10">
          <div className="flex flex-col gap-6">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-amber-400 via-rose-400 to-orange-500 shadow-lg shadow-orange-200/60 flex items-center justify-center text-white font-bold">
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
                  <p className="text-2xl font-semibold text-slate-900">INR {totalAmount.toFixed(2)}</p>
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
              <div className="bg-white/70 backdrop-blur border border-white/60 shadow-md shadow-slate-200/50 rounded-2xl px-4 py-3 flex flex-wrap gap-2">
                {[
                  { key: 'overview', label: 'Overview' },
                  { key: 'upload', label: 'Upload' },
                  { key: 'charts', label: 'Charts' },
                  { key: 'assistant', label: 'Assistant' },
                  { key: 'budget', label: 'Budget' },
                  { key: 'library', label: 'Library' },
                  { key: 'splitwise', label: 'Splitwise' },
                ].map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key)}
                    className={`px-4 py-2 text-sm font-semibold rounded-xl transition-all ${
                      activeTab === tab.key
                        ? 'bg-slate-900 text-white shadow-md'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-white'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
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
          <section className="mb-8 bg-amber-50/80 border border-amber-200 p-4 rounded-2xl shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-amber-100 rounded-full flex items-center justify-center text-amber-700 font-semibold">
                !
              </div>
              <div>
                <p className="font-semibold text-amber-900">Backend server is not running</p>
                <p className="text-sm text-amber-700 mt-1">
                  Start it with: <code className="bg-amber-100 px-2 py-1 rounded text-xs">cd backend && uvicorn main:app --reload</code>
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
            <UploadComponent onUploadSuccess={loadExpenses} />
          </section>
        )}

        {activeTab === 'overview' && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="bg-white/85 backdrop-blur border border-white/70 rounded-3xl shadow-lg shadow-slate-200/60 p-6">
                <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Transactions</p>
                <div className="mt-4 flex items-end justify-between">
                  <div>
                    <p className="text-3xl font-semibold text-slate-900">{expenses.length}</p>
                    <p className="text-sm text-slate-500">Synced entries</p>
                  </div>
                  <div className="h-10 w-10 rounded-2xl bg-slate-900 text-white flex items-center justify-center">
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M4 19V5M10 19V9M16 19V13M22 19V7" strokeLinecap="round" />
                    </svg>
                  </div>
                </div>
              </div>

              <div className="bg-white/85 backdrop-blur border border-white/70 rounded-3xl shadow-lg shadow-slate-200/60 p-6">
                <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Categories</p>
                <div className="mt-4 flex items-end justify-between">
                  <div>
                    <p className="text-3xl font-semibold text-slate-900">{totalCategories}</p>
                    <p className="text-sm text-slate-500">Active buckets</p>
                  </div>
                  <div className="h-10 w-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center">
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M5 12l7-7 7 7-7 7-7-7z" strokeLinecap="round" strokeLinejoin="round" />
                      <circle cx="12" cy="12" r="2.5" strokeLinecap="round" />
                    </svg>
                  </div>
                </div>
              </div>

              <div className="bg-white/85 backdrop-blur border border-white/70 rounded-3xl shadow-lg shadow-slate-200/60 p-6">
                <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Avg Transaction</p>
                <div className="mt-4 flex items-end justify-between">
                  <div>
                    <p className="text-3xl font-semibold text-slate-900">INR {avgAmount}</p>
                    <p className="text-sm text-slate-500">Mean expense</p>
                  </div>
                  <div className="h-10 w-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center">
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M4 7h16v10H4z" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M4 10h16" strokeLinecap="round" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              <section className="bg-white/85 backdrop-blur border border-white/70 rounded-3xl shadow-xl shadow-slate-200/60 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-slate-900">Spending by Category</h2>
                  <span className="text-xs uppercase tracking-[0.2em] text-slate-400">Live</span>
                </div>
                <ExpenseChart data={expenses} />
              </section>

              <section className="bg-white/85 backdrop-blur border border-white/70 rounded-3xl shadow-xl shadow-slate-200/60 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-slate-900">Quick Insights</h2>
                  <span className="text-xs uppercase tracking-[0.2em] text-slate-400">Signals</span>
                </div>
                <div className="space-y-3">
                  {totalAmount > 20000 && (
                    <div className="flex items-center gap-3 p-3 bg-rose-50 rounded-2xl border border-rose-100">
                      <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
                      <p className="text-sm text-rose-800">High spending detected. Consider saving 20% more.</p>
                    </div>
                  )}
                  {expenses.some((e) => e.category === 'Food') && (
                    <div className="flex items-center gap-3 p-3 bg-amber-50 rounded-2xl border border-amber-100">
                      <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                      <p className="text-sm text-amber-800">Food expenses are high. Try meal planning.</p>
                    </div>
                  )}
                  {expenses.length > 0 && (
                    <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-2xl border border-blue-100">
                      <span className="h-2.5 w-2.5 rounded-full bg-blue-500" />
                      <p className="text-sm text-blue-800">Most recent: INR {expenses[0]?.amount} ({expenses[0]?.category})</p>
                    </div>
                  )}
                  {expenses.length === 0 && (
                    <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-100">
                      <span className="h-2.5 w-2.5 rounded-full bg-slate-400" />
                      <p className="text-sm text-slate-800">No transactions yet. Upload your first receipt.</p>
                    </div>
                  )}
                </div>
              </section>
            </div>

            <div className="mb-8">
              <SpendingPatterns />
            </div>

            <section className="bg-white/90 backdrop-blur border border-white/70 rounded-3xl shadow-xl shadow-slate-200/60 overflow-hidden">
              <div className="p-6 border-b border-slate-200/70">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">Recent Transactions</h2>
                    <p className="text-sm text-slate-500">Latest activity across your accounts</p>
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
                    {expenses.map((tx) => (
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
                          <DeleteButton id={tx.id} />
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

        {activeTab === 'charts' && (
          <section className="bg-white/85 backdrop-blur border border-white/70 rounded-3xl shadow-xl shadow-slate-200/60 p-6">
            <BackendCharts />
          </section>
        )}

        {activeTab === 'assistant' && (
          <section className="bg-white/85 backdrop-blur border border-white/70 rounded-3xl shadow-xl shadow-slate-200/60 p-6">
            <AiAssistant />
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
      </div>
    </main>
  );
}
