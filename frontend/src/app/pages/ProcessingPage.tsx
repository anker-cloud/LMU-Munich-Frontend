// // import React, { useState, useEffect } from 'react';
// // import { Brain, ArrowRight, Loader2, CheckCircle2, Clock } from 'lucide-react';
// // import { Card, CardContent } from '../components/ui/card';
// // import { Button } from '../components/ui/button';
// // import { Progress } from "../components/ui/progress";
// // import { api } from '../api'; 

// // interface ProcessingPageProps {
// //   onComplete: (data: any) => void;
// //   patientId: string;
// //   file?: File;
// // }

// // export function ProcessingPage({ onComplete, patientId, file }: ProcessingPageProps) {
// //   const [progress, setProgress] = useState(0);
// //   const [error, setError] = useState<string | null>(null);
// //   const [analysisResult, setAnalysisResult] = useState<any>(null);

// //   // LOGIC 1: THE API CALL (With TypeScript Guard)
// //   useEffect(() => {
// //     const fetchData = async () => {
// //       // --- THE FIX: Guard against undefined file ---
// //       if (!file) {
// //         setError("No file provided for analysis.");
// //         return;
// //       }

// //       try {
// //         let result: any;
// //         if (patientId === "NEW") {
// //           // TypeScript now knows 'file' is not undefined here
// //           result = await api.registerAndPredict(file);
// //         } else {
// //           result = await api.predictExisting(patientId, file);
// //         }
// //         setAnalysisResult(result);
// //       } catch (err) {
// //         setError("Analysis failed. Please check backend connection.");
// //       }
// //     };
// //     fetchData();
// //   }, [file, patientId]); // Depend on file and patientId

// //   // LOGIC 2: THE VISUAL PROXY (Moves independently)
// //   useEffect(() => {
// //     const timer = setInterval(() => {
// //       setProgress((prev) => {
// //         if (prev >= 100) {
// //           clearInterval(timer);
// //           return 100;
// //         }
// //         return prev + 1;
// //       });
// //     }, 100); 

// //     return () => clearInterval(timer);
// //   }, []); 

// //   return (
// //     <div className="h-screen bg-[#f8fafc] flex flex-col items-center justify-center p-8 overflow-hidden">
// //       <div className="mb-10 text-center">
// //         <div className="inline-flex p-4 bg-blue-600 rounded-2xl shadow-xl mb-6 shadow-blue-200">
// //           <Brain className="w-12 h-12 text-white" />
// //         </div>
// //         <h1 className="text-3xl font-black text-slate-900 tracking-tight">AI Analysis in Progress</h1>
// //         <p className="text-slate-500 mt-2 text-lg font-medium">
// //           Patient ID: <span className="text-slate-900 font-mono">{patientId}</span>
// //         </p>
// //       </div>

// //       <div className="w-full max-w-2xl">
// //         <Card className="border-none shadow-2xl bg-white p-10 ring-1 ring-slate-100">
// //           <CardContent className="p-0 space-y-10">
// //             {error ? (
// //               <div className="text-center space-y-4 py-4">
// //                 <div className="text-red-500 font-bold px-4 py-3 bg-red-50 rounded-lg">{error}</div>
// //                 <Button onClick={() => window.location.reload()} className="px-6 py-2 border bg-white hover:bg-slate-50 rounded-lg font-bold">
// //                   Try Again
// //                 </Button>
// //               </div>
// //             ) : (
// //               <>
// //                 <div className="flex items-center justify-between">
// //                    <div className="flex items-center gap-3">
// //                      {progress < 100 ? (
// //                        <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
// //                      ) : (
// //                        <CheckCircle2 className="w-6 h-6 text-green-500" />
// //                      )}
// //                      <span className="font-bold text-slate-700 text-lg">
// //                        {progress < 100 ? "Analyzing MRI voxels..." : "Analysis complete"}
// //                      </span>
// //                    </div>
// //                    <div className="flex items-center gap-2 text-slate-400 font-mono text-sm">
// //                      <Clock className="w-4 h-4" />
// //                      <span>Est. 30m</span>
// //                    </div>
// //                 </div>

// //                 <div className="space-y-4">
// //                   <Progress 
// //                     value={progress} 
// //                     className="h-4 bg-slate-100 transition-all duration-300 ease-linear" 
// //                   />
// //                   <div className="flex justify-between items-start px-1 text-[11px] font-bold uppercase tracking-widest transition-colors duration-500">
// //                     <span className={progress >= 0 ? 'text-blue-600' : 'text-slate-300'}>Waiting</span>
// //                     <span className={progress > 30 ? 'text-blue-600' : 'text-slate-300'}>Processing</span>
// //                     <span className={progress === 100 ? 'text-green-600' : 'text-slate-300'}>Complete</span>
// //                   </div>
// //                 </div>
// //               </>
// //             )}

// //             <div className="flex justify-end pt-4 border-t border-slate-50">
// //               <Button 
// //                 onClick={() => onComplete(analysisResult)}
// //                 disabled={progress < 100 || !analysisResult} 
// //                 className={`h-14 px-10 text-base font-bold transition-all duration-300 shadow-lg flex items-center gap-2 rounded-xl ${
// //                   (progress === 100 && analysisResult)
// //                   ? 'bg-blue-600 hover:bg-blue-700 text-white scale-105' 
// //                   : 'bg-slate-200 text-slate-400 cursor-not-allowed'
// //                 }`}
// //               >
// //                 View Dashboard <ArrowRight className="ml-2 w-5 h-5" />
// //               </Button>
// //             </div>
// //           </CardContent>
// //         </Card>
// //       </div>

// //       <footer className="mt-12 text-slate-400 text-xs font-medium flex items-center gap-4">
// //         <div className="flex items-center gap-1.5 font-bold">
// //           <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" /> 
// //           Neural Engine Active...
// //         </div>
// //         <span className="opacity-30">|</span>
// //         <div>v1.0.4-dev</div>
// //       </footer>
// //     </div>
// //   );
// // }



// import React, { useState, useEffect } from 'react';
// import { Brain, ArrowRight, Loader2, CheckCircle2, Clock, ClipboardList } from 'lucide-react';
// import { Card, CardContent } from '../components/ui/card';
// import { Button } from '../components/ui/button';
// import { Progress } from "../components/ui/progress";
// import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
// import { api } from '../api';

// interface ProcessingPageProps {
//   onComplete: (data: any) => void;
//   patientId: string;
//   file?: File;
// }

// export function ProcessingPage({ onComplete, patientId, file }: ProcessingPageProps) {
//   const [step, setStep] = useState<'form' | 'analyzing'>('form');
//   const [progress, setProgress] = useState(0);
//   const [analysisResult, setAnalysisResult] = useState<any>(null);
//   const [error, setError] = useState<string | null>(null);
  
//   // Clinical Metadata Form State
//   const [formData, setFormData] = useState({
//     SEX: "1", AGE: "", EDUCATION: "", CDR: "0", MMSE: "", APGEN1: "2", APGEN2: "2"
//   });

//   const handleStartAnalysis = async () => {
//     if (!file) return;
//     setStep('analyzing');
//     try {
//       const result = await api.registerAndPredict(file, formData);
//       setAnalysisResult(result);
//     } catch (err) {
//       setError("Backend connection failed.");
//     }
//   };

//   // Demo Proxy Timer (Crawls smoothly over ~15 seconds)
//   useEffect(() => {
//     if (step === 'analyzing') {
//       const timer = setInterval(() => {
//         setProgress((prev) => {
//           if (prev >= 100) { clearInterval(timer); return 100; }
//           return prev + 1;
//         });
//       }, 150); 
//       return () => clearInterval(timer);
//     }
//   }, [step]);

//   // PHASE 1: CLINICAL METADATA FORM
//   if (step === 'form') {
//     return (
//       <div className="h-screen bg-[#f8fafc] flex flex-col items-center justify-center p-4 overflow-auto py-10">
//         <Card className="max-w-2xl w-full border-none shadow-2xl bg-white ring-1 ring-slate-100">
//           <CardContent className="p-10">
//             <div className="flex items-center gap-4 mb-8 border-b pb-6">
//               <div className="p-3 bg-blue-600 rounded-xl shadow-lg shadow-blue-100"><ClipboardList className="w-6 h-6 text-white" /></div>
//               <div><h2 className="text-2xl font-black text-slate-900">Clinical Metadata</h2><p className="text-sm text-slate-500">Provide patient details for AI accuracy.</p></div>
//             </div>

//             <div className="grid grid-cols-2 gap-6">
//               <div className="space-y-2">
//                 <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Sex (1:M, 2:F)</label>
//                 <Select onValueChange={(v) => setFormData({...formData, SEX: v})} value={formData.SEX}><SelectTrigger className="h-12 bg-slate-50"><SelectValue /></SelectTrigger>
//                   <SelectContent><SelectItem value="1">1 - Male</SelectItem><SelectItem value="2">2 - Female</SelectItem></SelectContent>
//                 </Select>
//               </div>
//               <div className="space-y-2">
//                 <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Age (Years)</label>
//                 <input type="number" className="w-full h-12 bg-slate-50 border border-slate-200 rounded-lg px-4 text-sm font-medium" placeholder="e.g. 72" onChange={(e) => setFormData({...formData, AGE: e.target.value})} />
//               </div>
//               <div className="space-y-2">
//                 <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">CDR Score (0-3)</label>
//                 <Select onValueChange={(v) => setFormData({...formData, CDR: v})} value={formData.CDR}><SelectTrigger className="h-12 bg-slate-50"><SelectValue /></SelectTrigger>
//                   <SelectContent><SelectItem value="0">0</SelectItem><SelectItem value="0.5">0.5</SelectItem><SelectItem value="1">1</SelectItem><SelectItem value="2">2</SelectItem><SelectItem value="3">3</SelectItem></SelectContent>
//                 </Select>
//               </div>
//               <div className="space-y-2">
//                 <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">MMSE (0-30)</label>
//                 <input type="number" max="30" className="w-full h-12 bg-slate-50 border border-slate-200 rounded-lg px-4 text-sm font-medium" placeholder="Score" onChange={(e) => setFormData({...formData, MMSE: e.target.value})} />
//               </div>
//               <div className="space-y-2">
//                 <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">APGEN1 (2,3,4)</label>
//                 <Select onValueChange={(v) => setFormData({...formData, APGEN1: v})} value={formData.APGEN1}><SelectTrigger className="h-12 bg-slate-50"><SelectValue /></SelectTrigger>
//                   <SelectContent><SelectItem value="2">ε2</SelectItem><SelectItem value="3">ε3</SelectItem><SelectItem value="4">ε4</SelectItem></SelectContent>
//                 </Select>
//               </div>
//               <div className="space-y-2">
//                 <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">APGEN2 (2,3,4)</label>
//                 <Select onValueChange={(v) => setFormData({...formData, APGEN2: v})} value={formData.APGEN2}><SelectTrigger className="h-12 bg-slate-50"><SelectValue /></SelectTrigger>
//                   <SelectContent><SelectItem value="2">ε2</SelectItem><SelectItem value="3">ε3</SelectItem><SelectItem value="4">ε4</SelectItem></SelectContent>
//                 </Select>
//               </div>
//             </div>

//             <Button onClick={handleStartAnalysis} className="w-full mt-10 h-14 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-lg flex items-center justify-center gap-2">Start Analysis <ArrowRight className="w-5 h-5" /></Button>
//           </CardContent>
//         </Card>
//       </div>
//     );
//   }

//   // PHASE 2: PROGRESS BAR
//   return (
//     <div className="h-screen bg-[#f8fafc] flex flex-col items-center justify-center p-8">
//       <div className="mb-10 text-center"><div className="inline-flex p-4 bg-blue-600 rounded-2xl shadow-xl mb-6"><Brain className="w-12 h-12 text-white" /></div>
//         <h1 className="text-3xl font-black text-slate-900 tracking-tight">AI Analysis in Progress</h1>
//         <p className="text-slate-500 mt-2 text-lg font-medium">Patient ID: <span className="text-slate-900 font-mono tracking-tighter">{patientId}</span></p>
//       </div>

//       <div className="w-full max-w-2xl">
//         <Card className="border-none shadow-2xl bg-white p-10 ring-1 ring-slate-100">
//           <CardContent className="p-0 space-y-10">
//             <div className="flex items-center justify-between">
//                <div className="flex items-center gap-3">{progress < 100 ? <Loader2 className="w-6 h-6 text-blue-600 animate-spin" /> : <CheckCircle2 className="w-6 h-6 text-green-500" />}
//                  <span className="font-bold text-slate-700 text-lg">{progress < 100 ? "Processing MRI voxels..." : "Analysis complete"}</span>
//                </div>
//                <div className="flex items-center gap-2 text-slate-400 font-mono text-sm"><Clock className="w-4 h-4" /><span>Est. 30m</span></div>
//             </div>
//             <div className="space-y-4">
//               <Progress value={progress} className="h-4 bg-slate-100 transition-all duration-300 ease-linear" />
//               <div className="flex justify-between items-start px-1 text-[11px] font-bold uppercase tracking-widest transition-colors duration-500">
//                 <span className={progress >= 0 ? 'text-blue-600' : 'text-slate-300'}>Waiting</span>
//                 <span className={progress > 30 ? 'text-blue-600' : 'text-slate-300'}>Processing</span>
//                 <span className={progress === 100 ? 'text-green-600' : 'text-slate-300'}>Complete</span>
//               </div>
//             </div>
//             <div className="flex justify-end pt-4 border-t border-slate-50">
//               <Button onClick={() => onComplete(analysisResult)} disabled={progress < 100 || !analysisResult} className={`h-14 px-10 text-base font-bold transition-all shadow-lg flex items-center gap-2 rounded-xl ${ (progress === 100 && analysisResult) ? 'bg-blue-600 hover:bg-blue-700 text-white scale-105' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}>View Dashboard <ArrowRight className="w-5 h-5" /></Button>
//             </div>
//           </CardContent>
//         </Card>
//       </div>
//     </div>
//   );
// }




import React, { useState, useEffect, useMemo } from 'react';
import { Brain, ArrowRight, Loader2, CheckCircle2, Clock, ClipboardList } from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Progress } from "../components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { api } from '../api';

interface ProcessingPageProps {
  onComplete: (data: any) => void;
  patientId: string;
  file?: File;
}

export function ProcessingPage({ onComplete, patientId, file }: ProcessingPageProps) {
  const [step, setStep] = useState<'form' | 'analyzing'>('form');
  const [progress, setProgress] = useState(0);
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [error, setError] = useState(''); 
  const [isLoading, setIsLoading] = useState(false);
  
  const [formData, setFormData] = useState({
    SEX: "1", AGE: "", EDUCATION: "", CDR: "0", MMSE: "", APGEN1: "2", APGEN2: "2"
  });

  // 1. INLINE VALIDATION HANDLERS
  const fieldErrors = useMemo(() => {
    const errs: Record<string, string> = {};
    const age = Number(formData.AGE);
    const edu = Number(formData.EDUCATION);
    const mmse = Number(formData.MMSE);

    if (formData.AGE && (age <= 0 || age > 120)) errs.AGE = "Range: 1-120";
    if (formData.EDUCATION && (edu < 0 || edu > 30)) errs.EDUCATION = "Range: 0-30";
    if (formData.MMSE && (mmse < 0 || mmse > 30)) errs.MMSE = "Range: 0-30";
    
    return errs;
  }, [formData]);

  // Check if button should be disabled
  const isFormValid = 
    formData.AGE !== "" && 
    formData.EDUCATION !== "" && 
    formData.MMSE !== "" && 
    Object.keys(fieldErrors).length === 0;

  const handleStartAnalysis = async () => {
    if (!file || !isFormValid) return;
    
    setError(''); 
    setIsLoading(true);
    setStep('analyzing');

    try {
      const result = await api.registerAndPredict(file, formData);
      setAnalysisResult(result);
    } catch (e: any) {
      setError(e.message || String(e));
      setStep('form'); 
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

  if (step === 'form') {
    return (
      <div className="h-screen bg-[#f8fafc] flex flex-col items-center justify-center p-4 overflow-auto py-10">
        <Card className="max-w-2xl w-full border-none shadow-2xl bg-white ring-1 ring-slate-100">
          <CardContent className="p-10">
            <div className="flex items-center gap-4 mb-8 border-b pb-6">
              <div className="p-3 bg-blue-600 rounded-xl shadow-lg shadow-blue-100"><ClipboardList className="w-6 h-6 text-white" /></div>
              <div><h2 className="text-2xl font-black text-slate-900">Clinical Metadata</h2><p className="text-sm text-slate-500">Inputs strictly validated against medical bounds.</p></div>
            </div>

            <div className="grid grid-cols-2 gap-x-8 gap-y-5">
              {/* SEX */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Sex (1:M, 2:F)</label>
                <Select onValueChange={(v) => setFormData({...formData, SEX: v})} value={formData.SEX}><SelectTrigger className="h-12 bg-slate-50"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="1">1 - Male</SelectItem><SelectItem value="2">2 - Female</SelectItem></SelectContent>
                </Select>
              </div>

              {/* AGE */}
              <div className="space-y-1">
                <div className="flex justify-between items-center px-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Age (Years)</label>
                  {fieldErrors.AGE && <span className="text-[10px] text-red-500 font-bold animate-pulse">* {fieldErrors.AGE}</span>}
                </div>
                <input type="number" className={`w-full h-12 bg-slate-50 border rounded-lg px-4 text-sm font-medium transition-colors ${fieldErrors.AGE ? 'border-red-300' : 'border-slate-200'}`} placeholder="72" value={formData.AGE} onChange={(e) => setFormData({...formData, AGE: e.target.value})} />
              </div>

              {/* CDR */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">CDR Score (0, 0.5, 1, 2, 3)</label>
                <Select onValueChange={(v) => setFormData({...formData, CDR: v})} value={formData.CDR}><SelectTrigger className="h-12 bg-slate-50"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="0">0</SelectItem><SelectItem value="0.5">0.5</SelectItem><SelectItem value="1">1</SelectItem><SelectItem value="2">2</SelectItem><SelectItem value="3">3</SelectItem></SelectContent>
                </Select>
              </div>

              {/* MMSE */}
              <div className="space-y-1">
                <div className="flex justify-between items-center px-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">MMSE (0-30)</label>
                  {fieldErrors.MMSE && <span className="text-[10px] text-red-500 font-bold animate-pulse">* {fieldErrors.MMSE}</span>}
                </div>
                <input type="number" className={`w-full h-12 bg-slate-50 border rounded-lg px-4 text-sm font-medium transition-colors ${fieldErrors.MMSE ? 'border-red-300' : 'border-slate-200'}`} placeholder="Score" value={formData.MMSE} onChange={(e) => setFormData({...formData, MMSE: e.target.value})} />
              </div>

              {/* EDUCATION */}
              <div className="space-y-1">
                <div className="flex justify-between items-center px-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Education (Years)</label>
                  {fieldErrors.EDUCATION && <span className="text-[10px] text-red-500 font-bold animate-pulse">* {fieldErrors.EDUCATION}</span>}
                </div>
                <input type="number" className={`w-full h-12 bg-slate-50 border rounded-lg px-4 text-sm font-medium transition-colors ${fieldErrors.EDUCATION ? 'border-red-300' : 'border-slate-200'}`} placeholder="Years" value={formData.EDUCATION} onChange={(e) => setFormData({...formData, EDUCATION: e.target.value})} />
              </div>

              {/* APGEN1 */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">APOE Genotype 1 (2,3,4)</label>
                <Select onValueChange={(v) => setFormData({...formData, APGEN1: v})} value={formData.APGEN1}><SelectTrigger className="h-12 bg-slate-50"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="2">2</SelectItem><SelectItem value="3">3</SelectItem><SelectItem value="4">4</SelectItem></SelectContent>
                </Select>
              </div>

              {/* APGEN2 */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">APOE Genotype 2 (2,3,4)</label>
                <Select onValueChange={(v) => setFormData({...formData, APGEN2: v})} value={formData.APGEN2}><SelectTrigger className="h-12 bg-slate-50"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="2">2</SelectItem><SelectItem value="3">3</SelectItem><SelectItem value="4">4</SelectItem></SelectContent>
                </Select>
              </div>
            </div>

            {/* General API Error (Migration Assistant Style) */}
            {error && <div className="error mt-6">{error}</div>}

            <Button 
              onClick={handleStartAnalysis} 
              disabled={isLoading || !isFormValid}
              className={`w-full mt-10 h-14 font-bold rounded-xl shadow-lg flex items-center justify-center gap-2 transition-all ${
                isLoading || !isFormValid 
                ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none' 
                : 'bg-blue-600 hover:bg-blue-700 text-white scale-100 active:scale-95'
              }`}
            >
              {isLoading ? '⏳ Connecting…' : '→ Start Analysis Engine'}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // PHASE 2: PROGRESS BAR
  return (
    <div className="h-screen bg-[#f8fafc] flex flex-col items-center justify-center p-8">
      <div className="mb-10 text-center"><div className="inline-flex p-4 bg-blue-600 rounded-2xl shadow-xl mb-6"><Brain className="w-12 h-12 text-white" /></div>
        <h1 className="text-3xl font-black text-slate-900 tracking-tight">AI Analysis in Progress</h1>
        <p className="text-slate-500 mt-2 text-lg font-medium">Patient ID: <span className="text-slate-900 font-mono tracking-tighter">{patientId}</span></p>
      </div>

      <div className="w-full max-w-2xl">
        <Card className="border-none shadow-2xl bg-white p-10 ring-1 ring-slate-100">
          <CardContent className="p-0 space-y-10">
            {error && <div className="error">{error}</div>}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">{progress < 100 ? <Loader2 className="w-6 h-6 text-blue-600 animate-spin" /> : <CheckCircle2 className="w-6 h-6 text-green-500" />}
                  <span className="font-bold text-slate-700 text-lg">{progress < 100 ? "Processing MRI voxels..." : "Analysis complete"}</span>
                </div>
                <div className="flex items-center gap-2 text-slate-400 font-mono text-sm"><Clock className="w-4 h-4" /><span>Est. 30m</span></div>
            </div>
            <div className="space-y-4">
              <Progress value={progress} className="h-4 bg-slate-100 transition-all duration-300 ease-linear" />
              <div className="flex justify-between items-start px-1 text-[11px] font-bold uppercase tracking-widest transition-colors duration-500">
                <span className={progress >= 0 ? 'text-blue-600' : 'text-slate-300'}>Waiting</span>
                <span className={progress > 30 ? 'text-blue-600' : 'text-slate-300'}>Processing</span>
                <span className={progress === 100 ? 'text-green-600' : 'text-slate-300'}>Complete</span>
              </div>
            </div>
            <div className="flex justify-end pt-4 border-t border-slate-50">
              <Button onClick={() => onComplete(analysisResult)} disabled={progress < 100 || !analysisResult} className={`h-14 px-10 text-base font-bold transition-all shadow-lg flex items-center gap-2 rounded-xl ${ (progress === 100 && analysisResult) ? 'bg-blue-600 hover:bg-blue-700 text-white scale-105' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}>View Dashboard <ArrowRight className="w-5 h-5" /></Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}