import { useState, useEffect } from 'react';
import { Brain, Download, ArrowLeft, RefreshCw } from 'lucide-react';
import { PatientInfo } from './components/PatientInfo';
import { DiagnosisCard } from './components/DiagnosisCard';
import { MRIViewer3D } from './components/MRIViewer3D';
import { ShapValues } from './components/ShapValues';
import { AlternativeDiagnoses } from './components/AlternativeDiagnoses';
import { IdentificationPage } from './pages/IdentificationPage';
import { ProcessingPage } from './pages/ProcessingPage';
import { api } from './api';

export default function App() {
  const [sessionData, setSessionData] = useState<any | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showRefreshSuccess, setShowRefreshSuccess] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [imagesLoaded, setImagesLoaded] = useState({ heatmap: false, shap: false, mri3d: false });
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  // Suppress harmless Niivue resize errors
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      // Suppress known harmless Niivue canvas errors
      if (event.message?.includes("Cannot use 'in' operator to search for 'width'") ||
          event.message?.includes('resizeListener')) {
        event.preventDefault();
        console.log('[App] Suppressed harmless Niivue resize error');
        return true;
      }
    };

    window.addEventListener('error', handleError);
    return () => {
      window.removeEventListener('error', handleError);
    };
  }, []);

  // Check if images exist and mark as loaded if they don't (must be before early returns)
  useEffect(() => {
    if (!sessionData) return;

    // Extract objects to check
    const dataToDisplay = sessionData.prediction || sessionData.last_prediction || sessionData;
    const shapObject = extractObject(dataToDisplay, "shap");
    const gradcamObject = extractObject(dataToDisplay, "gradcam");

    // Mark as loaded if images don't exist
    if (!gradcamObject?.heatmap_png) {
      setImagesLoaded(prev => ({ ...prev, heatmap: true }));
    }
    if (!shapObject?.chart_path) {
      setImagesLoaded(prev => ({ ...prev, shap: true }));
    }
    if (!gradcamObject?.mri_nifti_url) {
      setImagesLoaded(prev => ({ ...prev, mri3d: true }));
    }
  }, [sessionData, refreshKey]);

  function extractObject(obj: any, targetKey: string): any {
    if (!obj || typeof obj !== 'object') return undefined;
    if (Array.isArray(obj)) {
      for (const item of obj) {
        const res = extractObject(item, targetKey);
        if (res) return res;
      }
      return undefined;
    }
    for (const key of Object.keys(obj)) {
      if (key.toLowerCase() === targetKey.toLowerCase() && typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
        return obj[key];
      }
    }
    for (const key of Object.keys(obj)) {
      if (typeof obj[key] === 'object' && obj[key] !== null) {
        const res = extractObject(obj[key], targetKey);
        if (res) return res;
      }
    }
    return undefined;
  }

  const handleProceed = async (id: string, file?: File) => {
    if (file) {
      // New patient with file - go to processing to enter clinical data
      setSessionData({ id, file });
      setIsProcessing(true);
    } else {
      // Existing patient - fetch their record (includes prediction if available)
      try {
        const data = await api.getPatientRecord(id);

        // Check if patient has stored prediction results
        if (data.prediction || data.last_prediction) {
          // Has existing results - show dashboard directly
          // Note: Presigned URLs may be stale; user can refresh using the refresh button
          setSessionData(data);
          setIsProcessing(false);
        } else {
          // No results yet - need to upload MRI and run prediction
          setSessionData({ id });
          setIsProcessing(true);
        }
      } catch (error) {
        console.error("Failed to fetch patient record:", error);
      }
    }
  };

  const handleAnalysisComplete = async (backendResult: any) => {
    // Strategy: Get the most recently registered patient from the list, then fetch their full record
    // This avoids race conditions where the patient record might not be immediately available

    // Helper function to wait
    const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    try {
      let patientId = backendResult?.patient_id;
      let retries = 3;

      // If backend provided patient_id, try to fetch directly
      if (patientId) {
        console.log('Backend returned patient ID:', patientId);

        // Retry fetching patient record (in case it's not immediately available)
        while (retries > 0) {
          try {
            const fullRecord = await api.getPatientRecord(patientId);
            setSessionData(fullRecord);
            console.log('✅ Full patient record loaded successfully');
            setIsProcessing(false);
            return;
          } catch (error) {
            console.warn(`Attempt ${4 - retries}/3: Patient record not ready yet, retrying...`);
            retries--;
            if (retries > 0) {
              await wait(1000); // Wait 1 second before retry
            }
          }
        }
      }

      // Fallback: Get most recent patient from list
      console.log('Fetching most recent patient from list...');
      const patientList = await api.getPatients();

      if (patientList && patientList.length > 0) {
        const mostRecentPatientId = patientList[patientList.length - 1];
        console.log('Most recent patient ID from list:', mostRecentPatientId);

        const fullRecord = await api.getPatientRecord(mostRecentPatientId);
        setSessionData(fullRecord);
        console.log('✅ Full patient record loaded from most recent patient');
      } else {
        // Last resort: use backend result directly
        console.warn('⚠️ No patients in list, using backend result directly');
        setSessionData(backendResult);
      }
    } catch (error) {
      console.error("❌ Failed to fetch patient record:", error);
      // Last resort fallback: use backend result directly
      setSessionData(backendResult);
    }

    setIsProcessing(false);
  };

  const handleReset = () => {
    setSessionData(null);
    setIsProcessing(false);
    setImagesLoaded({ heatmap: false, shap: false, mri3d: false });
  };

  const handleRefresh = async () => {
    if (!sessionData?.patient_id && !sessionData?.id) return;

    setIsRefreshing(true);
    setShowRefreshSuccess(false);

    try {
      const patientId = sessionData.patient_id || sessionData.id;
      const data = await api.getPatientRecord(patientId);

      // Force cache bust by incrementing refresh key
      setRefreshKey(prev => prev + 1);
      setSessionData(data);
      setImagesLoaded({ heatmap: false, shap: false, mri3d: false });

      // Show success toast briefly
      setShowRefreshSuccess(true);
      setTimeout(() => setShowRefreshSuccess(false), 2000);
    } catch (error) {
      console.error("Failed to refresh patient data:", error);
      alert("Failed to refresh patient data. Please try again.");
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleDownloadReport = async () => {
    if (!sessionData) return;

    // SHAP chart is the only async image actually shown inside the captured
    // sections below — MRI is intentionally excluded from the report, so we
    // no longer need to wait on imagesLoaded.heatmap / imagesLoaded.mri3d.
    if (!imagesLoaded.shap) {
      return; // Button should be disabled, but extra safety check
    }

    setIsGeneratingPdf(true);

    try {
      console.log('[PDF] Starting PDF generation...');
      const { jsPDF } = await import('jspdf');
      // html2canvas-pro (not html2canvas) — needed to support modern CSS
      // color functions like oklch() used by Tailwind v4's color palette.
      const html2canvas = (await import('html2canvas-pro')).default;
      console.log('[PDF] Libraries loaded');

      const dataToDisplay = sessionData.prediction || sessionData.last_prediction || sessionData;
      const patientId = extractPrimitive(sessionData, "patient_id") || extractPrimitive(sessionData, "id") || "UNKNOWN";

      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
        compress: true,
      });

      const pageWidth = 210; // A4 width in mm
      const pageHeight = 297; // A4 height in mm
      const margin = 10;
      const contentWidth = pageWidth - margin * 2;
      let yPos = margin;

      // PDF-only header banner — the live dashboard header has interactive
      // buttons (Refresh/Download/Back) that don't belong in a static report.
      pdf.setFillColor(37, 99, 235); // blue-600
      pdf.rect(0, 0, pageWidth, 20, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(16);
      pdf.setFont('helvetica', 'bold');
      pdf.text('NeuroAI Diagnostics Report', margin, 10);
      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`Patient ID: ${patientId}  |  Generated: ${new Date().toLocaleString()}`, margin, 16);
      yPos = 26;

      // Captures a real dashboard section by id and drops it into the PDF as
      // an image — guarantees the report visually matches the dashboard
      // exactly (same colors, fonts, spacing, cards) since it's a literal
      // screenshot of that DOM node, rather than hand-redrawn primitives.
      const addSection = async (selector: string) => {
        const element = document.querySelector(selector) as HTMLElement | null;
        if (!element) {
          console.warn(`[PDF] Section not found: ${selector}`);
          return;
        }

        const canvas = await html2canvas(element, {
          scale: 2,
          useCORS: true,
          logging: false,
          backgroundColor: '#f8fafc',
        });

        const imgData = canvas.toDataURL('image/png', 0.95);
        let drawWidth = contentWidth;
        let drawHeight = (canvas.height * drawWidth) / canvas.width;

        // Start a fresh page if this section won't fit on the current one
        if (yPos + drawHeight > pageHeight - margin && yPos > margin) {
          pdf.addPage();
          yPos = margin;
        }

        // If a single section is still taller than a full page, scale it
        // down to fit rather than letting it overflow.
        const maxHeight = pageHeight - margin * 2;
        if (drawHeight > maxHeight) {
          const scaleFactor = maxHeight / drawHeight;
          drawHeight *= scaleFactor;
          drawWidth *= scaleFactor;
        }

        const xPos = margin + (contentWidth - drawWidth) / 2;
        pdf.addImage(imgData, 'PNG', xPos, yPos, drawWidth, drawHeight, undefined, 'FAST');
        yPos += drawHeight + 6;
      };

      // Mirrors the dashboard layout exactly, minus the MRI viewer section.
      console.log('[PDF] Capturing Patient Info + Diagnosis...');
      await addSection('#pdf-section-overview');

      console.log('[PDF] Capturing Differential Diagnoses...');
      await addSection('#pdf-section-altdx');

      console.log('[PDF] Capturing SHAP Values...');
      await addSection('#pdf-section-shap');

      // Footer note on the last page
      pdf.setFontSize(8);
      pdf.setTextColor(100, 116, 139);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`Generated by NeuroAI Diagnostics Platform | © ${new Date().getFullYear()}`, margin, pageHeight - 6);

      console.log('[PDF] Saving PDF...');
      const filename = `NeuroAI_Report_${patientId}_${new Date().toISOString().split('T')[0]}.pdf`;
      pdf.save(filename);
      console.log('[PDF] PDF saved successfully:', filename);
    } catch (error) {
      console.error('Failed to generate PDF:', error);
      console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
      alert(`Failed to generate PDF report. Error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleAddScan = (id: string, file: File) => {
    // Backend looks up this patient's stored tabular data itself via /patient/{id}/predict
    setSessionData({ id, file, isAddingScan: true });
    setIsProcessing(true);
  };

  const handleRunNewScan = (id: string) => {
    setSessionData({ id, patient_id: id });
    setIsProcessing(true);
  };

  if (!sessionData) {
    return <IdentificationPage onProceed={handleProceed} onAddScan={handleAddScan} onRunNewScan={handleRunNewScan} />;
  }

  if (isProcessing) {
    return (
      <ProcessingPage
        patientId={sessionData.id}
        file={sessionData.file}
        isAddingScan={sessionData.isAddingScan}
        onComplete={handleAnalysisComplete}
        onBack={handleReset}
      />
    );
  }

  // =========================================================================
  // 🔍 RECURSIVE DEEP-SCANNING ENGINE (IMMUNE TO BACKEND WRAPPING VARIATIONS)
  // =========================================================================
  function extractPrimitive(obj: any, targetKey: string): any {
    if (!obj) return undefined;
    
    // Handle array wrapping seamlessly if endpoint returns a list of history records
    if (Array.isArray(obj)) {
      for (const item of obj) {
        const res = extractPrimitive(item, targetKey);
        if (res !== undefined) return res;
      }
      return undefined;
    }
    
    if (typeof obj !== 'object') return undefined;
    
    // 1. Case-insensitive lookup at the current depth level[cite: 1]
    for (const key of Object.keys(obj)) {
      if (key.toLowerCase() === targetKey.toLowerCase()) {
        if (typeof obj[key] !== 'object' || obj[key] === null) {
          return obj[key];
        }
      }
    }
    
    // 2. Recurse deeper down the JSON tree object branches
    for (const key of Object.keys(obj)) {
      if (typeof obj[key] === 'object' && obj[key] !== null) {
        const res = extractPrimitive(obj[key], targetKey);
        if (res !== undefined) return res;
      }
    }
    return undefined;
  }

  // Handle prediction wrapper from GET /patient/{id} endpoint
  const dataToDisplay = sessionData.prediction || sessionData.last_prediction || sessionData;

  // Extract Patient ID parameters safely
  const patientId = extractPrimitive(sessionData, "patient_id") || extractPrimitive(sessionData, "id") || "N/A";

  // Extract Clinical Metadata Variables - check patient_info first, then fall back to flat structure
  const patientInfoObj = extractObject(dataToDisplay, "patient_info");
  const ageValue = patientInfoObj?.age ?? extractPrimitive(dataToDisplay, "age");
  const genderValue = patientInfoObj?.sex ?? (extractPrimitive(dataToDisplay, "sex") || extractPrimitive(dataToDisplay, "gender"));
  const educationValue = patientInfoObj?.education ?? extractPrimitive(dataToDisplay, "education");
  const cdrValue = patientInfoObj?.cdr ?? extractPrimitive(dataToDisplay, "cdr");
  const mmseValue = patientInfoObj?.mmse ?? extractPrimitive(dataToDisplay, "mmse");
  const apgen1Value = patientInfoObj?.apgen1 ?? extractPrimitive(dataToDisplay, "apgen1");
  const apgen2Value = patientInfoObj?.apgen2 ?? extractPrimitive(dataToDisplay, "apgen2");

  // Extract Machine Learning Architecture Elements cleanly
  const primaryDiag = extractPrimitive(dataToDisplay, "prediction") || extractPrimitive(dataToDisplay, "diagnosis") || "";
  const modelEngineUsed = extractPrimitive(dataToDisplay, "model_used") || extractPrimitive(dataToDisplay, "model used") || "TAB T1w";

  const probabilitiesMap = extractObject(dataToDisplay, "probabilities");
  const rawConfidence = probabilitiesMap && primaryDiag ? (probabilitiesMap[primaryDiag] ?? 0) : 0;
  const confidencePercentage = Math.round(rawConfidence * 100);

  // Extract gradcam and shap objects
  let gradcamObject = extractObject(dataToDisplay, "gradcam");
  let shapObject = extractObject(dataToDisplay, "shap");

  // NEW: Use direct file streaming endpoint (no presigned URLs!)
  // Backend now serves files directly at: /patient/{patient_id}/file/{filename}
  const BASE_URL = import.meta.env.DEV ? '/api' : 'http://35.159.51.22:8000';

  let directHeatmapUrl: string | undefined;
  let directShapUrl: string | undefined;
  let directMriNiftiUrl: string | undefined;
  let directOverlayNiftiUrl: string | undefined;

  if (patientId && patientId !== "N/A") {
    // Add cache-busting timestamp to force browser to reload images
    const cacheBust = `?t=${refreshKey}`;
    directHeatmapUrl = `${BASE_URL}/patient/${patientId}/file/${patientId}_heatmap.png${cacheBust}`;
    directShapUrl = `${BASE_URL}/patient/${patientId}/file/${patientId}_shap.png${cacheBust}`;
    // Different patients have different scan types
    // Try FLAIR first (common for lesion detection), then T1w (common anatomical)
    // Skip preprocessed - some are corrupted/too small
    directMriNiftiUrl = `${BASE_URL}/patient/${patientId}/file/${patientId}_flair.nii.gz${cacheBust}`;
    // Backend saves gradcam with original_stem prefix (usually "scan")
    directOverlayNiftiUrl = `${BASE_URL}/patient/${patientId}/file/${patientId}_gradcam.nii.gz${cacheBust}`;
  }

  // Use direct streaming URLs (bypasses presigned URL expiration issues)
  if (directHeatmapUrl) {
    gradcamObject = { ...gradcamObject, heatmap_png: directHeatmapUrl };
  }
  if (directShapUrl) {
    shapObject = { ...shapObject, chart_path: directShapUrl };
  }
  if (directMriNiftiUrl) {
    gradcamObject = { ...gradcamObject, mri_nifti_url: directMriNiftiUrl };
  }
  if (directOverlayNiftiUrl) {
    gradcamObject = { ...gradcamObject, overlay_nifti_url: directOverlayNiftiUrl };
  }

  // Debug: Log all gradcam URLs
  console.log('[Dashboard] ========================================');
  console.log('[Dashboard] Patient ID:', patientId);
  console.log('[Dashboard] MRI URL:', gradcamObject?.mri_nifti_url);
  console.log('[Dashboard] Overlay URL:', gradcamObject?.overlay_nifti_url);
  console.log('[Dashboard] Heatmap PNG:', gradcamObject?.heatmap_png);
  console.log('[Dashboard] Direct Overlay URL constructed:', directOverlayNiftiUrl);
  console.log('[Dashboard] ========================================');

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Refresh Success Toast - subtle notification only */}
      {showRefreshSuccess && (
        <div className="fixed top-24 right-6 z-50 bg-green-600 text-white px-6 py-3 rounded-lg shadow-xl animate-in slide-in-from-top duration-300 flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span className="font-semibold">Data refreshed successfully!</span>
        </div>
      )}

      <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button 
                onClick={handleReset}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors mr-1"
              >
                <ArrowLeft className="w-5 h-5 text-gray-500" />
              </button>
              <div className="p-2 bg-blue-600 rounded-lg">
                <Brain className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 tracking-tight">NeuroAI Diagnostics</h1>
                <p className="text-sm text-gray-500 font-medium">AI-Powered Dementia Diagnostic System</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-all font-bold text-sm shadow-md disabled:opacity-70 disabled:cursor-not-allowed"
                title="Refresh patient data and reload images"
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                Refresh Data
              </button>
              <button
                onClick={handleReset}
                className="flex items-center gap-2 px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-800 transition-all font-bold text-sm shadow-md"
              >
                <ArrowLeft className="w-4 h-4" /> View Another
              </button>
              <div className="relative group">
                <button
                  onClick={handleDownloadReport}
                  disabled={!imagesLoaded.shap || isGeneratingPdf}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all font-bold text-sm shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Download className={`w-4 h-4 ${isGeneratingPdf ? 'animate-bounce' : ''}`} />
                  {isGeneratingPdf ? 'Generating PDF...' : 'Download Report'}
                </button>
                {!imagesLoaded.shap && (
                  <div className="absolute top-full mt-3 right-0 hidden group-hover:block w-56 bg-gray-900 text-white text-xs rounded-lg py-3 px-4 shadow-2xl z-[100]">
                    <div className="mb-1">• SHAP chart is still loading...</div>
                    <div className="mt-2 text-gray-400 border-t border-gray-700 pt-2">Wait until all content is loaded.</div>
                    {/* Arrow pointer pointing up */}
                    <div className="absolute bottom-full right-4 mb-0">
                      <div className="w-0 h-0 border-l-8 border-r-8 border-b-8 border-transparent border-b-gray-900"></div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      <main
        key={refreshKey}
        className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-in fade-in duration-500"
      >

        <div id="pdf-section-overview" className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <div className="lg:col-span-1">
            <PatientInfo
              id={patientId} 
              age={ageValue} 
              gender={genderValue}
              education={educationValue}
              cdr={cdrValue}
              mmse={mmseValue}
              apgen1={apgen1Value}
              apgen2={apgen2Value}
            />
          </div>

          <div className="lg:col-span-2 flex flex-col gap-6">
            <DiagnosisCard 
              diagnosis={primaryDiag} 
              confidence={confidencePercentage} 
              severity={confidencePercentage > 85 ? "high" : "medium"}
              description={`Processed via execution pipeline model context: ${modelEngineUsed}. Structural classification map derived from neural network vectors.`}
            />

            <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl p-6 text-white shadow-lg shadow-blue-100 flex-1 flex flex-col justify-center">
              <h2 className="text-xl font-black mb-1">Diagnostic Explainability</h2>
              <p className="text-blue-55 text-xs font-medium max-w-2xl">
                This section interprets the machine learning pipeline's weights. It renders spatial tissue structural metrics through Grad-CAM visual overlays along with SHAP clinical contribution indices.
              </p>
            </div>
          </div>
        </div>

        {/* Hidden image preload for heatmap (used in PDF) */}
        {gradcamObject?.heatmap_png && (
          <img
            src={gradcamObject.heatmap_png}
            alt="Heatmap preload"
            className="hidden"
            onLoad={() => setImagesLoaded(prev => ({ ...prev, heatmap: true }))}
            onError={() => setImagesLoaded(prev => ({ ...prev, heatmap: true }))}
          />
        )}

        <div className="flex flex-col gap-6 mb-6">
          <div className="w-full">
            <MRIViewer3D
              mriUrl={gradcamObject?.mri_nifti_url}
              overlayUrl={gradcamObject?.overlay_nifti_url}
              title="3D Brain with Grad-CAM"
              onRefreshRequest={handleRefresh}
              onLoadComplete={() => setImagesLoaded(prev => ({ ...prev, mri3d: true }))}
            />
          </div>
          <div id="pdf-section-altdx">
            <AlternativeDiagnoses probabilities={probabilitiesMap} />
          </div>
        </div>

        <div id="pdf-section-shap" className="mb-6">
          <ShapValues
            shap={shapObject || sessionData?.shap}
            onImageLoad={() => setImagesLoaded(prev => ({ ...prev, shap: true }))}
          />
        </div>
      </main>
    </div>
  );
}