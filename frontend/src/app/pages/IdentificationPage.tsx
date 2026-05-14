// import React, { useState, useEffect, useRef } from 'react';
// import { Brain, FileUp, History, UploadCloud, AlertCircle, ArrowRight, Loader2 } from 'lucide-react';
// import { Card, CardContent } from '../components/ui/card';
// import { Button } from '../components/ui/button';
// import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
// import { api } from '../api';

// const ALLOWED_FORMATS = [".nii", ".nii.gz", ".png"]; 

// interface IdentificationPageProps {
//   onProceed: (id: string, file?: File) => void;
// }

// export function IdentificationPage({ onProceed }: IdentificationPageProps) {
//   const [patientList, setPatientList] = useState<{ id: string; label: string }[]>([]);
//   const [selectedId, setSelectedId] = useState<string>("");
//   const [isDragging, setIsDragging] = useState(false);
//   const [isLoading, setIsLoading] = useState(true);
  
//   // FIXED: Split the errors into two specific states
//   const [registryError, setRegistryError] = useState<string | null>(null);
//   const [uploadError, setUploadError] = useState<string | null>(null);
  
//   const fileInputRef = useRef<HTMLInputElement>(null);

//   useEffect(() => {
//     api.getPatients()
//       .then((ids: string[]) => {
//         setPatientList(ids.map((id: string) => ({ id, label: `${id} (Anonymized Record)` })));
//       })
//       // Registry error now goes to its own specific state
//       .catch(() => setRegistryError("Could not connect to backend registry."))
//       .finally(() => setIsLoading(false));
//   }, []);

//   const validateAndProceed = (file: File) => {
//     const fileName = file.name.toLowerCase();
//     const isValid = ALLOWED_FORMATS.some(ext => fileName.endsWith(ext));

//     if (isValid) {
//       setUploadError(null);
//       onProceed("NEW", file); 
//     } else {
//       // Upload error now goes to its own specific state
//       setUploadError(`*upload format is incorrect (try ${ALLOWED_FORMATS.join(" or ")})`);
//     }
//   };

//   const handleDrop = (e: React.DragEvent) => {
//     e.preventDefault();
//     setIsDragging(false);
//     const file = e.dataTransfer.files?.[0];
//     if (file) validateAndProceed(file);
//   };

//   return (
//     <div className="h-screen bg-[#f8fafc] flex flex-col items-center justify-center p-4">
//       <div className="mb-6 text-center">
//         <div className="inline-flex p-3 bg-blue-600 rounded-2xl shadow-lg mb-4">
//           <Brain className="w-10 h-10 text-white" />
//         </div>
//         <h1 className="text-3xl font-black text-slate-900 tracking-tight">NeuroAI Portal</h1>
//         <p className="text-slate-500 font-medium">Diagnostic Management System</p>
//       </div>

//       <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl w-full">
//         {/* ACTION: NEW ANALYSIS (Only shows uploadError) */}
//         <Card className="border-none shadow-xl bg-white ring-1 ring-slate-100 flex flex-col">
//           <CardContent className="p-10 flex flex-col items-center text-center space-y-6">
//             <FileUp className="w-10 h-10 text-blue-600" />
//             <h2 className="text-xl font-bold">New Analysis</h2>
            
//             <div 
//               onClick={() => fileInputRef.current?.click()}
//               onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
//               onDragLeave={() => setIsDragging(false)}
//               onDrop={handleDrop}
//               className={`w-full py-10 border-2 border-dashed rounded-3xl cursor-pointer transition-all duration-200 
//                 ${isDragging 
//                   ? "border-blue-500 bg-blue-50 scale-[1.02]" 
//                   : uploadError 
//                     ? "border-red-300 bg-red-50/30"
//                     : "border-slate-200 bg-slate-50/50 hover:bg-slate-100"
//                 }`}
//             >
//               <UploadCloud className={`w-8 h-8 mb-2 mx-auto ${isDragging ? "text-blue-500" : uploadError ? "text-red-400" : "text-slate-400"}`} />
//               <p className="text-sm font-bold text-slate-700">
//                 {isDragging ? "Drop to Analyze" : "Click or drag to upload"}
//                 <span className="text-[10px] block text-slate-400 mt-2 tracking-widest font-black uppercase">
//                    NIfTI / PNG (Test Mode)
//                 </span>
//               </p>
//               <input 
//                 type="file" 
//                 ref={fileInputRef} 
//                 className="hidden" 
//                 onChange={(e) => e.target.files?.[0] && validateAndProceed(e.target.files[0])} 
//                 accept={ALLOWED_FORMATS.join(",")} 
//               />
//             </div>
//             {uploadError && (
//               <div className="flex items-center gap-2 text-red-600 text-[11px] font-bold bg-red-50 px-3 py-2 rounded-lg">
//                 <AlertCircle className="w-3 h-3" /> {uploadError}
//               </div>
//             )}
//           </CardContent>
//         </Card>

//         {/* ACTION: EXISTING RECORDS (Now correctly handles registryError) */}
//         <Card className="border-none shadow-xl bg-white ring-1 ring-slate-100 flex flex-col">
//           <CardContent className="p-10 flex flex-col items-center text-center space-y-6">
//             <History className="w-10 h-10 text-slate-600" />
//             <h2 className="text-xl font-bold">Existing Records</h2>
//             <div className="w-full space-y-5 pt-4">
//               <div className="space-y-2">
//                 <Select onValueChange={setSelectedId} value={selectedId} disabled={isLoading || !!registryError}>
//                   <SelectTrigger className={`w-full h-12 rounded-xl ${registryError ? "border-red-200 bg-red-50/30" : "bg-slate-50 border-slate-200"}`}>
//                     <SelectValue placeholder={isLoading ? "Loading registry..." : "Choose a scan..."} />
//                   </SelectTrigger>
//                   <SelectContent>
//                     {patientList.map((p) => (
//                       <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
//                     ))}
//                   </SelectContent>
//                 </Select>
                
//                 {/* Registry Error appears right under the dropdown where it belongs */}
//                 {registryError && (
//                   <div className="flex items-center justify-center gap-2 text-red-600 text-[11px] font-bold mt-2">
//                     <AlertCircle className="w-3 h-3" /> {registryError}
//                   </div>
//                 )}
//               </div>

//               <Button 
//                 onClick={() => selectedId && onProceed(selectedId)} 
//                 disabled={!selectedId || !!registryError} 
//                 className="w-full bg-slate-900 h-12 font-bold text-white rounded-xl shadow-lg hover:bg-black flex items-center justify-center gap-2"
//               >
//                 Open Report <ArrowRight className="w-4 h-4" />
//               </Button>
//             </div>
//           </CardContent>
//         </Card>
//       </div>
//     </div>
//   );
// }


import React, { useState, useEffect, useRef } from 'react';
import { Brain, FileUp, History, UploadCloud, AlertCircle, ArrowRight } from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { api } from '../api';

const ALLOWED_FORMATS = [".nii", ".nii.gz", ".png"]; // TEMPORARY: PNG ALLOWED

interface IdentificationPageProps {
  onProceed: (id: string, file?: File) => void;
}

export function IdentificationPage({ onProceed }: IdentificationPageProps) {
  const [patientList, setPatientList] = useState<{ id: string; label: string }[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [registryError, setRegistryError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.getPatients()
      .then((ids: string[]) => {
        setPatientList(ids.map((id: string) => ({ id, label: `${id} (Anonymized Record)` })));
      })
      .catch(() => setRegistryError("Could not connect to backend registry."))
      .finally(() => setIsLoading(false));
  }, []);

  const validateAndProceed = (file: File) => {
    const fileName = file.name.toLowerCase();
    const isValid = ALLOWED_FORMATS.some(ext => fileName.endsWith(ext));

    if (isValid) {
      setUploadError(null);
      onProceed("NEW", file); // Triggers the metadata form in ProcessingPage
    } else {
      setUploadError(`*upload format is incorrect (try nifti or png)`);
    }
  };

  return (
    <div className="h-screen bg-[#f8fafc] flex flex-col items-center justify-center p-4">
      <div className="mb-6 text-center">
        <div className="inline-flex p-3 bg-blue-600 rounded-2xl shadow-lg mb-4"><Brain className="w-10 h-10 text-white" /></div>
        <h1 className="text-3xl font-black text-slate-900 tracking-tight">NeuroAI Portal</h1>
        <p className="text-slate-500 font-medium">Diagnostic Management System</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl w-full">
        {/* NEW ANALYSIS */}
        <Card className="border-none shadow-xl bg-white ring-1 ring-slate-100">
          <CardContent className="p-10 flex flex-col items-center text-center space-y-6">
            <FileUp className="w-10 h-10 text-blue-600" />
            <h2 className="text-xl font-bold">New Analysis</h2>
            <div 
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files?.[0]; if (f) validateAndProceed(f); }}
              className={`w-full py-10 border-2 border-dashed rounded-3xl cursor-pointer transition-all ${isDragging ? "border-blue-500 bg-blue-50" : "border-slate-200 bg-slate-50/50 hover:bg-slate-100"}`}
            >
              <UploadCloud className="w-8 h-8 mb-2 mx-auto text-slate-400" />
              <p className="text-sm font-bold text-slate-700">Click or drag to upload <span className="text-[10px] block text-slate-400 mt-2 uppercase">NIfTI / PNG</span></p>
              <input type="file" ref={fileInputRef} className="hidden" onChange={(e) => e.target.files?.[0] && validateAndProceed(e.target.files[0])} accept={ALLOWED_FORMATS.join(",")} />
            </div>
            {uploadError && <p className="text-red-600 text-[11px] font-bold">{uploadError}</p>}
          </CardContent>
        </Card>

        {/* EXISTING RECORDS */}
        <Card className="border-none shadow-xl bg-white ring-1 ring-slate-100">
          <CardContent className="p-10 flex flex-col items-center text-center space-y-6">
            <History className="w-10 h-10 text-slate-600" />
            <h2 className="text-xl font-bold">Existing Records</h2>
            <div className="w-full space-y-5 pt-4">
              <Select onValueChange={setSelectedId} value={selectedId} disabled={isLoading || !!registryError}>
                <SelectTrigger className="w-full h-12 bg-slate-50 border-slate-200"><SelectValue placeholder={isLoading ? "Loading..." : "Choose a scan..."} /></SelectTrigger>
                <SelectContent>{patientList.map((p) => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}</SelectContent>
              </Select>
              {registryError && <p className="text-red-600 text-[11px] font-bold">{registryError}</p>}
              <Button onClick={() => selectedId && onProceed(selectedId)} disabled={!selectedId || !!registryError} className="w-full bg-slate-900 h-12 font-bold text-white rounded-xl shadow-lg hover:bg-black flex items-center justify-center gap-2">Open Report <ArrowRight className="w-4 h-4" /></Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}