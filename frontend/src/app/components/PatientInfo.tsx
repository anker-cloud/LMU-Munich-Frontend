import React from 'react';
import { User, Calendar, GraduationCap, BrainCircuit, Activity, Dna } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';

interface PatientInfoProps {
  id: string;
  age: number | string;
  gender: string;
  education?: number | string;
  cdr?: number | string;
  mmse?: number | string;
  apgen1?: number | string;
  apgen2?: number | string;
}

export function PatientInfo({ id, age, gender, education, cdr, mmse, apgen1, apgen2 }: PatientInfoProps) {
  const infoItems = [
    { label: 'Patient ID', value: id, icon: User },
    { label: 'Age', value: `${age} Years`, icon: Calendar },
    { label: 'Gender', value: gender, icon: Activity },
    { label: 'Education', value: `${education} Years`, icon: GraduationCap },
    { label: 'CDR Score', value: cdr, icon: BrainCircuit },
    { label: 'MMSE Score', value: `${mmse}/30`, icon: Activity },
    { label: 'APOE Genotype', value: `ε${apgen1} / ε${apgen2}`, icon: Dna },
  ];

  return (
    <Card className="border-none shadow-xl bg-white ring-1 ring-slate-100 h-full flex flex-col">
      <CardHeader className="pb-2 border-b border-slate-50 mb-4">
        <CardTitle className="text-sm font-black text-slate-400 uppercase tracking-widest">Clinical Profile</CardTitle>
      </CardHeader>
      {/* Updated to a 2-column grid and flex-1 to ensure it fills vertical space */}
      <CardContent className="grid grid-cols-2 gap-x-8 gap-y-6 flex-1 content-center">
        {infoItems.map((item, idx) => (
          <div key={idx} className="flex flex-col gap-1 group">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-slate-50 rounded-lg text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors">
                <item.icon className="w-3.5 h-3.5" />
              </div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">{item.label}</span>
            </div>
            <span className="text-sm font-black text-slate-700 ml-9">{item.value || 'N/A'}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}