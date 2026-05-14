import { AlertCircle, CheckCircle2, AlertTriangle } from 'lucide-react';

interface DiagnosisCardProps {
  diagnosis: string;
  confidence: number;
  severity: 'high' | 'medium' | 'low';
  description: string;
}

export function DiagnosisCard({ diagnosis, confidence, severity, description }: DiagnosisCardProps) {
  const severityConfig = {
    high: {
      icon: AlertCircle,
      color: 'text-red-600',
      bgColor: 'bg-red-50',
      borderColor: 'border-red-200',
    },
    medium: {
      icon: AlertTriangle,
      color: 'text-amber-600',
      bgColor: 'bg-amber-50',
      borderColor: 'border-amber-200',
    },
    low: {
      icon: CheckCircle2,
      color: 'text-green-600',
      bgColor: 'bg-green-50',
      borderColor: 'border-green-200',
    },
  };

  const config = severityConfig[severity];
  const Icon = config.icon;

  return (
    <div className={`rounded-lg shadow-sm p-6 border ${config.borderColor} ${config.bgColor}`}>
      <div className="flex items-start gap-4">
        <div className={`p-3 rounded-full ${config.bgColor}`}>
          <Icon className={`w-8 h-8 ${config.color}`} />
        </div>
        <div className="flex-1">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Diagnosis</h2>
          <p className="text-2xl font-bold text-gray-900 mb-2">{diagnosis}</p>
          <p className="text-gray-600 mb-4">{description}</p>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">Confidence Level:</span>
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