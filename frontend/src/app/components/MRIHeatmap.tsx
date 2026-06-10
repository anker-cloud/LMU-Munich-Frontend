import { useState, useEffect } from 'react';
import { Eye, ImageOff, AlertTriangle, RefreshCw } from 'lucide-react';

interface MRIHeatmapProps {
  imageUrl?: string;
  title?: string;
  onRefreshRequest?: () => void;
}

export function MRIHeatmap({ imageUrl, title = "MRI T1w with Attention Heatmap", onRefreshRequest }: MRIHeatmapProps) {
  const [networkError, setNetworkError] = useState(false);
  const [currentUrl, setCurrentUrl] = useState(imageUrl);

  // Reset error state when imageUrl changes (e.g., after refresh)
  useEffect(() => {
    setCurrentUrl(imageUrl);
    setNetworkError(false);
  }, [imageUrl]);

  const handleRefreshClick = () => {
    if (onRefreshRequest) {
      onRefreshRequest();
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200 flex flex-col h-full">
      <div className="flex items-center justify-between mb-4 border-b pb-2 border-slate-50">
        <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
          <Eye className="w-4 h-4 text-blue-500" /> {title}
        </h3>
        <span className="text-[10px] bg-slate-100 text-slate-500 font-mono px-2 py-0.5 rounded uppercase tracking-wider">Grad-CAM</span>
      </div>

      <div className="relative bg-slate-900 rounded-lg overflow-hidden flex-1 flex items-center justify-center p-4 min-h-[260px]">
        {currentUrl && !networkError ? (
          <img
            src={currentUrl}
            alt="MRI Scan with GRAD-CAM Heatmap"
            className="w-full h-auto max-h-[280px] object-contain rounded animate-in fade-in duration-500"
            onError={() => setNetworkError(true)} // Set exact flag on asset load crash
          />
        ) : networkError ? (
          <div className="text-center space-y-3 p-6 text-red-400">
            <AlertTriangle className="w-8 h-8 mx-auto opacity-90 animate-pulse" />
            <p className="text-xs font-black uppercase tracking-wide">Image Load Failure</p>
            <p className="text-[11px] text-slate-400 max-w-xs">The image could not be fetched from the server.</p>
            {onRefreshRequest && (
              <button
                onClick={handleRefreshClick}
                className="mt-3 flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all text-xs font-bold mx-auto"
              >
                <RefreshCw className="w-3 h-3" /> Refresh Image
              </button>
            )}
          </div>
        ) : (
          <div className="text-center space-y-2 p-6 text-slate-400">
            <ImageOff className="w-8 h-8 mx-auto opacity-40" />
            <p className="text-xs font-bold">No attention mapping payload link provided</p>
          </div>
        )}
      </div>
      
      <div className="mt-4 flex items-center justify-between border-t pt-3 border-slate-50">
        <div className="flex items-center gap-2">
          <div className="w-24 h-2.5 bg-gradient-to-r from-blue-500 via-yellow-400 to-red-600 rounded" />
          <span className="text-[10px] font-bold text-slate-400 uppercase">Activation Intensity</span>
        </div>
        <span className="text-[10px] font-mono text-slate-400">Live Server Mapping Vector</span>
      </div>
    </div>
  );
}