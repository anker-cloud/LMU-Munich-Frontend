import { useState } from 'react';
import { Layers } from 'lucide-react';

interface HeatmapSlicesProps {
  imageUrl?: string;
  onLoadChange?: (loaded: boolean) => void;
}

// 2D view of the Grad-CAM++ heatmap: the backend's {ID}_heatmap.png with the
// middle sagittal and axial slices of the scan the model saw, plain and with
// the heatmap overlaid. Shown next to the 3D viewer and used in the PDF report.
export function HeatmapSlices({ imageUrl, onLoadChange }: HeatmapSlicesProps) {
  const [failed, setFailed] = useState(false);

  return (
    <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
      <div className="flex items-center gap-2 mb-1">
        <Layers className="w-5 h-5 text-blue-600" />
        <h3 className="text-lg font-semibold text-gray-900">2D Slices with Grad-CAM</h3>
      </div>
      <p className="text-sm text-gray-500 mb-4">
        Middle sagittal and axial slices of the scan as the model saw it (skull-stripped, 1 mm), without and with the model attention map.
      </p>
      {!imageUrl || failed ? (
        <p className="text-sm text-gray-500">No 2D heatmap available for this result.</p>
      ) : (
        <img
          src={imageUrl}
          alt="Grad-CAM heatmap, sagittal and axial slices"
          crossOrigin="anonymous"
          className="w-full max-w-3xl mx-auto rounded-lg"
          onLoad={() => onLoadChange?.(true)}
          onError={() => { setFailed(true); onLoadChange?.(false); }}
        />
      )}
    </div>
  );
}
