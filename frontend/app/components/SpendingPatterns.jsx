'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const COLORS = ['#1e293b', '#4f46e5', '#0ea5e9', '#94a3b8', '#10b981'];

const formatCurrency = (value) => {
  const num = Number(value || 0);
  return `INR ${num.toFixed(2)}`;
};

function DonutSparkline({
  title,
  primaryLabel,
  primaryValue,
  secondaryLabel,
  secondaryValue,
  footnote,
  colors = [COLORS[2], COLORS[3]],
}) {
  const a = Number(primaryValue || 0);
  const b = Number(secondaryValue || 0);
  const total = Math.max(a + b, 1);
  const data = [
    { name: primaryLabel, value: a },
    { name: secondaryLabel, value: b },
  ];
  const primaryShare = Math.round((a / total) * 100);

  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4 shadow-sm shadow-slate-200/50">
      <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{title}</p>
      <div className="mt-3 flex items-center gap-4">
        <div className="h-44 w-44 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                innerRadius={60}
                outerRadius={80}
                stroke="none"
                startAngle={90}
                endAngle={-270}
              >
                {data.map((entry, idx) => (
                  <Cell key={`${entry.name}-${idx}`} fill={colors[idx % colors.length]} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="min-w-0 space-y-1 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="text-slate-600 truncate">{primaryLabel}</span>
            <span className="font-semibold text-slate-900">{formatCurrency(a)}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-slate-600 truncate">{secondaryLabel}</span>
            <span className="font-semibold text-slate-900">{formatCurrency(b)}</span>
          </div>
          <p className="text-[11px] text-slate-500">
            {primaryLabel}: {primaryShare}%
          </p>
        </div>
      </div>
      <p className="text-xs text-slate-500 mt-2">{footnote}</p>
    </div>
  );
}

export function SpendingPatterns({ data, loading, error }) {
  if (loading) {
    return (
      <div className="bg-white/85 backdrop-blur border border-white/70 rounded-3xl shadow-xl shadow-slate-200/60 p-6">
        <p className="text-sm text-slate-500">Loading spending patterns...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white/85 backdrop-blur border border-white/70 rounded-3xl shadow-xl shadow-slate-200/60 p-6">
        <p className="text-sm text-slate-500">{error}</p>
      </div>
    );
  }

  if (!data || data.has_data === false) {
    return (
      <div className="bg-white/85 backdrop-blur border border-white/70 rounded-3xl shadow-xl shadow-slate-200/60 p-6">
        <h2 className="text-lg font-semibold text-slate-900">Spending Patterns</h2>
        <p className="mt-2 text-sm text-slate-500">Upload your first receipt to see patterns!</p>
      </div>
    );
  }

  const weekend = Number(data?.weekend_vs_weekday?.weekend ?? 0);
  const weekday = Number(data?.weekend_vs_weekday?.weekday ?? 0);
  const total = Math.max(weekend + weekday, 1);
  const weekendShare = Math.round((weekend / total) * 100);

  const categoryDistribution = Array.isArray(data?.category_distribution) ? data.category_distribution : [];
  const monthlyTrend = Array.isArray(data?.monthly_trend) ? data.monthly_trend : [];

  return (
    <section className="bg-white/85 backdrop-blur border border-white/70 rounded-3xl shadow-xl shadow-slate-200/60 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-slate-900">Spending Patterns</h2>
        <span className="text-xs uppercase tracking-[0.2em] text-slate-400">Last 30 days</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DonutSparkline
          title="Weekend vs Weekday"
          primaryLabel="Weekend"
          primaryValue={weekend}
          secondaryLabel="Weekday"
          secondaryValue={weekday}
          footnote={`${weekendShare}% of spend happens on weekends.`}
          colors={[COLORS[1], COLORS[0]]}
        />

        <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4 shadow-sm shadow-slate-200/50">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Category Distribution</p>
          {categoryDistribution.length ? (
            <div className="mt-3 h-44">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryDistribution}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={60}
                    outerRadius={80}
                    stroke="none"
                  >
                    {categoryDistribution.map((entry, idx) => (
                      <Cell key={`${entry.name}-${idx}`} fill={COLORS[idx % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(val) => formatCurrency(val)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-sm text-slate-500 mt-2">No categories detected yet.</p>
          )}
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50/60 p-4 shadow-sm shadow-slate-200/50">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Monthly Trend</p>
        {monthlyTrend.length ? (
          <div className="mt-3 h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyTrend} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" hide />
                <YAxis tickFormatter={(v) => `${Math.round(v)}`} width={38} />
                <Tooltip formatter={(val) => formatCurrency(val)} labelFormatter={() => ''} />
                <Bar dataKey="value" fill={COLORS[0]} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-sm text-slate-500 mt-2">Not enough data to show the last 30 days.</p>
        )}
      </div>
    </section>
  );
}
