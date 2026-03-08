'use client'

import { useEffect, useMemo, useState } from 'react';
import { fetchBudgetLimits, fetchBudgetSummary, saveBudgetLimits } from '../../lib/api';

const DEFAULT_CATEGORIES = [
  'Food',
  'Transport',
  'Shopping',
  'Utilities',
  'Health',
  'Education',
  'Entertainment',
  'Others',
];

const CATEGORY_ALIASES = {
  other: 'Others',
  others: 'Others',
  uncategorized: 'Uncategorized',
  bills: 'Bills',
  investment: 'Investment',
};

const normalizeCategory = (value) => {
  if (!value) return '';
  const trimmed = String(value).trim().replace(/\s+/g, ' ');
  const lower = trimmed.toLowerCase();
  return CATEGORY_ALIASES[lower] || trimmed;
};

export function BudgetPanel({ categories = [] }) {
  const [limits, setLimits] = useState({});
  const [summary, setSummary] = useState([]);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [newAmount, setNewAmount] = useState('');

  const mergedCategories = useMemo(() => {
    const all = [
      ...DEFAULT_CATEGORIES,
      ...categories,
      ...Object.keys(limits || {}),
    ];

    const map = new Map();
    all.forEach((item) => {
      const normalized = normalizeCategory(item);
      if (!normalized) return;
      const key = normalized.toLowerCase();
      if (!map.has(key)) {
        map.set(key, normalized);
      }
    });

    return Array.from(map.values());
  }, [categories, limits]);

  useEffect(() => {
    const token = localStorage.getItem('sb-token');
    if (!token) return;

    const load = async () => {
      try {
        const limitsRes = await fetchBudgetLimits(token);
        const limitsData = limitsRes?.limits || {};
        const normalizedLimits = {};
        Object.entries(limitsData).forEach(([key, value]) => {
          const normalized = normalizeCategory(key);
          if (!normalized) return;
          normalizedLimits[normalized] = value;
        });
        setLimits(normalizedLimits);

        const summaryRes = await fetchBudgetSummary(token);
        const summaryData = summaryRes?.summary || [];
        setSummary(summaryData);
      } catch (err) {
        setError(err.message || 'Failed to load budget data');
      }
    };

    load();
  }, []);

  const handleAmountChange = (category, value) => {
    const normalized = normalizeCategory(category);
    setLimits((prev) => ({ ...prev, [normalized]: value }));
  };

  const handleSave = async () => {
    const token = localStorage.getItem('sb-token');
    if (!token) return;

    setStatus('saving');
    setError('');
    try {
      const cleaned = {};
      Object.entries(limits).forEach(([key, value]) => {
        if (value === '' || value === null || value === undefined) return;
        const amount = Number(value);
        if (!Number.isNaN(amount)) cleaned[key] = amount;
      });

      const res = await saveBudgetLimits(cleaned, token);
      const summaryRes = await fetchBudgetSummary(token);
      setSummary(summaryRes?.summary || []);
      setLimits(res?.limits || cleaned);
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 2000);
    } catch (err) {
      setStatus('idle');
      setError(err.message || 'Failed to save');
    }
  };

  const handleAddCategory = () => {
    const category = newCategory.trim();
    if (!category) return;
    const normalized = normalizeCategory(category);
    setLimits((prev) => ({ ...prev, [normalized]: newAmount ? Number(newAmount) : '' }));
    setNewCategory('');
    setNewAmount('');
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <section className="lg:col-span-2 bg-white/85 backdrop-blur border border-white/70 rounded-3xl shadow-xl shadow-slate-200/60 p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Budget Limits</h2>
            <p className="text-sm text-slate-500">Set monthly caps for your main spending categories.</p>
          </div>
          <button
            onClick={handleSave}
            className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800"
            disabled={status === 'saving'}
          >
            {status === 'saving' ? 'Saving...' : status === 'saved' ? 'Saved' : 'Save Limits'}
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-2xl bg-rose-50 border border-rose-100 text-sm text-rose-700">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {mergedCategories.map((category) => (
            <label key={category} className="flex items-center justify-between gap-3 p-3 rounded-2xl border border-slate-100 bg-slate-50/60">
              <span className="text-sm font-semibold text-slate-700">{category}</span>
              <input
                type="number"
                min="0"
                placeholder="0"
              value={limits[normalizeCategory(category)] ?? ''}
                onChange={(e) => handleAmountChange(category, e.target.value)}
                className="w-32 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/20"
              />
            </label>
          ))}
        </div>

        <div className="mt-6 flex flex-col sm:flex-row gap-3">
          <input
            className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            placeholder="Add custom category"
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
          />
          <input
            className="w-40 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            type="number"
            min="0"
            placeholder="Amount"
            value={newAmount}
            onChange={(e) => setNewAmount(e.target.value)}
          />
          <button
            onClick={handleAddCategory}
            className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Add
          </button>
        </div>
      </section>

      <section className="bg-white/85 backdrop-blur border border-white/70 rounded-3xl shadow-xl shadow-slate-200/60 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-900">Budget Status</h3>
          <span className="text-xs uppercase tracking-[0.2em] text-slate-400">Live</span>
        </div>

        {summary.length === 0 && (
          <div className="text-sm text-slate-500">No budget summary yet. Save limits to see results.</div>
        )}

        {summary.map((row, index) => (
          <div key={`${row.Category || row.status}-${index}`} className="mb-3 rounded-2xl border border-slate-100 bg-slate-50/60 p-3">
            {row.status && !row.Category ? (
              <p className="text-sm text-slate-600">{row.recommendation || row.status}</p>
            ) : (
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-800">{row.Category}</p>
                  <p className="text-xs text-slate-500">{row.Recommendation}</p>
                </div>
                <div className={`text-xs font-semibold px-2 py-1 rounded-full ${row.Status === 'OVER BUDGET' ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
                  {row.Status}
                </div>
              </div>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
