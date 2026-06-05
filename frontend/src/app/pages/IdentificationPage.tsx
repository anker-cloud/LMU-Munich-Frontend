import { useState, useEffect, useRef } from 'react';
import { Brain, FileUp, History, UploadCloud, ArrowRight } from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { api } from '../api';

// Allowed formats defined by the technical testing specification [cite: 9, 131]
const ALLOWED_FORMATS = [".nii", ".nii.gz", ".zip"];

interface IdentificationPageProps {
  onProceed: (id: string, file?: File) => void;
  onAddScan?: (id: string, file: File) => void;
  onRunNewScan?: (id: string) => void;
}

export function IdentificationPage({ onProceed, onAddScan, onRunNewScan }: IdentificationPageProps) {
  const [patientList, setPatientList] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [registryError, setRegistryError] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [addScanError, setAddScanError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const addScanFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.getPatients()
      .then((rawStrings: string[]) => {
        setPatientList(rawStrings);
      })
      .catch(() => setRegistryError("Could not connect to backend registry."))
      .finally(() => setIsLoading(false));
  }, []);

  const validateAndProceed = (file: File) => {
    const fileName = file.name.toLowerCase();
    const isValid = ALLOWED_FORMATS.some(ext => fileName.endsWith(ext));

    if (isValid) {
      setUploadError('');
      onProceed("NEW", file);
    } else {
      setUploadError(`*Invalid format. Please upload NIfTI (.nii, .nii.gz) or .zip files only.`);
    }
  };

  const handleExistingPatientClick = () => {
    if (selectedId) {
      onProceed(selectedId);
    }
  };

  const handleAddScanClick = () => {
    if (selectedId && onRunNewScan) {
      onRunNewScan(selectedId);
    }
  };

  const handleAddScanFileSelect = (file: File) => {
    const fileName = file.name.toLowerCase();
    const isValid = ALLOWED_FORMATS.some(ext => fileName.endsWith(ext));

    if (isValid) {
      setAddScanError('');
      onProceed(selectedId, file);
    } else {
      setAddScanError(`*Invalid format. Please upload NIfTI (.nii, .nii.gz) or .zip files only.`);
    }
  };

  return (
    <div className="h-screen w-screen bg-[#f8fafc] flex flex-col items-center justify-center p-4 overflow-hidden select-none">
      
      <div className="w-full max-w-4xl flex flex-col items-center animate-in fade-in duration-300">
        
        {/* Header Section */}
        <div className="mb-5 text-center">
          <div className="inline-flex p-2.5 bg-blue-600 rounded-2xl shadow-lg mb-3">
            <Brain className="w-9 h-9 text-white" />
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">NeuroAI Portal</h1>
          <p className="text-xs text-slate-500 font-semibold tracking-wide">Diagnostic Management System</p>
        </div>

        {/* Proportional Grid Layer */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
          
          {/* LEFT CARD: NEW PATIENT ANALYSIS */}
          {/* Added min-h-[370px] to gently elongate the card profile */}
          <Card className="border-none shadow-xl bg-white ring-1 ring-slate-100 flex flex-col rounded-3xl min-h-[370px]">
            {/* Fine-tuned vertical padding to md:py-10 for proportional spacing */}
            <CardContent className="p-6 py-9 md:py-10 md:px-8 flex flex-col items-center text-center space-y-5 flex-1 justify-center">
              <FileUp className="w-9 h-9 text-blue-600" />
              <h2 className="text-lg font-bold text-slate-900">New Patient Analysis</h2>
              
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files?.[0]; if (f) validateAndProceed(f); }}
                className={`w-full py-8 border-2 border-dashed rounded-2xl cursor-pointer transition-all ${
                  isDragging ? "border-blue-500 bg-blue-50/50" : "border-slate-300 bg-slate-50/50 hover:bg-slate-100"
                }`}
              >
                <UploadCloud className="w-8 h-8 mb-1 mx-auto text-slate-400" />
                <p className="text-xs font-bold text-slate-700">Click or drag to upload</p>
                <p className="text-[9px] text-slate-500 uppercase tracking-widest mt-0.5 font-bold">NIfTI or ZIP</p>
                <input type="file" ref={fileInputRef} className="hidden" onChange={(e) => e.target.files?.[0] && validateAndProceed(e.target.files[0])} accept=".nii,.gz,.zip" />
              </div>
              {uploadError && <div className="text-red-600 text-[10px] font-bold w-full text-center">{uploadError}</div>}
            </CardContent>
          </Card>

          {/* RIGHT CARD: EXISTING DATABASE RECORDS */}
          {/* Added min-h-[370px] to keep card sizes perfectly uniform */}
          <Card className="border-none shadow-xl bg-white ring-1 ring-slate-100 flex flex-col rounded-3xl min-h-[370px]">
            {/* Fine-tuned vertical padding to md:py-10 for proportional spacing */}
            <CardContent className="p-6 py-9 md:py-10 md:px-8 flex flex-col items-center text-center space-y-5 flex-1 justify-center">
              <History className="w-9 h-9 text-slate-600" />
              <h2 className="text-lg font-bold text-slate-900">Existing Records</h2>
              
              <div className="w-full space-y-4 pt-2">
                <Select onValueChange={setSelectedId} value={selectedId} disabled={isLoading || !!registryError}>
                  <SelectTrigger className="w-full h-11 bg-slate-50 border-slate-300 rounded-xl font-semibold text-slate-800 text-xs focus:ring-2 focus:ring-blue-500/20">
                    <SelectValue placeholder={isLoading ? "Loading..." : "Choose a scan..."} />
                  </SelectTrigger>
                  <SelectContent>
                    {patientList.map((id) => (
                      <SelectItem key={id} value={id}>
                        {id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {registryError && <div className="text-red-600 text-[10px] font-bold w-full text-center">{registryError}</div>}
                {addScanError && <div className="text-red-600 text-[10px] font-bold w-full text-center">{addScanError}</div>}

                {/* Content Action Button Cluster */}
                <div className="w-full space-y-2.5">
                  <button
                    type="button"
                    onClick={handleAddScanClick}
                    disabled={!selectedId || !!registryError}
                    className={`w-full h-11 font-bold rounded-xl flex items-center justify-center gap-2 text-xs transition-all tracking-wide outline-none border border-blue-200 bg-white text-blue-600 ${
                      !selectedId || !!registryError
                      ? 'opacity-100 cursor-not-allowed shadow-none'
                      : 'hover:bg-blue-50 hover:border-blue-300 cursor-pointer'
                    }`}
                  >
                    Run New Scan 
                  </button>

                  <button 
                    type="button"
                    onClick={handleExistingPatientClick} 
                    disabled={!selectedId || !!registryError} 
                    className={`w-full h-11 font-bold rounded-xl flex items-center justify-center gap-2 transition-all outline-none text-xs bg-slate-900 text-white shadow-md ${
                      !selectedId || !!registryError
                      ? 'opacity-100 cursor-not-allowed shadow-none'
                      : 'hover:bg-black cursor-pointer'
                    }`}
                  >
                    Open Dashboard <ArrowRight className="w-3.5 h-3.5 ml-0.5" />
                  </button>
                </div>
                
                <input
                  type="file"
                  ref={addScanFileInputRef}
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleAddScanFileSelect(e.target.files[0])}
                  accept=".nii,.gz,.zip"
                />
              </div>
            </CardContent>
          </Card>
        </div>

      </div>
    </div>
  );
}