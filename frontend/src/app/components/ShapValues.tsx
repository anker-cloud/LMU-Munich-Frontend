import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface ShapData {
  feature: string;
  value: number;
}

const shapData: ShapData[] = [
  { feature: 'Hippocampal Volume', value: -2.3 },
  { feature: 'Age', value: 1.8 },
  { feature: 'Cortical Thickness', value: -1.5 },
  { feature: 'Ventricular Volume', value: 1.2 },
  { feature: 'Temporal Atrophy', value: -1.1 },
  { feature: 'White Matter', value: 0.9 },
  { feature: 'APOE-ε4 Allele', value: 0.7 },
  { feature: 'Glucose Metabolism', value: -0.6 },
];

export function ShapValues() {
  return (
    <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          SHAP Values - Feature Importance
        </h3>
        <p className="text-sm text-gray-600">
          Values explaining the contribution of each feature to the diagnosis
        </p>
      </div>
      
      <ResponsiveContainer width="100%" height={350}>
        <BarChart
          data={shapData}
          layout="vertical"
          margin={{ top: 5, right: 30, left: 120, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis type="number" stroke="#6b7280" />
          <YAxis
            type="category"
            dataKey="feature"
            stroke="#6b7280"
            width={110}
            tick={{ fontSize: 12 }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
            }}
            // FIXED FORMATTER
            formatter={(value: any) => [
              `${(typeof value === 'number' ? value : 0).toFixed(2)}`, 
              'SHAP Impact'
            ]}
          />
          <Bar dataKey="value" radius={[0, 4, 4, 0]}>
            {shapData.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={entry.value > 0 ? '#ef4444' : '#3b82f6'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      
      <div className="mt-4 flex items-center justify-center gap-6 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-red-500 rounded" />
          <span className="text-gray-600">Increases probability</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-blue-500 rounded" />
          <span className="text-gray-600">Decreases probability</span>
        </div>
      </div>
    </div>
  );
}