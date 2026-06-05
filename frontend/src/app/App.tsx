import { useState } from 'react';
import { Brain, Download, ArrowLeft, RefreshCw } from 'lucide-react';
import { PatientInfo } from './components/PatientInfo';
import { DiagnosisCard } from './components/DiagnosisCard';
import { MRIHeatmap } from './components/MRIHeatmap';
import { ShapValues } from './components/ShapValues';
import { AlternativeDiagnoses } from './components/AlternativeDiagnoses';
import { IdentificationPage } from './pages/IdentificationPage';
import { ProcessingPage } from './pages/ProcessingPage';
import { api } from './api';

export default function App() {
  const [sessionData, setSessionData] = useState<any | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

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

  const handleAnalysisComplete = (backendResult: any) => {
    setSessionData(backendResult);
    setIsProcessing(false);
  };

  const handleReset = () => {
    setSessionData(null);
    setIsProcessing(false);
  };

  const handleRefresh = async () => {
    if (!sessionData?.patient_id && !sessionData?.id) return;

    setIsRefreshing(true);
    try {
      const patientId = sessionData.patient_id || sessionData.id;
      const data = await api.getPatientRecord(patientId);
      setSessionData(data);
    } catch (error) {
      console.error("Failed to refresh patient data:", error);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleDownloadReport = () => {
    if (!sessionData) return;

    const dataToDisplay = sessionData.prediction || sessionData.last_prediction || sessionData;
    const patientId = extractPrimitive(sessionData, "patient_id") || extractPrimitive(sessionData, "id") || "UNKNOWN";
    const primaryDiag = extractPrimitive(dataToDisplay, "prediction") || extractPrimitive(dataToDisplay, "diagnosis") || "N/A";
    const modelEngineUsed = extractPrimitive(dataToDisplay, "model_used") || "TAB T1w";
    const probabilitiesMap = extractObject(dataToDisplay, "probabilities");
    const rawConfidence = probabilitiesMap && primaryDiag ? (probabilitiesMap[primaryDiag] ?? 0) : 0;
    const confidencePercentage = Math.round(rawConfidence * 100);

    const ageValue = extractPrimitive(dataToDisplay, "age");
    const genderValue = extractPrimitive(dataToDisplay, "sex") || extractPrimitive(dataToDisplay, "gender");
    const educationValue = extractPrimitive(dataToDisplay, "education");
    const cdrValue = extractPrimitive(dataToDisplay, "cdr");
    const mmseValue = extractPrimitive(dataToDisplay, "mmse");
    const apgen1Value = extractPrimitive(dataToDisplay, "apgen1");
    const apgen2Value = extractPrimitive(dataToDisplay, "apgen2");

    const shapObject = extractObject(dataToDisplay, "shap");
    const gradcamObject = extractObject(dataToDisplay, "gradcam");

    // Generate HTML report
    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>NeuroAI Diagnostic Report - ${patientId}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #1e293b; background: #f8fafc; padding: 40px 20px; }
        .container { max-width: 900px; margin: 0 auto; background: white; box-shadow: 0 4px 6px rgba(0,0,0,0.1); border-radius: 12px; padding: 40px; }
        .header { border-bottom: 3px solid #2563eb; padding-bottom: 20px; margin-bottom: 30px; }
        .header h1 { font-size: 28px; color: #2563eb; font-weight: 800; margin-bottom: 5px; }
        .header p { color: #64748b; font-size: 14px; }
        .meta { display: flex; justify-content: space-between; margin-bottom: 30px; padding: 15px; background: #f1f5f9; border-radius: 8px; }
        .meta div { font-size: 13px; }
        .meta strong { color: #334155; display: block; margin-bottom: 3px; font-weight: 700; }
        .section { margin-bottom: 30px; }
        .section h2 { font-size: 18px; font-weight: 700; color: #0f172a; margin-bottom: 15px; border-left: 4px solid #2563eb; padding-left: 12px; }
        .diagnosis-box { background: linear-gradient(135deg, #2563eb 0%, #7c3aed 100%); color: white; padding: 25px; border-radius: 12px; margin-bottom: 20px; }
        .diagnosis-box h3 { font-size: 22px; font-weight: 800; margin-bottom: 8px; }
        .diagnosis-box .confidence { font-size: 36px; font-weight: 900; margin: 10px 0; }
        .diagnosis-box .model { font-size: 12px; opacity: 0.9; margin-top: 10px; }
        .info-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; }
        .info-item { padding: 12px; background: #f8fafc; border-radius: 6px; border: 1px solid #e2e8f0; }
        .info-item label { font-size: 11px; color: #64748b; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px; display: block; margin-bottom: 4px; }
        .info-item value { font-size: 16px; color: #0f172a; font-weight: 700; }
        .prob-list { list-style: none; }
        .prob-item { display: flex; justify-content: space-between; padding: 10px; margin-bottom: 8px; background: #f8fafc; border-radius: 6px; border-left: 3px solid #cbd5e1; }
        .prob-item.highlight { background: #dbeafe; border-left-color: #2563eb; font-weight: 700; }
        .shap-item { display: flex; justify-content: space-between; padding: 8px 12px; margin-bottom: 6px; background: #f1f5f9; border-radius: 6px; font-size: 13px; }
        .shap-item strong { color: #334155; }
        .shap-item .shap-value { font-family: monospace; color: ${shapObject?.features?.[0]?.shap > 0 ? '#16a34a' : '#dc2626'}; font-weight: 700; }
        .footer { margin-top: 40px; padding-top: 20px; border-top: 2px solid #e2e8f0; font-size: 12px; color: #64748b; text-align: center; }
        @media print { body { background: white; padding: 0; } .container { box-shadow: none; } }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🧠 NeuroAI Diagnostics Report</h1>
            <p>AI-Powered Dementia Differential Diagnosis System</p>
        </div>

        <div class="meta">
            <div><strong>Patient ID:</strong> ${patientId}</div>
            <div><strong>Report Generated:</strong> ${new Date().toLocaleString()}</div>
            <div><strong>Model:</strong> ${modelEngineUsed}</div>
        </div>

        <!-- 1. Patient Information -->
        <div class="section">
            <h2>Patient Information</h2>
            <div class="info-grid">
                <div class="info-item"><label>Age</label><value>${ageValue || 'N/A'} years</value></div>
                <div class="info-item"><label>Sex</label><value>${genderValue || 'N/A'}</value></div>
                <div class="info-item"><label>Education</label><value>${educationValue || 'N/A'} years</value></div>
                <div class="info-item"><label>CDR Score</label><value>${cdrValue ?? 'N/A'}</value></div>
                <div class="info-item"><label>MMSE Score</label><value>${mmseValue || 'N/A'}</value></div>
                <div class="info-item"><label>APOE</label><value>ε${apgen1Value || '?'}/ε${apgen2Value || '?'}</value></div>
            </div>
        </div>

        <!-- 2. Primary Diagnosis -->
        <div class="section">
            <h2>Primary Diagnosis</h2>
            <div class="diagnosis-box">
                <h3>${primaryDiag}</h3>
                <div class="confidence">${confidencePercentage}% Confidence</div>
                <div class="model">Model: ${modelEngineUsed}</div>
            </div>
        </div>

        <!-- 3. Diagnostic Explainability -->
        <div class="section">
            <h2>Diagnostic Explainability</h2>
            <div style="padding: 20px; background: linear-gradient(135deg, #2563eb 0%, #7c3aed 100%); border-radius: 12px; color: white;">
                <h3 style="font-size: 16px; font-weight: 700; margin-bottom: 8px;">Machine Learning Interpretation</h3>
                <p style="font-size: 13px; line-height: 1.6; opacity: 0.95;">
                    This section interprets the machine learning pipeline's weights. It renders spatial tissue structural metrics through Grad-CAM visual overlays along with SHAP clinical contribution indices. The model analyzes MRI scan features combined with clinical parameters to provide a comprehensive diagnostic assessment.
                </p>
            </div>
        </div>

        <!-- 4. MRI T1w with Attention Heatmap -->
        <div class="section">
            <h2>MRI T1w with Attention Heatmap</h2>
            ${gradcamObject?.heatmap_png ? `
                <div style="text-align: center; padding: 20px; background: #0f172a; border-radius: 12px;">
                    <img src="${gradcamObject.heatmap_png}" alt="MRI Grad-CAM Heatmap" style="max-width: 100%; height: auto; border-radius: 8px;" />
                    <p style="margin-top: 12px; font-size: 11px; color: #94a3b8;">Grad-CAM++ Attention Heatmap - Brain regions contributing to the diagnosis</p>
                </div>
            ` : `
                <div style="padding: 30px; text-align: center; background: #f1f5f9; border-radius: 12px; color: #64748b;">
                    <p style="font-size: 13px; font-weight: 600;">MRI heatmap visualization not available</p>
                </div>
            `}
        </div>

        <!-- 5. Differential Diagnoses -->
        <div class="section">
            <h2>Differential Diagnoses</h2>
            <ul class="prob-list">
                ${probabilitiesMap ? Object.entries(probabilitiesMap)
                  .sort((a, b) => (b[1] as number) - (a[1] as number))
                  .map(([diag, prob]) => `
                    <li class="prob-item ${diag === primaryDiag ? 'highlight' : ''}">
                        <span>${diag}</span>
                        <span>${Math.round((prob as number) * 100)}%</span>
                    </li>
                  `).join('') : '<li class="prob-item">No data available</li>'}
            </ul>
        </div>

        <!-- 6. SHAP Values -->
        ${shapObject?.features ? `
        <div class="section">
            <h2>SHAP Values</h2>
            <p style="font-size: 13px; color: #64748b; margin-bottom: 15px;">SHAP (SHapley Additive exPlanations) values indicate the contribution of each clinical feature to the model's prediction.</p>
            ${shapObject.features.map((f: any) => `
                <div class="shap-item">
                    <strong>${f.feature}</strong>
                    <span>Value: ${f.value} | <span class="shap-value">SHAP: ${f.shap.toFixed(4)}</span></span>
                </div>
            `).join('')}
            ${shapObject.chart_path ? `
                <div style="margin-top: 20px; text-align: center; padding: 15px; background: #f8fafc; border-radius: 8px;">
                    <img src="${shapObject.chart_path}" alt="SHAP Values Chart" style="max-width: 100%; height: auto; border-radius: 6px;" />
                </div>
            ` : ''}
        </div>
        ` : ''}

        <!-- 7. Clinical Protocol Considerations -->
        <div class="section">
            <h2>Clinical Protocol Considerations</h2>
            <div style="padding: 20px; background: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 8px;">
                <p style="font-size: 13px; color: #92400e; line-height: 1.7; font-weight: 500;">
                    Platform outputs trace directly to diagnostic support algorithms utilizing cloud resources. These indicators represent mathematical inferences and do not supersede qualified professional medical evaluations. All clinical decisions must be made by licensed healthcare professionals in consultation with comprehensive patient history, physical examination, and additional diagnostic testing as appropriate.
                </p>
            </div>
        </div>

        <div class="footer">
            <p><strong>⚠️ Medical Disclaimer:</strong> This AI-generated report is for diagnostic support only and does not replace professional medical evaluation. All clinical decisions should be made by qualified healthcare professionals.</p>
            <p style="margin-top: 10px;">Generated by NeuroAI Diagnostics Platform | © ${new Date().getFullYear()}</p>
        </div>
    </div>
</body>
</html>`;

    // Download as HTML
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `NeuroAI_Report_${patientId}_${new Date().toISOString().split('T')[0]}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleAddScan = (id: string, file: File) => {
    // For existing patient with new scan - go directly to processing/analyzing
    setSessionData({ id, file, isAddingScan: true });
    setIsProcessing(true);
  };

  const handleRunNewScan = (id: string) => {
    // For existing patient - go to upload page without checking for existing predictions
    setSessionData({ id });
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

  const gradcamObject = extractObject(dataToDisplay, "gradcam");
  const shapObject = extractObject(dataToDisplay, "shap");

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-10">
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
                onClick={handleReset}
                className="flex items-center gap-2 px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-800 transition-all font-bold text-sm shadow-md"
              >
                <ArrowLeft className="w-4 h-4" /> View Another
              </button>
              <button
                onClick={handleDownloadReport}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all font-bold text-sm shadow-md"
              >
                <Download className="w-4 h-4" /> Download Report
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-in fade-in duration-700">
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
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

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <MRIHeatmap imageUrl={gradcamObject?.heatmap_png} />
          <AlternativeDiagnoses probabilities={probabilitiesMap} />
        </div>

        <div className="mb-6">
          <ShapValues shap={shapObject || sessionData?.shap} />
        </div>

        <footer className="bg-amber-50 border border-amber-200 rounded-xl p-6 mb-8">
          <div className="flex items-start gap-4">
            <div className="p-2 bg-amber-100 rounded-lg">
              <Brain className="w-6 h-6 text-amber-600" />
            </div>
            <div className="flex-1">
              <h3 className="font-black text-amber-900 mb-1 uppercase text-xs tracking-widest">Clinical Protocol Considerations</h3>
              <p className="text-sm text-amber-800 font-medium leading-relaxed">
                Platform outputs trace directly to diagnostic support algorithms utilizing cloud resources. These indicators represent mathematical inferences and do not supersede qualified professional medical evaluations.
              </p>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}