import axios from 'axios';

// Backend API base URL
const BASE_URL = import.meta.env.DEV ? '/api' : 'http://35.159.51.22:8000';

export const api = {
  /**
   * GET /patients
   * Returns: { patients: ["AAA004", "AAA006", ...] }
   */
  getPatients: async () => {
    const response = await axios.get(`${BASE_URL}/patients`);
    return response.data.patients;
  },

  /**
   * GET /patient/{patient_id}
   * Returns: {
   *   patient_id: string,
   *   file_count: number,
   *   files: [...],
   *   prediction: {
   *     model_used: string,
   *     prediction: string,
   *     probabilities: {...},
   *     patient_info: { age, sex, education, cdr, mmse, apgen1, apgen2 },
   *     shap: {...},
   *     gradcam: {...}
   *   }
   * }
   */
  getPatientRecord: async (patientId: string) => {
    const response = await axios.get(`${BASE_URL}/patient/${patientId}`);
    return response.data;
  },

  /**
   * POST /patient/register-and-predict
   * For NEW patients
   * Body (FormData):
   *   - tabular: JSON string with { SEX, AGE, EDUCATION, CDR, MMSE, APGEN1, APGEN2 }
   *   - t1w_file: File (MRI scan)
   *   - explain: "true" | "false"
   * Returns: Same structure as prediction object above
   */
  registerAndPredict: async (patientData: {
    SEX: string;
    AGE: string;
    EDUCATION: string;
    CDR: string;
    MMSE: string;
    APGEN1: string;
    APGEN2: string;
  }, file: File) => {
    const formData = new FormData();

    // Backend expects numeric values in JSON string
    const tabularData = {
      SEX: Number(patientData.SEX),
      AGE: Number(patientData.AGE),
      EDUCATION: Number(patientData.EDUCATION),
      CDR: Number(patientData.CDR),
      MMSE: Number(patientData.MMSE),
      APGEN1: Number(patientData.APGEN1),
      APGEN2: Number(patientData.APGEN2)
    };

    formData.append('tabular', JSON.stringify(tabularData));
    formData.append('t1w_file', file);
    formData.append('explain', 'true');

    const response = await axios.post(`${BASE_URL}/patient/register-and-predict`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });

    return response.data;
  },

  /**
   * POST /patient/{patient_id}/predict
   * For EXISTING patients with new scan
   * Body (FormData):
   *   - t1w_file: File (new MRI scan)
   *   - explain: "true" | "false"
   * Note: Backend fetches tabular data from S3 for this patient
   * Returns: Same structure as prediction object
   */
  predictExistingPatient: async (patientId: string, file: File) => {
    const formData = new FormData();
    formData.append('t1w_file', file);
    formData.append('explain', 'true');

    const response = await axios.post(`${BASE_URL}/patient/${patientId}/predict`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });

    return response.data;
  },

  /**
   * POST /patient/register-and-predict (workaround for existing patients)
   * Used when we already have the patient's tabular data and want to avoid S3 lookup issues
   * Body (FormData):
   *   - tabular: JSON string with { SEX, AGE, EDUCATION, CDR, MMSE, APGEN1, APGEN2 }
   *   - t1w_file: File (MRI scan)
   *   - explain: "true" | "false"
   * Returns: Same structure as prediction object
   */
  predictWithTabularData: async (tabularData: {
    SEX: number;
    AGE: number;
    EDUCATION: number;
    CDR: number;
    MMSE: number;
    APGEN1: number;
    APGEN2: number;
  }, file: File) => {
    const formData = new FormData();
    formData.append('tabular', JSON.stringify(tabularData));
    formData.append('t1w_file', file);
    formData.append('explain', 'true');

    const response = await axios.post(`${BASE_URL}/patient/register-and-predict`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });

    return response.data;
  },
};
