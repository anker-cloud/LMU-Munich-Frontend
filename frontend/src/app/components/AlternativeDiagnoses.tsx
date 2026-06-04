interface Diagnosis {
  name: string;
  probability: number;
}

interface AlternativeDiagnosesProps {
  probabilities?: {
    CN: number;
    MCI: number;
    AD: number;
    AD_VASC: number;
    VASC: number;
    FTD: number;
    CBS: number;
    PSP: number;
  };
}

const DIAGNOSIS_LABELS: Record<string, string> = {
  CN: 'Cognitively Normal',
  MCI: 'Mild Cognitive Impairment',
  AD: "Alzheimer's Disease",
  AD_VASC: 'Mixed AD / Vascular Dementia',
  VASC: 'Vascular Dementia',
  FTD: 'Frontotemporal Dementia',
  CBS: 'Corticobasal Syndrome',
  PSP: 'Progressive Supranuclear Palsy'
};

export function AlternativeDiagnoses({ probabilities }: AlternativeDiagnosesProps) {
  // Convert backend probabilities to sorted diagnoses
  const diagnoses: Diagnosis[] = probabilities
    ? Object.entries(probabilities)
        .map(([key, value]) => ({
          name: DIAGNOSIS_LABELS[key] || key,
          probability: Math.round(value * 100)
        }))
        .sort((a, b) => b.probability - a.probability)
    : [];

  if (!probabilities || diagnoses.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Differential Diagnoses
        </h3>
        <p className="text-sm text-gray-500">No diagnosis data available</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">
        Differential Diagnoses
      </h3>
      <div className="space-y-4">
        {diagnoses.map((diagnosis, index) => (
          <div key={index}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">{diagnosis.name}</span>
              <span className="text-sm font-semibold text-gray-900">{diagnosis.probability}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className={`h-2 rounded-full ${
                  index === 0
                    ? 'bg-red-600'
                    : index === 1
                    ? 'bg-amber-500'
                    : 'bg-blue-500'
                }`}
                style={{ width: `${diagnosis.probability}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-sm text-blue-900">
          <span className="font-semibold">Clinical Note:</span> Results should be 
          interpreted by a qualified medical professional in conjunction with complete 
          clinical evaluation of the patient.
        </p>
      </div>
    </div>
  );
}