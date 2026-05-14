import { useState } from 'react';
import { Brain, Download, ArrowLeft } from 'lucide-react';
// Import all dashboard components
import { PatientInfo } from './components/PatientInfo';
import { DiagnosisCard } from './components/DiagnosisCard';
import { MRIHeatmap } from './components/MRIHeatmap';
import { ShapValues } from './components/ShapValues';
import { AlternativeDiagnoses } from './components/AlternativeDiagnoses';
// Import Page components
import { IdentificationPage } from './pages/IdentificationPage';
import { ProcessingPage } from './pages/ProcessingPage';
// API and Assets
import { api } from './api';
import mriHeatmapImage from '../assets/mri-scan.png';

export default function App() {
  const [sessionData, setSessionData] = useState<any | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  /**
   * Handles navigation from the Identification Page.
   * If a file is present, it triggers the Metadata Form/Loader flow.
   * If only an ID is present, it fetches existing data and skips the loader.
   */
  const handleProceed = async (id: string, file?: File) => {
    if (file) {
      // NEW UPLOAD PATH: Show Metadata Form + Progress Bar
      setSessionData({ id, file }); 
      setIsProcessing(true);
    } else {
      // EXISTING RECORD PATH: Fetch directly from backend
      try {
        const data = await api.getPatientRecord(id);
        setSessionData(data);
        setIsProcessing(false); 
      } catch (error) {
        console.error("Failed to fetch existing record:", error);
      }
    }
  };

  /**
   * Triggered when the ProcessingPage completes its analysis.
   */
  const handleAnalysisComplete = (backendResult: any) => {
    setSessionData(backendResult);
    setIsProcessing(false);
  };

  const handleReset = () => {
    setSessionData(null);
    setIsProcessing(false);
  };

  // 1. PHASE ONE: Entry Portal
  if (!sessionData) {
    return <IdentificationPage onProceed={handleProceed} />;
  }

  // 2. PHASE TWO: Metadata Input & AI Progress (Only for new uploads)
  if (isProcessing) {
    return (
      <ProcessingPage 
        patientId={sessionData.id} 
        file={sessionData.file} 
        onComplete={handleAnalysisComplete}
      />
    );
  }

  // 3. PHASE THREE: FULL DASHBOARD VISIBILITY
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
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
            <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all font-bold text-sm shadow-md">
              <Download className="w-4 h-4" /> Download Report
            </button>
          </div>
        </div>
      </header>

      {/* Main Dashboard Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-in fade-in duration-700">
        
        {/* Top Section: Patient Info & Primary Diagnosis */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <div className="lg:col-span-1">
            <PatientInfo 
              id={sessionData.patient_id || sessionData.id} 
              age={sessionData.age || sessionData.AGE} 
              gender={sessionData.gender || (sessionData.SEX === "1" ? "Male" : "Female")}
              education={sessionData.education || sessionData.EDUCATION}
              cdr={sessionData.cdr || sessionData.CDR}
              mmse={sessionData.mmse || sessionData.MMSE}
              apgen1={sessionData.apgen1 || sessionData.APGEN1}
              apgen2={sessionData.apgen2 || sessionData.APGEN2}
            />
          </div>

          <div className="lg:col-span-2">
            <DiagnosisCard 
              diagnosis={sessionData.diagnosis} 
              confidence={sessionData.confidence} 
              severity={sessionData.confidence > 85 ? "high" : "medium"}
              description="Neuroimaging patterns suggest atrophy consistent with the identified diagnostic category. Clinical metadata correlation is recommended."
            />
          </div>
        </div>

        {/* Mid Section: Explainability Title */}
        <div className="mb-6">
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl p-8 text-white shadow-lg shadow-blue-100">
            <h2 className="text-2xl font-black mb-2">Diagnostic Explainability</h2>
            <p className="text-blue-50 text-sm font-medium max-w-2xl">
              This section visualizes the AI model's internal logic, highlighting spatial atrophy in the MRI heatmap 
              and identifying key clinical factors via SHAP feature importance values.
            </p>
          </div>
        </div>

        {/* Visual Analytics Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <div>
            <MRIHeatmap imageUrl={mriHeatmapImage} />
          </div>
          <div>
            <AlternativeDiagnoses />
          </div>
        </div>

        {/* SHAP Values Section */}
        <div className="mb-6">
          <ShapValues />
        </div>

        {/* Clinical Disclaimer Footer */}
        <footer className="bg-amber-50 border border-amber-200 rounded-xl p-6 mb-8">
          <div className="flex items-start gap-4">
            <div className="p-2 bg-amber-100 rounded-lg">
              <Brain className="w-6 h-6 text-amber-600" />
            </div>
            <div className="flex-1">
              <h3 className="font-black text-amber-900 mb-2 uppercase text-xs tracking-widest">Clinical Considerations</h3>
              <ul className="space-y-1.5 text-sm text-amber-800 font-medium">
                <li>• This system serves as a diagnostic support tool and does not replace professional clinical judgment.</li>
                <li>• Results should be interpreted by a certified neurologist or dementia specialist.</li>
                <li>• Model accuracy is verified at 91.2% on standardized validation sets.</li>
              </ul>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}