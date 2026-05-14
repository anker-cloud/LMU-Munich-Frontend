import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

interface MRIHeatmapProps {
  imageUrl: string;
  title?: string;
}

export function MRIHeatmap({ imageUrl, title = "MRI T1w with Attention Heatmap" }: MRIHeatmapProps) {
  const [showHeatmap, setShowHeatmap] = useState(true);

  return (
    <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
      </div>
      
      <div className="relative bg-gray-900 rounded-lg overflow-hidden">
        <img
          src={imageUrl}
          alt="MRI Scan with GRAD-CAM Heatmap"
          className="w-full h-auto object-contain"
        />
      </div>
      
      <div className="mt-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-24 h-3 bg-gradient-to-r from-blue-400 via-yellow-400 to-red-600 rounded" />
          <span className="text-xs text-gray-500">Low → High Activation</span>
        </div>
        <span className="text-xs text-gray-500">GRAD-CAM Visualization</span>
      </div>
    </div>
  );
}