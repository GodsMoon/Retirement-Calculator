import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import type { MonthlyProjection } from './finance';

interface ChartProps {
  projections: MonthlyProjection[];
  monteCarloResults?: {
    month: number;
    age: number;
    p10: number;
    p50: number;
    p90: number;
  }[];
}

const Chart: React.FC<ChartProps> = ({ projections, monteCarloResults }) => {
  const data = projections.map((p, index) => {
    const mc = monteCarloResults?.[index];
    return {
      age: p.age,
      balance: p.balance,
      p10: mc?.p10,
      p50: mc?.p50,
      p90: mc?.p90,
    };
  });

  const currency = new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });

  return (
    <ResponsiveContainer width="100%" height={400}>
      <LineChart data={data.map(b => ({ age: b.age, p10: b.p10, p50: b.p50, p90: b.p90 }))} margin={{ left: 42, right: 8, top: 8, bottom: 24 }}>
        <CartesianGrid strokeDasharray="3" />
        <XAxis dataKey="age" tickFormatter={(v) => (v >= 1 ? (Math.round(v)) : v.toFixed(2))}/>
        <YAxis tickFormatter={(v) => (v >= 1 ? (currency.format(v)) : v.toFixed(2))} />
        <Tooltip formatter={(v: any) => typeof v === 'number' ? currency.format(v) : v} itemSorter={(item) => { return (item.value as number) * -1; }} />
        <Legend filter=''/>
        <Line type="monotone" dataKey="balance" stroke="#8884d8" name="Balance" />
        {monteCarloResults && (
          <>
            <Line type="monotone" dataKey="p10" stroke="#ef4444" name="10%tile (Pessimistic)" />
            <Line type="monotone" dataKey="p50" stroke="#10b981" name="50%tile (Median)" />
            <Line type="monotone" dataKey="p90" stroke="#3b82f6" name="90%tile (Optimistic)" />
          </>
        )}
      </LineChart>
    </ResponsiveContainer>
  );
};

export default Chart;
