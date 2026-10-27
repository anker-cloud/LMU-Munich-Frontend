interface DiagnosisCardProps {
  diagnosis: string;
  confidence: number;
  severity: 'high' | 'medium' | 'low';
  description: string;
  note?: string;
  stage?: string;
  cdr?: number | string;
}

export function DiagnosisCard({ diagnosis, confidence, severity, description, note, stage, cdr }: DiagnosisCardProps) {
  const severityConfig = {
    high: {
      bgColor: 'bg-red-50',
      borderColor: 'border-red-200',
    },
    medium: {
      bgColor: 'bg-amber-50',
      borderColor: 'border-amber-200',
    },
    low: {
      bgColor: 'bg-green-50',
      borderColor: 'border-green-200',
    },
  };

  const config = severityConfig[severity];

  // The AD stage is only defined for an Alzheimer's result. It comes from a
  // fixed CDR rule (not a model), so say so.
  const cdrMissing = cdr === undefined || cdr === null || cdr === '';
  const stageText = diagnosis !== 'AD'
    ? null
    : stage
      ? `${stage} (from CDR ${cdr})`
      : cdrMissing
        ? 'Not available: CDR not entered'
        : 'Not staged (CDR 0)';

  return (
    <div className={`rounded-lg shadow-sm p-6 border ${config.borderColor} ${config.bgColor}`}>
      <div className="flex items-start gap-4">
        <div className="flex-1">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Diagnosis</h2>
          <p className="text-2xl font-bold text-gray-900 mb-2">{diagnosis}</p>
          {stageText && (
            <p className="text-sm font-semibold text-gray-800 mb-2">
              Alzheimer's stage: {stageText}
            </p>
          )}
          <p className="text-gray-600 mb-2">{description}</p>
          {note && (
            <p className="text-sm text-amber-800 bg-amber-100 border border-amber-200 rounded px-3 py-2 mb-4">
              {note}
            </p>
          )}
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">Model Score:</span>
            <div className="flex-1 max-w-xs bg-gray-200 rounded-full h-2">
              <div
                className={`h-2 rounded-full ${severity === 'high' ? 'bg-red-600' : severity === 'medium' ? 'bg-amber-600' : 'bg-green-600'}`}
                style={{ width: `${confidence}%` }}
              />
            </div>
            <span className="font-semibold text-gray-900">{confidence}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}
