import { useEffect, useRef, useState } from 'react';
import { Niivue } from '@niivue/niivue';
import { Eye, AlertTriangle, RefreshCw, Loader2 } from 'lucide-react';

interface MRIViewer3DProps {
  mriUrl?: string;
  overlayUrl?: string;
  title?: string;
  onRefreshRequest?: () => void;
  onLoadComplete?: () => void;
}

export function MRIViewer3D({
  mriUrl,
  overlayUrl,
  title = "3D Brain with Grad-CAM",
  onRefreshRequest,
  onLoadComplete
}: MRIViewer3DProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nvRef = useRef<Niivue | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [viewMode, setViewMode] = useState<'3d' | 'slices'>('slices');
  const [showOverlay, setShowOverlay] = useState(true);  // Backend: overlay toggle

  useEffect(() => {
    if (!canvasRef.current || !mriUrl) {
      console.log('[MRIViewer3D] Skipping initialization - canvas or URL missing');
      return;
    }

    // Guard against rapid re-mounting
    if (nvRef.current) {
      console.log('[MRIViewer3D] Niivue instance already exists, cleaning up first');
      try {
        nvRef.current.destroy();
      } catch (e) {
        console.log('[MRIViewer3D] Error destroying old instance:', e.message);
      }
      nvRef.current = null;
    }

    console.log('[MRIViewer3D] ========================================');
    console.log('[MRIViewer3D] Initializing with:');
    console.log('[MRIViewer3D]   MRI URL:', mriUrl);
    console.log('[MRIViewer3D]   Overlay URL:', overlayUrl);
    console.log('[MRIViewer3D] ========================================');

    setLoading(true);
    setError(false);

    const nv = new Niivue({
      show3Dcrosshair: true,  // Backend recommends showing crosshair
      backColor: [0, 0, 0, 1],
      isOrientCube: true,
      isRadiologicalConvention: false,  // Use neurological convention
      logging: false,  // Reduce console noise
      isColorbar: true,  // Backend: show activation scale for GradCAM
      multiplanarForceRender: true,  // always show the 3D render tile alongside slices
      multiplanarPadding: 4,         // consistent spacing so tile heights line up
    });

    // Attach to canvas and verify it worked
    try {
      nv.attachToCanvas(canvasRef.current);

      // Wrap the resize listener to add null safety
      const originalResizeListener = nv.resizeListener?.bind(nv);
      if (originalResizeListener) {
        nv.resizeListener = () => {
          try {
            if (canvasRef.current && nv.gl) {
              originalResizeListener();
            }
          } catch (err) {
            // Silently ignore resize errors when canvas is gone
          }
        };
      }
    } catch (err) {
      console.error('[MRIViewer3D] Failed to attach to canvas:', err);
      setError(true);
      setLoading(false);
      return;
    }

    // Enable mouse wheel zoom (scroll to zoom in 3D mode)
    nv.opts.dragMode = nv.dragModes.pan;

    // Helper function to try loading MRI with fallback URLs
    const tryLoadMriAndOverlay = async (primaryMriUrl: string, overlayUrl?: string) => {
      const patientId = primaryMriUrl.match(/patient\/([^/]+)\//)?.[1];
      const cacheBust = primaryMriUrl.match(/\?t=\d+/)?.[0] || '';

      // Build candidate URLs
      const fallbackUrls: string[] = [];
      if (patientId) {
        const base = primaryMriUrl.split('/file/')[0];
        if (!primaryMriUrl.includes('flair')) fallbackUrls.push(`${base}/file/${patientId}_flair.nii.gz${cacheBust}`);
        if (!primaryMriUrl.includes('t1w')) fallbackUrls.push(`${base}/file/${patientId}_t1w.nii.gz${cacheBust}`);
      }
      const allUrls = [primaryMriUrl, ...fallbackUrls];

      // Cheap range request — confirms file exists without downloading the body
      const checkExists = async (url: string): Promise<boolean> => {
        try {
          const resp = await fetch(url, {
            method: 'GET',
            headers: { 'Range': 'bytes=0-0' }
          });
          const size = resp.headers.get('content-range') || resp.headers.get('content-length');
          console.log(`[MRIViewer3D] CHECK ${url} → ${resp.status} (${size} bytes)`);
          return resp.status === 206 || resp.status === 200;
        } catch {
          return false;
        }
      };

      // Fire all checks in parallel — pays max(latency) not sum(latency)
      const existence = await Promise.all(allUrls.map(checkExists));
      const validUrl = allUrls.find((_, i) => existence[i]);

      if (!validUrl) {
        console.error('[MRIViewer3D] ❌ No valid MRI URL found. Tried:', allUrls);
        throw new Error(`No valid MRI found. Tried: ${allUrls.join(', ')}`);
      }

      console.log(`[MRIViewer3D] ✓ Using MRI URL: ${validUrl}`);

      const isFlair = validUrl.toLowerCase().includes('flair');
      const isPreprocessed = validUrl.toLowerCase().includes('preprocessed');

      // Build volume list — load both together so Niivue handles overlay correctly
      const volumes: any[] = [
        {
          url: validUrl,
          colormap: 'gray',
          opacity: 1.0,
          cal_min: isPreprocessed ? 0 : (isFlair ? 0 : 5),
          cal_max: isPreprocessed ? 1 : (isFlair ? 250 : 180),
        }
      ];

      if (overlayUrl) {
        volumes.push({
          url: overlayUrl,
          colormap: 'hot',
          opacity: 0.5,
          cal_min: 0.4,
          cal_max: 1.0,
        });
        console.log(`[MRIViewer3D] Loading with overlay: ${overlayUrl}`);
      }

      const start_time = performance.now();
      await nv.loadVolumes(volumes);
      console.log(`[MRIViewer3D] ✓✓✓ Successfully loaded ${volumes.length} volume(s) from: ${validUrl}`);
      console.log(`[MRIViewer3D] Total load time: ${(performance.now() - start_time).toFixed(0)} ms`);

      return validUrl;
    };

    // Try loading base MRI (and overlay if available) with fallbacks
    const start_time = performance.now();
    tryLoadMriAndOverlay(mriUrl, overlayUrl)

      .then(async () => {
        console.log('[MRIViewer3D] ✓ Volumes loaded successfully');
        console.log('[MRIViewer3D] Total volumes:', nv.volumes.length);
        const end_time = performance.now();

        console.log('[MRIViewer3D] Load time:', end_time - start_time, 'ms');

        // Log each volume
        nv.volumes.forEach((vol, idx) => {
          console.log(`[MRIViewer3D]   Volume ${idx}:`, {
            dims: vol.dims,
            colormap: vol.colormap,
            opacity: vol.opacity,
            cal_min: vol.cal_min,
            cal_max: vol.cal_max,
            global_min: vol.global_min,
            global_max: vol.global_max,
          });
        });

        // Auto-adjust contrast for better visibility of base volume
        const baseVol = nv.volumes[0];
        if (baseVol && baseVol.global_max > 0) {
          baseVol.cal_min = baseVol.robust_min || baseVol.global_min;
          baseVol.cal_max = baseVol.robust_max || baseVol.global_max;
          console.log('[MRIViewer3D] Auto-calibrated base volume:', baseVol.cal_min, 'to', baseVol.cal_max);
        }

        // Check overlay if it was loaded
        if (nv.volumes.length > 1) {
          const baseVol = nv.volumes[0];
          const overlayVol = nv.volumes[1];

          console.log('[MRIViewer3D] ========== OVERLAY DIAGNOSTICS ==========');
          console.log('[MRIViewer3D] Base volume dims:', baseVol?.dims);
          console.log('[MRIViewer3D] Overlay volume dims:', overlayVol?.dims);

          // Check if overlay has valid data — dims is unreliable even on a successful load,
          // so use global_max (set from the actual voxel data) as the real corruption signal.
          if (!overlayVol || typeof overlayVol.global_max !== 'number') {
            console.error('[MRIViewer3D] ❌ OVERLAY HAS NO DATA RANGE - File may be corrupted!');
          } else {
            console.log('[MRIViewer3D] ✅ Overlay loaded with valid data range:', overlayVol.global_min, 'to', overlayVol.global_max);
          }

          console.log('[MRIViewer3D] ==========================================');

          // Force update to ensure settings are applied
          nv.updateGLVolume();
        }

        // Start with slice view by default
        nv.setSliceType(nv.sliceTypeMultiplanar);

        // Level the 3D render camera (elevation=0) so the brain object is vertically
        // centered in its tile, matching the always-centered 2D slice tiles.
        nv.setRenderAzimuthElevation(110, 0);

        setLoading(false);
        onLoadComplete?.();
      })
      .catch((err) => {
        console.error('[MRIViewer3D] ✗ Failed to load NIfTI volumes:', err);
        setError(true);
        setLoading(false);
        onLoadComplete?.(); // Still notify even on error
      });

    nvRef.current = nv;

    return () => {
      // Cleanup: safely destroy Niivue instance
      if (nvRef.current) {
        try {
          // Check if canvas still exists before destroying
          const canvas = canvasRef.current;
          if (canvas && nvRef.current.gl) {
            // Canvas is still attached, safe to destroy
            if (typeof nvRef.current.destroy === 'function') {
              nvRef.current.destroy();
            }
          } else {
            // Canvas already unmounted, just clear the reference
            console.log('[MRIViewer3D] Cleanup: Canvas already unmounted, skipping destroy');
          }
        } catch (err) {
          // Ignore cleanup errors (canvas may already be unmounted)
          console.log('[MRIViewer3D] Cleanup error (safe to ignore):', err.message);
        }
        nvRef.current = null;
      }
    };
  }, [mriUrl, overlayUrl]);

  return (
    <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200 flex flex-col h-full">
      <div className="flex items-center justify-between mb-4 border-b pb-2 border-slate-50">
        <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
          <Eye className="w-4 h-4 text-blue-500" /> {title}
        </h3>
        <div className="flex items-center gap-2">
          {/* Overlay toggle button */}
          {overlayUrl && (
            <button
              onClick={() => {
                if (!nvRef.current || !nvRef.current.volumes[1]) return;
                const newShowOverlay = !showOverlay;
                nvRef.current.volumes[1].opacity = newShowOverlay ? 0.5 : 0;  // Revert to 0.5
                nvRef.current.updateGLVolume();
                setShowOverlay(newShowOverlay);
              }}
              className={`text-[10px] px-3 py-1 rounded transition-colors font-bold uppercase tracking-wider ${showOverlay
                  ? 'bg-orange-600 text-white hover:bg-orange-700'
                  : 'bg-slate-300 text-slate-600 hover:bg-slate-400'
                }`}
            >
              {showOverlay ? 'Hide Heatmap' : 'Show Heatmap'}
            </button>
          )}
          <button
            onClick={() => {
              const newMode = viewMode === '3d' ? 'slices' : '3d';
              setViewMode(newMode);
              if (nvRef.current) {
                if (newMode === 'slices') {
                  nvRef.current.setSliceType(nvRef.current.sliceTypeMultiplanar);
                } else {
                  nvRef.current.setSliceType(nvRef.current.sliceTypeRender);
                  nvRef.current.setRenderAzimuthElevation(120, 10);
                }
              }
            }}
            className="text-[10px] bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 transition-colors font-bold uppercase tracking-wider"
          >
            {viewMode === '3d' ? 'Show Slices' : 'Show 3D'}
          </button>
          <span className="text-[10px] bg-slate-100 text-slate-500 font-mono px-2 py-0.5 rounded uppercase tracking-wider">
            {viewMode === '3d' ? '3D Volume' : 'Slices'}
          </span>
        </div>
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

      <div className="mt-4 flex flex-col gap-2 border-t pt-3 border-slate-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-32 h-3 bg-gradient-to-r from-orange-400 via-red-500 to-red-800 rounded" />
            <span className="text-[10px] font-bold text-slate-400 uppercase">Low → Medium → High Severity</span>
          </div>
          <div className="text-[10px] text-slate-400">
            {viewMode === '3d' ? (
              <p>🖱️ Drag to rotate • Scroll to zoom • Right-click to pan</p>
            ) : (
              <p>🖱️ Scroll to navigate slices • Drag to pan</p>
            )}
          </div>
        </div>
        <div className="text-[10px] text-slate-500 italic">
          <p>💡 Slice view shows heatmap directly ON affected brain regions. Use 3D for overview.</p>
        </div>
        {overlayUrl && nvRef.current?.volumes.length === 2 &&
          typeof nvRef.current.volumes[1]?.global_max !== 'number' && (
            <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded text-[10px] text-amber-800">
              <p className="font-bold">⚠️ Overlay dimensions unavailable</p>
              <p className="mt-1">Backend GradCAM overlay file may be corrupted. Using 2D heatmap fallback.</p>
            </div>
          )}
      </div>
    </div>
  );
}
