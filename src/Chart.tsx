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

  return (
    <ResponsiveContainer width="100%" height={400}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="age" />
        <YAxis />
        <Tooltip />
        <Legend />
        <Line type="monotone" dataKey="balance" stroke="#8884d8" name="Balance" />
        {monteCarloResults && (
          <>
            <Line type="monotone" dataKey="p10" stroke="#ef4444" name="P10 (Optimistic)" />
            <Line type="monotone" dataKey="p50" stroke="#10b981" name="Average Balance" />
            <Line type="monotone" dataKey="p90" stroke="#3b82f6" name="P90 (Conservative)" />
          </>
        )}
      </LineChart>
    </ResponsiveContainer>
  );
};

export default Chart;
