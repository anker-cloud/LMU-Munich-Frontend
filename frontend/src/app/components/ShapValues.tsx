import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { FileText } from 'lucide-react';
import type { SHAPResult } from '../types';

interface ShapData {
  feature: string;
  value: number;
}

interface ShapValuesProps {
  shap?: SHAPResult;
  diagnosis?: string;
  onImageLoad?: () => void;
}

export function ShapValues({ shap, diagnosis, onImageLoad }: ShapValuesProps) {
  const target = diagnosis || 'the predicted diagnosis';
  const shapData: ShapData[] = shap?.features
    ? shap.features.map(f => ({
        feature: f.feature,
        value: f.shap
      }))
    : [];

  if (!shap || shapData.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">SHAP Values - Feature Importance</h3>
        <p className="text-sm text-gray-500">No SHAP values were calculated for this result. They need clinical values and a GPU on the server, and are skipped when an analysis runs without explanations.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200 space-y-6">
      <div className="flex flex-row justify-between items-start border-b pb-4 border-slate-100">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">SHAP Values - Feature Importance</h3>
          <p className="text-sm text-gray-500">How much each clinical value pushed the model towards or away from {target}.</p>
        </div>
        {shap.chart_path && (
          <>
            <img
              src={shap.chart_path}
              alt="SHAP Chart"
              className="hidden"
              onLoad={() => onImageLoad?.()}
              onError={() => onImageLoad?.()}
            />
            <a
              href={shap.chart_path}
              target="_blank"
              rel="noreferrer"
              data-html2canvas-ignore="true"
              className="inline-flex items-center gap-2 text-xs font-bold text-blue-600 bg-blue-50 px-3 py-2 rounded-lg hover:bg-blue-100 transition-colors"
            >
              <FileText className="w-3.5 h-3.5" /> Open chart image
            </a>
          </>
        )}
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={shapData} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis type="number" stroke="#6b7280" />
          <YAxis type="category" dataKey="feature" stroke="#6b7280" width={80} tick={{ fontSize: 11, fontWeight: 'bold' }} />
          <Tooltip
            contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }}
            formatter={(value) => {
              const v = Array.isArray(value) ? value[0] : value;
              return [Number(v).toFixed(4), 'Attribution Weight'];
            }}
          />
          <Bar dataKey="value" radius={[0, 4, 4, 0]}>
            {shapData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.value > 0 ? '#dc2626' : '#2563eb'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      
      <div className="flex items-center justify-center gap-6 text-xs font-bold">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-red-600 rounded" />
          <span className="text-gray-600">Supports {target}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-blue-600 rounded" />
          <span className="text-gray-600">Argues against {target}</span>
        </div>
      </div>
    </div>
  );
}