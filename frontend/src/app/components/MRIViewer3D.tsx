import { useEffect, useRef, useState } from 'react';
import { Niivue } from '@niivue/niivue';
import { Eye, AlertTriangle, RefreshCw, Loader2 } from 'lucide-react';

interface MRIViewer3DProps {
  mriUrl?: string;
  overlayUrl?: string;
  title?: string;
  onRefreshRequest?: () => void;
}

export function MRIViewer3D({
  mriUrl,
  overlayUrl,
  title = "MRI 3D Brain Visualization",
  onRefreshRequest
}: MRIViewer3DProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nvRef = useRef<Niivue | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!canvasRef.current || !mriUrl) return;

    setLoading(true);
    setError(false);

    const nv = new Niivue({
      show3Dcrosshair: false,
      backColor: [0.1, 0.1, 0.1, 1],
      crosshairColor: [1, 0, 0, 1],
      isOrientCube: true,
      meshXRay: 0.3,
    });

    nv.attachToCanvas(canvasRef.current);

    // Set to 3D volume rendering mode
    nv.setSliceType(nv.sliceTypeRender);

    // Prepare volumes
    const volumes: any[] = [
      {
        url: mriUrl,
        colormap: 'gray',
        opacity: 1,
        cal_min: 0,
        cal_max: 255,
      }
    ];

    // Add heatmap overlay if provided
    if (overlayUrl) {
      volumes.push({
        url: overlayUrl,
        colormap: 'hot',
        opacity: 0.6,
        cal_min: 0,
        cal_max: 1,
      });
    }

    // Load volumes
    nv.loadVolumes(volumes)
      .then(() => {
        setLoading(false);
        // Set default view angle for nice brain perspective
        nv.setClipPlane([0, 0, 0]);
        nv.setRenderAzimuthElevation(120, 10);
      })
      .catch((err) => {
        console.error('Failed to load NIfTI volumes:', err);
        setError(true);
        setLoading(false);
      });

    nvRef.current = nv;

    return () => {
      if (nvRef.current) {
        nvRef.current.destroy();
      }
    };
  }, [mriUrl, overlayUrl]);

  return (
    <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200 flex flex-col h-full">
      <div className="flex items-center justify-between mb-4 border-b pb-2 border-slate-50">
        <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
          <Eye className="w-4 h-4 text-blue-500" /> {title}
        </h3>
        <span className="text-[10px] bg-slate-100 text-slate-500 font-mono px-2 py-0.5 rounded uppercase tracking-wider">
          3D Volume
        </span>
      </div>

      <div className="relative bg-slate-900 rounded-lg overflow-hidden flex-1 flex items-center justify-center min-h-[400px]">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center z-10 bg-slate-900/50">
            <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
          </div>
        )}

        {error ? (
          <div className="text-center space-y-3 p-6 text-red-400">
            <AlertTriangle className="w-8 h-8 mx-auto opacity-90 animate-pulse" />
            <p className="text-xs font-black uppercase tracking-wide">Failed to Load 3D Brain</p>
            <p className="text-[11px] text-slate-400 max-w-xs">
              Could not fetch NIfTI volume from server.
            </p>
            {onRefreshRequest && (
              <button
                onClick={onRefreshRequest}
                className="mt-3 flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all text-xs font-bold mx-auto"
              >
                <RefreshCw className="w-3 h-3" /> Retry
              </button>
            )}
          </div>
        ) : mriUrl ? (
          <canvas
            ref={canvasRef}
            className="w-full h-full"
            style={{ minHeight: '400px' }}
          />
        ) : (
          <div className="text-center space-y-2 p-6 text-slate-400">
            <Eye className="w-8 h-8 mx-auto opacity-40" />
            <p className="text-xs font-bold">No MRI volume provided</p>
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between border-t pt-3 border-slate-50">
        <div className="flex items-center gap-2">
          <div className="w-24 h-2.5 bg-gradient-to-r from-blue-500 via-yellow-400 to-red-600 rounded" />
          <span className="text-[10px] font-bold text-slate-400 uppercase">Attention Intensity</span>
        </div>
        <div className="text-[10px] text-slate-400">
          <p>🖱️ Drag to rotate • Scroll to zoom • Right-click to pan</p>
        </div>
      </div>
    </div>
  );
}
