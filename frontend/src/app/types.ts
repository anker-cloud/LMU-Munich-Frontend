// Type definitions for LMU Medical Dashboard

export interface ClinicalData {
  SEX: string | number;
  AGE: string | number;
  EDUCATION: string | number;
  CDR: string | number;
  MMSE: string | number;
  APGEN1: string | number;
  APGEN2: string | number;
}

export interface PatientInfo {
  age: number;
  sex: string;
  education: number;
  cdr: number;
  mmse: number;
  apgen1: number;
  apgen2: number;
}

export interface SHAPFeature {
  feature: string;
  value: number;
  shap: number;
}

export interface SHAPResult {
  features: SHAPFeature[];
  chart_path?: string;
}

export interface GradCAMResult {
  heatmap_path: string;
  heatmap_png?: string;
  mri_nifti_url?: string;
  overlay_nifti_url?: string;
}

export interface Probabilities {
  CN: number;
  MCI: number;
  AD: number;
  AD_VASC: number;
  VASC: number;
  FTD: number;
  CBS: number;
  PSP: number;
}

export interface BackendResponse {
  patient_id: string;
  model_used: string;
  prediction: string;
  probabilities: Probabilities;
  patient_info: PatientInfo;
  ad_stage?: string | null;
  shap?: SHAPResult;
  gradcam?: GradCAMResult;
}

export interface SessionData {
  patient_id: string;
  diagnosis: string;
  confidence: number;
  age?: number;
  gender?: string;
  education?: number;
  cdr?: number;
  mmse?: number;
  apgen1?: number;
  apgen2?: number;
  probabilities?: Probabilities;
  shap?: SHAPResult;
  gradcam?: GradCAMResult;
  model_used?: string;
  ad_stage?: string | null;
}

export interface UploadSessionData {
  id: string;
  file: File;
}
