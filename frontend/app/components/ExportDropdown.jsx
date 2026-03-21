'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Download } from 'lucide-react';
import { useReactToPrint } from 'react-to-print';
import FinancialReportTemplate from './FinancialReportTemplate';

function toCsvCell(value) {
  const raw = value == null ? '' : String(value);
  const safe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  const escaped = safe.replace(/"/g, '""');
  return /[",\n]/.test(escaped) ? `"${escaped}"` : escaped;
}

function normalizeCsvDate(value) {
  if (!value) return '';
  const asString = String(value).trim();
  const parsed = new Date(asString);
  if (Number.isNaN(parsed.getTime())) return asString;
  return parsed.toISOString().slice(0, 10);
}

function buildCsv(transactions, totalAmount, generatedAt = new Date()) {
  const parsedTotalAmount = Number(totalAmount ?? 0);
  const amountSum = (transactions ?? []).reduce((acc, t) => {
    const amountNum = Number(t?.amount ?? 0);
    return acc + (Number.isFinite(amountNum) ? amountNum : 0);
  }, 0);
  const totalSpend = Number.isFinite(parsedTotalAmount) ? parsedTotalAmount : amountSum;

  const metadataRows = [
    `# Report Title: FinSight Finance Summary`,
    `# Generated At (UTC): ${generatedAt.toISOString()}`,
    `# Total Spending: ${Number.isFinite(totalSpend) ? totalSpend.toFixed(2) : ''}`,
  ].map((line) => toCsvCell(line));

  const header = ['Date', 'Category', 'Description', 'Amount', 'Currency', 'Tax_Potential', 'Guru_Remark'];
  const taxHighCategories = new Set(['transfer', 'bills', 'travel']);

  const rows = (transactions ?? []).map((t) => {
    const date = normalizeCsvDate(t?.date ?? '');
    const category = t?.category ?? '';
    const description = t?.description ?? t?.receiver ?? '';
    const amountNum = Number(t?.amount ?? '');
    const amount = Number.isFinite(amountNum) ? amountNum.toFixed(2) : String(t?.amount ?? '');

    const currency = 'INR';
    const normalizedCategory = String(category).trim().toLowerCase();
    const taxPotential = taxHighCategories.has(normalizedCategory) ? 'High' : 'Low';

    const isSignificant =
      Number.isFinite(amountNum) &&
      Number.isFinite(totalSpend) &&
      totalSpend > 0 &&
      amountNum > totalSpend * 0.1;
    const guruRemark = isSignificant ? 'Significant' : 'Routine';

    return [date, category, description, amount, currency, taxPotential, guruRemark].map(toCsvCell).join(',');
  });

  const totalSpendRow = [
    '',
    '',
    'TOTAL SPEND',
    Number.isFinite(amountSum) ? amountSum.toFixed(2) : '',
    '',
    '',
    '',
  ]
    .map(toCsvCell)
    .join(',');

  const csvBody = [...metadataRows, header.map(toCsvCell).join(','), ...rows, totalSpendRow].join('\r\n');
  // UTF-8 BOM helps Excel open UTF-8 CSV correctly.
  return `\uFEFF${csvBody}`;
}

function downloadBlob({ filename, mimeType, data }) {
  const blob = new Blob([data], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export default function ExportDropdown({ transactions, totalAmount }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const reportRef = useRef(null);
  const [reportGeneratedAt, setReportGeneratedAt] = useState(() => new Date());

  const categoryTotals = useMemo(() => {
    return (transactions ?? []).reduce((acc, tx) => {
      const category = tx?.category ?? 'Uncategorized';
      const amount = Number(tx?.amount ?? 0);
      acc[category] = (acc[category] ?? 0) + (Number.isFinite(amount) ? amount : 0);
      return acc;
    }, {});
  }, [transactions]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event) => {
      if (!containerRef.current) return;
      if (containerRef.current.contains(event.target)) return;
      setOpen(false);
    };

    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const hasTransactions = (transactions?.length ?? 0) > 0;
  const today = new Date().toISOString().slice(0, 10);
  const transactionsCount = transactions?.length ?? 0;
  const avgAmount = transactionsCount ? Number(totalAmount ?? 0) / transactionsCount : 0;

  const handlePrint = useReactToPrint({
    contentRef: reportRef,
    documentTitle: `finance-report-${today}`,
    onBeforePrint: async () => {
      setReportGeneratedAt(new Date());
      await new Promise((resolve) => setTimeout(resolve, 0));
    },
    pageStyle: `
      @page { size: auto; margin: 14mm; }
      html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    `,
  });

  return (
    <div ref={containerRef} className="relative">
      <div className="absolute -left-[10000px] top-0">
        <div ref={reportRef}>
          <FinancialReportTemplate
            generatedAt={reportGeneratedAt.toLocaleString()}
            totalAmount={totalAmount}
            avgAmount={avgAmount}
            transactionsCount={transactionsCount}
            categoryTotals={categoryTotals}
          />
        </div>
      </div>
      <button
        type="button"
        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white hover:bg-slate-800 transition-colors shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-slate-400/50"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Download className="w-5 h-5" />
        Export
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 bg-white/90 backdrop-blur border border-white/70 rounded-2xl shadow-xl shadow-slate-200/60 p-2 flex flex-col gap-1 z-50 min-w-[220px]"
        >
          <button
            type="button"
            role="menuitem"
            disabled={!hasTransactions}
            className="px-3 py-2 text-sm text-slate-700 hover:bg-slate-50/70 rounded-xl transition-colors disabled:opacity-50 disabled:hover:bg-transparent text-left"
            onClick={async () => {
              setOpen(false);
              handlePrint();
            }}
          >
            Download PDF Report
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={!hasTransactions}
            className="px-3 py-2 text-sm text-slate-700 hover:bg-slate-50/70 rounded-xl transition-colors disabled:opacity-50 disabled:hover:bg-transparent text-left"
            onClick={() => {
              setOpen(false);
              const generatedAt = new Date();
              downloadBlob({
                filename: `finance-summary-${today}.csv`,
                mimeType: 'text/csv;charset=utf-8',
                data: buildCsv(transactions, totalAmount, generatedAt),
              });
            }}
          >
            Export CSV Summary
          </button>
        </div>
      )}
    </div>
  );
}
