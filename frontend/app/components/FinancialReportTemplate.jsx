'use client';

function formatINRCode(amount) {
  const num = Number(amount ?? 0);
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    currencyDisplay: 'code',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(num) ? num : 0);
}

export default function FinancialReportTemplate({
  generatedAt,
  totalAmount,
  avgAmount,
  transactionsCount,
  categoryTotals,
  guruInsights,
}) {
  const entries = Object.entries(categoryTotals ?? {}).sort(
    (a, b) => Number(b[1] ?? 0) - Number(a[1] ?? 0),
  );

  const topCategory = entries[0]?.[0];
  const topCategoryAmount = entries[0]?.[1];

  const defaultGuruInsights = [
    topCategory
      ? `Your highest spend category is "${topCategory}" (${formatINRCode(topCategoryAmount)}).`
      : 'Add more transactions to unlock richer insights.',
    'Consider setting a category budget and reviewing recurring expenses monthly.',
    'Tax tip: keep invoices for large purchases and track eligible deductions consistently.',
  ];

  const lines = (guruInsights?.length ? guruInsights : defaultGuruInsights).slice(0, 6);

  return (
    <div className="font-sans text-slate-900 bg-white">
      <div className="mx-auto w-[794px] max-w-full px-10 py-10">
        <header className="flex items-start justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-2xl bg-linear-to-br from-amber-400 via-rose-400 to-orange-500 shadow-lg shadow-orange-200/60 flex items-center justify-center text-white font-bold">
              FM
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">FinSight Console</p>
              <h1 className="text-2xl font-semibold tracking-tight">Financial Statement</h1>
              <p className="text-sm text-slate-600 mt-1">Clarity-first tracking snapshot for your records.</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Generated</p>
            <p className="text-sm font-medium text-slate-700">{generatedAt}</p>
          </div>
        </header>

        <div className="mt-8 rounded-3xl border border-slate-200/70 overflow-hidden">
          <div className="bg-slate-50/70 px-6 py-4 border-b border-slate-200/70">
            <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Summary Statistics</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 px-6 py-6">
            <div className="rounded-2xl bg-white/85 border border-white/70 shadow-lg shadow-slate-200/60 p-4">
              <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Total Spent</p>
              <p className="mt-3 text-2xl font-semibold text-slate-900">{formatINRCode(totalAmount)}</p>
            </div>
            <div className="rounded-2xl bg-white/85 border border-white/70 shadow-lg shadow-slate-200/60 p-4">
              <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Avg Transaction</p>
              <p className="mt-3 text-2xl font-semibold text-slate-900">{formatINRCode(avgAmount)}</p>
            </div>
            <div className="rounded-2xl bg-white/85 border border-white/70 shadow-lg shadow-slate-200/60 p-4">
              <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Transactions</p>
              <p className="mt-3 text-2xl font-semibold text-slate-900">{transactionsCount ?? 0}</p>
            </div>
          </div>
        </div>

        <section className="mt-8 rounded-3xl border border-slate-200/70 overflow-hidden">
          <div className="bg-slate-50/70 px-6 py-4 border-b border-slate-200/70 flex items-center justify-between">
            <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Category Table</p>
            <p className="text-xs text-slate-500">Sorted by spend</p>
          </div>
          <div className="px-6 py-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="py-2">Category</th>
                  <th className="py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {entries.length === 0 ? (
                  <tr>
                    <td className="py-3 text-slate-500" colSpan={2}>
                      No category data available.
                    </td>
                  </tr>
                ) : (
                  entries.map(([category, amount]) => (
                    <tr key={category}>
                      <td className="py-3 text-slate-900">{category}</td>
                      <td className="py-3 text-right font-semibold text-slate-900">
                        {formatINRCode(amount)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-8 rounded-3xl border border-slate-200/70 overflow-hidden">
          <div className="bg-slate-50/70 px-6 py-4 border-b border-slate-200/70">
            <p className="text-xs uppercase tracking-[0.25em] text-slate-500">AI Guru Insights</p>
          </div>
          <div className="px-6 py-6">
            <div className="rounded-2xl bg-white/85 border border-white/70 shadow-lg shadow-slate-200/60 p-5">
              <p className="text-sm font-semibold text-slate-900">Guidance snapshot</p>
              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                {lines.map((line, idx) => (
                  <li key={`${idx}-${line}`} className="flex gap-3">
                    <span className="mt-[6px] h-2 w-2 rounded-full bg-slate-900 shrink-0" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <footer className="mt-10 pt-6 border-t border-slate-200/70 flex items-center justify-between text-xs text-slate-500">
          <span>Finance Manager • Clarity-first reporting</span>
          <span>Confidential</span>
        </footer>
      </div>
    </div>
  );
}
