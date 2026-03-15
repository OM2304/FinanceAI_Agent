'use client'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { formatINR } from '../../lib/formatters';

export function ExpenseChart({ data }) {
  // Aggregate data by category
  const categoryTotals = data.reduce((acc, curr) => {
    acc[curr.category] = (acc[curr.category] || 0) + curr.amount;
    return acc;
  }, {});

  const chartData = Object.keys(categoryTotals).map(key => ({
    name: key,
    amount: categoryTotals[key]
  }));

  if (!data || data.length === 0) {
    return (
      <div className="h-64 w-full flex items-center justify-center text-gray-500">
        <p>No data available</p>
      </div>
    );
  }

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-2 border border-gray-300 rounded shadow">
          <p className="font-semibold">{`${label}`}</p>
          <p className="text-blue-600">{`Amount: ${formatINR(payload[0].value)}`}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="h-64 w-full min-h-[256px] min-w-[300px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
          <XAxis dataKey="name" fontSize={12} />
          <YAxis />
          <Tooltip content={<CustomTooltip />} />
          <Bar dataKey="amount" fill="#3b82f6" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}