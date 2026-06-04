import { useState, useEffect, useMemo, useRef } from 'react';
import { Brain, ArrowRight, Loader2, CheckCircle2, Clock, ClipboardList, UploadCloud, ArrowLeft, AlertTriangle } from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Progress } from "../components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { api } from '../api';
import type { BackendResponse } from '../types';

interface ProcessingPageProps {
  onComplete: (data: BackendResponse | null) => void;
  onBack?: () => void;
  patientId: string;
  file?: File;
  isAddingScan?: boolean;
}

export function ProcessingPage({ onComplete, onBack, patientId, file, isAddingScan }: ProcessingPageProps) {
  // If adding scan to existing patient with file, start analyzing immediately
  const [step, setStep] = useState<'form' | 'upload' | 'analyzing'>(
    isAddingScan && file ? 'analyzing' : (patientId === 'NEW' ? 'form' : 'upload')
  );
  const [progress, setProgress] = useState(0);
  const [analysisResult, setAnalysisResult] = useState<BackendResponse | null>(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | undefined>(file);
  const [isDragging, setIsDragging] = useState(false);
  const [fileError, setFileError] = useState('');
  const [patientIdWarning, setPatientIdWarning] = useState('');
  const [isCheckingPatientId, setIsCheckingPatientId] = useState(false);
  const [idCheckStatus, setIdCheckStatus] = useState<'idle' | 'checking' | 'exists' | 'accepted'>('idle');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    PATIENT_ID: patientId === 'NEW' ? "" : patientId,
    SEX: "",
    AGE: "",
    EDUCATION: "",
    CDR: "",
    MMSE: "",
    APGEN1: "",
    APGEN2: ""
  });

  const fieldErrors = useMemo(() => {
    const errs: Record<string, string> = {};
    const age = Number(formData.AGE);
    const edu = Number(formData.EDUCATION);
    const mmse = Number(formData.MMSE);

    if (formData.PATIENT_ID && !/^[a-zA-Z0-9_-]+$/.test(formData.PATIENT_ID)) errs.PATIENT_ID = "Alphanumeric only";
    if (formData.AGE && (age <= 0 || age > 120)) errs.AGE = "Range: 1-120";
    if (formData.EDUCATION && (edu < 0 || edu > 100)) errs.EDUCATION = "Range: 0-100";
    if (formData.MMSE && (mmse < 0 || mmse > 30)) errs.MMSE = "Range: 0-30";
    
    return errs;
  }, [formData]);

  const isFormValid =
    formData.PATIENT_ID.trim() !== "" &&
    formData.SEX !== "" &&
    formData.AGE !== "" &&
    formData.EDUCATION !== "" &&
    formData.CDR !== "" &&
    formData.MMSE !== "" &&
    formData.APGEN1 !== "" &&
    formData.APGEN2 !== "" &&
    Object.keys(fieldErrors).length === 0;

  const getButtonDisabledReason = () => {
    if (isLoading) return 'Processing...';
    if (patientIdWarning) return 'Patient ID already exists';
    if (isCheckingPatientId) return 'Checking Patient ID...';
    if (idCheckStatus !== 'accepted') return 'Click "check id" to verify Patient ID';
    if (formData.PATIENT_ID.trim() === "") return 'Enter Patient ID';
    if (formData.SEX === "") return 'Select Sex';
    if (formData.AGE === "") return 'Enter Age';
    if (formData.CDR === "") return 'Select CDR';
    if (formData.MMSE === "") return 'Enter MMSE';
    if (formData.EDUCATION === "") return 'Enter Education';
    if (formData.APGEN1 === "") return 'Select APOE Genotype 1';
    if (formData.APGEN2 === "") return 'Select APOE Genotype 2';
    if (Object.keys(fieldErrors).length > 0) return 'Fix validation errors';
    return '';
  };

  const checkPatientIdExists = async (id: string) => {
    if (!id.trim() || patientId !== 'NEW') return;

    setIsCheckingPatientId(true);
    setIdCheckStatus('checking');
    setPatientIdWarning('');

    try {
      const response = await api.getPatients();
      const existingPatients = response || [];

      if (existingPatients.includes(id.trim())) {
        setPatientIdWarning(`Patient ID "${id.trim()}" already exists in the registry system.`);
        setIdCheckStatus('exists');
      } else {
        setIdCheckStatus('accepted');
      }
    } catch (err) {
      console.error('Failed to verify patient ID availability matrix:', err);
      setIdCheckStatus('idle');
    } finally {
      setIsCheckingPatientId(false);
    }
  };

  const handleStartAnalysis = async () => {
    const fileToUse = uploadedFile || file;
    if (!fileToUse) return;

    if (patientId === 'NEW' && !isFormValid) return;
    if (patientIdWarning) return;

    setError('');
    setIsLoading(true);
    setStep('analyzing');

    try {
      let result;
      if (patientId === 'NEW') {
        // Use register-and-predict endpoint for new patients
        console.log('Sending data:', formData);
        result = await api.registerAndPredict(formData, fileToUse);
      } else {
        // Use predict endpoint for existing patients
        result = await api.predictPatient(formData.PATIENT_ID.trim(), fileToUse);
      }
      setAnalysisResult(result);
    } catch (e: any) {
      console.error('Analysis error:', e);
      console.error('Error response:', e?.response?.data);
      console.error('Error status:', e?.response?.status);
      const errorMsg = e?.response?.data?.detail || e?.message || 'Analysis operation rejected by remote API context.';
      setError(typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg));
      setStep(patientId === 'NEW' ? 'form' : 'upload');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (step === 'analyzing' && !error) {
      const timer = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 100) { clearInterval(timer); return 100; }
          return prev + 1;
        });
      }, 150);
      return () => clearInterval(timer);
    }
  }, [step, error]);

  // Auto-start analysis when adding scan to existing patient
  useEffect(() => {
    if (isAddingScan && file && step === 'analyzing' && !isLoading && !analysisResult) {
      const runAnalysis = async () => {
        setError('');
        setIsLoading(true);

        try {
          const result = await api.predictPatient(patientId, file);
          setAnalysisResult(result);
        } catch (e) {
          const error = e as Error;
          setError(error.message || 'Analysis operation rejected by remote API context.');
          setStep('upload');
        } finally {
          setIsLoading(false);
        }
      };

      runAnalysis();
    }
  }, [isAddingScan, file, step, patientId, isLoading, analysisResult]);

  const handleFileSelect = (selectedFile: File) => {
    const fileName = selectedFile.name.toLowerCase();
    const isValid = [".nii", ".nii.gz", ".zip"].some(ext => fileName.endsWith(ext));

    if (isValid) {
      setFileError('');
      setUploadedFile(selectedFile);
    } else {
      setFileError('*Invalid format. Please upload NIfTI (.nii, .nii.gz) or .zip files only.');
    }
  };

  if (step === 'upload') {
    return (
      <div className="h-screen bg-[#f8fafc] flex flex-col items-center justify-center p-4">
        <Card className="max-w-2xl w-full border-none shadow-xl bg-white ring-1 ring-slate-100 relative">
          {onBack && (
            <button
              onClick={onBack}
              className="absolute top-6 right-6 h-10 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg shadow-md flex items-center gap-2 transition-all cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
          )}
          <CardContent className="p-10">
            <div className="flex items-center gap-4 mb-8 border-b pb-6">
              <div className="p-3 bg-blue-600 rounded-xl shadow-lg shadow-blue-100"><Brain className="w-6 h-6 text-white" /></div>
              <div>
                <h2 className="text-2xl font-black text-slate-900">Upload MRI Scan</h2>
                <p className="text-sm text-slate-500">Patient ID: <span className="font-bold text-slate-700">{patientId}</span></p>
              </div>
            </div>

            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files?.[0]; if (f) handleFileSelect(f); }}
              className={`w-full py-16 border-2 border-dashed rounded-3xl cursor-pointer transition-all flex flex-col items-center justify-center text-center ${
                isDragging ? "border-blue-500 bg-blue-50" : "border-slate-200 bg-slate-50/50 hover:bg-slate-100"
              }`}
            >
              <UploadCloud className="w-12 h-12 mb-3 text-slate-400 mx-auto" />
              <p className="text-base font-bold text-slate-700">Click or drag to upload</p>
              <p className="text-xs text-slate-400 uppercase tracking-widest mt-1">NIfTI or ZIP (DICOM)</p>
              {uploadedFile && (
                <div 
                  title={uploadedFile.name}
                  className="mt-4 text-sm font-bold text-blue-600 bg-blue-50/50 px-4 py-1.5 rounded-lg border border-blue-100 max-w-[90%] truncate"
                >
              ✓ {uploadedFile.name}
            </div>
          )}
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                accept=".nii,.gz,.zip"
              />
            </div>
            {fileError && <div className="text-red-600 text-xs font-bold mt-4 text-center">{fileError}</div>}
            {error && <div className="text-red-500 bg-red-50 p-3 rounded-xl text-xs font-mono font-bold mt-4 border border-red-100">{error}</div>}

            <Button
              onClick={handleStartAnalysis}
              disabled={!uploadedFile}
              className={`w-full mt-8 h-14 font-bold rounded-xl shadow-lg flex items-center justify-center gap-2 transition-all ${
                !uploadedFile
                ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                : 'bg-blue-600 hover:bg-blue-700 text-white scale-100 active:scale-95'
              }`}
            >
              {isLoading ? '⏳ Analyzing…' : '→ Start Analysis'}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // =========================================================================
  // VIEW SCREEN 2: CLINICAL INPUT MATRIX FORM (NEW REGISTRATION PATH)
  // =========================================================================
  if (step === 'form') {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex flex-col items-center justify-center p-6 md:p-12 animate-in fade-in duration-300">
        <Card className="max-w-2xl w-full border-none shadow-2xl bg-white ring-1 ring-slate-100 my-auto relative">
          {onBack && (
            <button
              onClick={onBack}
              className="absolute top-6 right-6 h-9 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg shadow-sm flex items-center gap-2 transition-all cursor-pointer border border-slate-200"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back
            </button>
          )}
          <CardContent className="p-8 md:p-10">
            <div className="flex items-center gap-4 mb-8 border-b pb-6 border-slate-100">
              <div className="p-3 bg-blue-600 rounded-xl shadow-lg shadow-blue-100">
                <ClipboardList className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-black text-slate-900 tracking-tight">Clinical Metadata</h2>
                <p className="text-sm text-slate-500 font-medium">Verify system parameters prior to neural model classification.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5">
              {/* TARGET ID BLOCK FIELD */}
              <div className="space-y-1.5 sm:col-span-2">
                <div className="flex justify-between items-center px-0.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Assign Patient ID for Endpoint Path *</label>
                  {fieldErrors.PATIENT_ID && <span className="text-[10px] text-red-500 font-bold">* {fieldErrors.PATIENT_ID}</span>}
                </div>
                <input
                  type="text"
                  className={`w-full h-12 bg-slate-50 border rounded-xl px-4 text-sm font-bold uppercase transition-all outline-none focus:bg-white focus:ring-4 ${
                    fieldErrors.PATIENT_ID || patientIdWarning
                    ? 'border-red-300 focus:border-red-500 focus:ring-red-500/10'
                    : 'border-slate-200 focus:border-blue-500 focus:ring-blue-500/10'
                  }`}
                  placeholder="e.g. AAA038"
                  value={formData.PATIENT_ID}
                  onChange={(e) => {
                    setFormData({...formData, PATIENT_ID: e.target.value});
                    // Clear warning and status when user modifies the ID
                    if (patientIdWarning) setPatientIdWarning('');
                    setIdCheckStatus('idle');
                  }}
                />
                {formData.PATIENT_ID.trim() && !fieldErrors.PATIENT_ID && (
                  <button
                    type="button"
                    onClick={() => checkPatientIdExists(formData.PATIENT_ID)}
                    disabled={isCheckingPatientId || idCheckStatus === 'exists' || idCheckStatus === 'accepted'}
                    className={`text-[11px] font-bold px-1 mt-1.5 transition-colors underline ${
                      idCheckStatus === 'idle' ? 'text-blue-600 hover:text-blue-700 cursor-pointer' :
                      idCheckStatus === 'checking' ? 'text-yellow-600 cursor-wait' :
                      idCheckStatus === 'exists' ? 'text-red-600 cursor-not-allowed' :
                      'text-green-600 cursor-not-allowed'
                    }`}
                  >
                    {idCheckStatus === 'idle' ? 'check id' :
                     idCheckStatus === 'checking' ? 'checking' :
                     idCheckStatus === 'exists' ? 'id exists' :
                     'id accepted'}
                  </button>
                )}
              </div>

              {/* DYNAMIC COLLAPSIBLE WARNING ALERT BANNER */}
              {patientIdWarning && (
                <div className="sm:col-span-2 mt-1 mb-2 animate-in slide-in-from-top-2 duration-300">
                  <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl">
                    <div className="flex items-start gap-3">
                      <div className="p-1.5 bg-amber-100 rounded-lg text-amber-700">
                        <AlertTriangle className="w-4 h-4" />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-xs font-black text-amber-900 uppercase tracking-wider mb-0.5">Record Collision Detected</h3>
                        <p className="text-xs text-amber-700 font-medium leading-relaxed">
                          {patientIdWarning} If you would like to run a fresh scan configuration on this identity token, navigate to{' '}
                          <button
                            type="button"
                            onClick={() => onBack && onBack()}
                            className="font-black underline text-amber-900 hover:text-black transition-colors cursor-pointer"
                          >
                            Existing Records
                          </button>
                          {' '}instead.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-0.5">Sex Parameters (1:M, 2:F) *</label>
                <Select onValueChange={(v: string) => setFormData({...formData, SEX: v})} value={formData.SEX}>
                  <SelectTrigger className="h-12 bg-slate-50 border-slate-200 rounded-xl font-bold text-slate-700"><SelectValue placeholder="Select sex" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 - Male</SelectItem>
                    <SelectItem value="2">2 - Female</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between items-center px-0.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Age (in Years) *</label>
                  {fieldErrors.AGE && <span className="text-[10px] text-red-500 font-bold">* {fieldErrors.AGE}</span>}
                </div>
                <input 
                  type="number" 
                  className={`w-full h-12 bg-slate-50 border rounded-xl px-4 text-sm font-bold outline-none focus:bg-white focus:ring-4 transition-all ${fieldErrors.AGE ? 'border-red-300 focus:border-red-500 focus:ring-red-500/10' : 'border-slate-200 focus:border-blue-500 focus:ring-blue-500/10'}`} 
                  placeholder="e.g. 72" 
                  value={formData.AGE} 
                  onChange={(e) => setFormData({...formData, AGE: e.target.value})} 
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-0.5">CDR *</label>
                <Select onValueChange={(v: string) => setFormData({...formData, CDR: v})} value={formData.CDR}>
                  <SelectTrigger className="h-12 bg-slate-50 border-slate-200 rounded-xl font-bold text-slate-700"><SelectValue placeholder="Select CDR" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">0.0</SelectItem>
                    <SelectItem value="0.5">0.5</SelectItem>
                    <SelectItem value="1">1.0</SelectItem>
                    <SelectItem value="2">2.0</SelectItem>
                    <SelectItem value="3">3.0</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between items-center px-0.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">MMSE (0-30) *</label>
                  {fieldErrors.MMSE && <span className="text-[10px] text-red-500 font-bold">* {fieldErrors.MMSE}</span>}
                </div>
                <input 
                  type="number" 
                  className={`w-full h-12 bg-slate-50 border rounded-xl px-4 text-sm font-bold outline-none focus:bg-white focus:ring-4 transition-all ${fieldErrors.MMSE ? 'border-red-300 focus:border-red-500 focus:ring-red-500/10' : 'border-slate-200 focus:border-blue-500 focus:ring-blue-500/10'}`} 
                  placeholder="Evaluation Score Value" 
                  value={formData.MMSE} 
                  onChange={(e) => setFormData({...formData, MMSE: e.target.value})} 
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between items-center px-0.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Education (Years) *</label>
                  {fieldErrors.EDUCATION && <span className="text-[10px] text-red-500 font-bold">* {fieldErrors.EDUCATION}</span>}
                </div>
                <input 
                  type="number" 
                  className={`w-full h-12 bg-slate-50 border rounded-xl px-4 text-sm font-bold outline-none focus:bg-white focus:ring-4 transition-all ${fieldErrors.EDUCATION ? 'border-red-300 focus:border-red-500 focus:ring-red-500/10' : 'border-slate-200 focus:border-blue-500 focus:ring-blue-500/10'}`} 
                  placeholder="Total Active Years" 
                  value={formData.EDUCATION} 
                  onChange={(e) => setFormData({...formData, EDUCATION: e.target.value})} 
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-0.5">APOE genotype 1 *</label>
                <Select onValueChange={(v: string) => setFormData({...formData, APGEN1: v})} value={formData.APGEN1}>
                  <SelectTrigger className="h-12 bg-slate-50 border-slate-200 rounded-xl font-bold text-slate-700"><SelectValue placeholder="Select genotype" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2">ε2</SelectItem>
                    <SelectItem value="3">ε3</SelectItem>
                    <SelectItem value="4">ε4</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-0.5">APOE genotype 2 *</label>
                <Select onValueChange={(v: string) => setFormData({...formData, APGEN2: v})} value={formData.APGEN2}>
                  <SelectTrigger className="h-12 bg-slate-50 border-slate-200 rounded-xl font-bold text-slate-700"><SelectValue placeholder="Select genotype" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2">ε2</SelectItem>
                    <SelectItem value="3">ε3</SelectItem>
                    <SelectItem value="4">ε4</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {error && <div className="text-red-500 bg-red-50 p-3 rounded-xl text-xs font-mono font-bold mt-6 border border-red-100">{error}</div>}

            <div className="relative group">
              <Button
                onClick={handleStartAnalysis}
                disabled={isLoading || !isFormValid || !!patientIdWarning || isCheckingPatientId || idCheckStatus !== 'accepted'}
                className={`w-full mt-10 h-14 font-bold rounded-xl shadow-lg flex items-center justify-center gap-2 transition-all text-sm tracking-wide ${
                  isLoading || !isFormValid || patientIdWarning || isCheckingPatientId || idCheckStatus !== 'accepted'
                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                  : 'bg-blue-600 hover:bg-blue-700 text-white scale-100 active:scale-95'
                }`}
              >
                {isLoading ? '⏳ Connecting Array Parameters…' : '→ Start Analysis Pipeline'}
              </Button>
              {(isLoading || !isFormValid || !!patientIdWarning || isCheckingPatientId || idCheckStatus !== 'accepted') && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-slate-900 text-white text-xs font-bold rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap shadow-lg">
                  {getButtonDisabledReason()}
                  <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-slate-900"></div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // =========================================================================
  // VIEW SCREEN 3: PIPELINE EXECUTION PROGRESS LOADER (REAL-TIME UPDATE STATE)
  // =========================================================================
  return (
    <div className="min-h-screen bg-[#f8fafc] flex flex-col items-center justify-center p-6 md:p-12 animate-in fade-in duration-300">
      <div className="mb-10 text-center">
        <div className="inline-flex p-4 bg-blue-600 rounded-2xl shadow-xl mb-6 shadow-blue-100 animate-bounce">
          <Brain className="w-12 h-12 text-white" />
        </div>
        <h1 className="text-3xl font-black text-slate-900 tracking-tight">AI Analysis in Progress</h1>
        <p className="text-slate-500 mt-2 text-base font-semibold">Running multi-model tensor compute arrays on structural scan elements...</p>
      </div>

      <div className="w-full max-w-2xl">
        <Card className="border-none shadow-2xl bg-white p-8 md:p-10 ring-1 ring-slate-100">
          <CardContent className="p-0 space-y-10">
            {error && <div className="text-red-500 font-mono font-bold bg-red-50 p-3 border border-red-100 rounded-xl text-xs">{error}</div>}
            
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {progress < 100 ? (
                    <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-6 h-6 text-green-500 animate-in zoom-in" />
                  )}
                  <span className="font-bold text-slate-700 text-lg">
                    {progress < 100 ? "Processing volumetric MRI coordinates..." : "Calculations matched successfully"}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-slate-400 font-mono text-xs font-bold bg-slate-50 px-2.5 py-1 rounded-md border border-slate-100">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  <span>Est: 30ms</span>
                </div>
            </div>

            <div className="space-y-4">
              <Progress value={progress} className="h-3.5 bg-slate-100 transition-all duration-300" />
              <div className="flex justify-between items-start px-1 text-[10px] font-black uppercase tracking-widest transition-colors duration-500">
                <span className={progress >= 0 ? 'text-blue-600' : 'text-slate-300'}>Ingestion</span>
                <span className={progress > 35 ? 'text-blue-600' : 'text-slate-300'}>Feature Mapping</span>
                <span className={progress === 100 ? 'text-green-600 animate-pulse' : 'text-slate-300'}>Complete</span>
              </div>
            </div>

            <div className="flex justify-end pt-4 border-t border-slate-100">
              <Button 
                onClick={() => onComplete(analysisResult)} 
                disabled={progress < 100 || !analysisResult} 
                className={`h-14 px-10 text-sm font-bold transition-all shadow-lg flex items-center gap-2 rounded-xl tracking-wide ${ 
                  (progress === 100 && analysisResult) 
                  ? 'bg-blue-600 hover:bg-blue-700 text-white scale-100 hover:scale-105 active:scale-95' 
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                }`}
              >
                View Dashboard Panel <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}