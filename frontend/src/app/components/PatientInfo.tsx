import React from 'react';
import { User, Calendar, GraduationCap, BrainCircuit, Activity, Dna } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';

interface PatientInfoProps {
  id: string;
  age?: number | string;
  gender?: string | number;
  education?: number | string;
  cdr?: number | string;
  mmse?: number | string;
  apgen1?: number | string;
  apgen2?: number | string;
}

export function PatientInfo({ id, age, gender, education, cdr, mmse, apgen1, apgen2 }: PatientInfoProps) {
  
  const parseGender = () => {
    if (gender === undefined || gender === null || gender === '') return 'N/A';
    const g = String(gender).trim().toLowerCase();
    if (g === '1' || g === 'male') return 'Male';
    if (g === '2' || g === 'female') return 'Female';
    return gender; // Return whatever string text already came back from backend
  };

  const infoItems = [
    { 
      label: 'Patient ID', 
      value: id || 'N/A', 
      icon: User 
    },
    { 
      label: 'Age', 
      value: age !== undefined && age !== null && age !== '' ? `${age} Years` : 'N/A', 
      icon: Calendar 
    },
    { 
      label: 'Gender', 
      value: parseGender(), 
      icon: Activity 
    },
    { 
      label: 'Education', 
      value: education !== undefined && education !== null && education !== '' ? `${education} Years` : 'N/A', 
      icon: GraduationCap 
    },
    { 
      label: 'CDR Score', 
      value: cdr !== undefined && cdr !== null && cdr !== '' ? cdr : 'N/A', 
      icon: BrainCircuit 
    },
    { 
      label: 'MMSE Score', 
      value: mmse !== undefined && mmse !== null && mmse !== '' ? `${mmse}/30` : 'N/A', 
      icon: Activity 
    },
    { 
      label: 'APOE Genotype', 
      value: apgen1 && apgen2 ? `ε${apgen1} / ε${apgen2}` : 'N/A', 
      icon: Dna 
    },
  ];

  return (
    <Card className="border-none shadow-xl bg-white ring-1 ring-slate-100 h-full flex flex-col">
      <CardHeader className="pb-2 border-b border-slate-50 mb-4">
        <CardTitle className="text-sm font-black text-slate-400 uppercase tracking-widest">Clinical Profile</CardTitle>
      </CardHeader>
      
      <CardContent className="grid grid-cols-2 gap-x-8 gap-y-6 flex-1 content-center">
        {infoItems.map((item, idx) => (
          <div key={idx} className="flex flex-col gap-1 group">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-slate-50 rounded-lg text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors">
                <item.icon className="w-3.5 h-3.5" />
              </div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">{item.label}</span>
            </div>
            <span className="text-sm font-black text-slate-700 ml-9">{item.value}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}