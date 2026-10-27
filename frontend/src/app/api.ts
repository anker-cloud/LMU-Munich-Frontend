import axios from 'axios';

// Backend API base URL — set VITE_API_URL in .env to override
const BASE_URL = import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? '/api' : 'http://35.159.51.22:8000');

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

    // Only include fields the user actually filled in.
    // Blank → omitted so the backend treats them as missing, not zero.
    // If every field is blank, skip tabular entirely so the MRI-only model is used.
    const tabularData: Record<string, number> = {};
    const fieldMap: [string, string][] = [
      ['SEX', patientData.SEX], ['AGE', patientData.AGE],
      ['EDUCATION', patientData.EDUCATION], ['CDR', patientData.CDR],
      ['MMSE', patientData.MMSE], ['APGEN1', patientData.APGEN1],
      ['APGEN2', patientData.APGEN2],
    ];
    for (const [key, val] of fieldMap) {
      if (val !== '' && val !== null && val !== undefined) {
        tabularData[key] = Number(val);
      }
    }

    if (Object.keys(tabularData).length > 0) {
      formData.append('tabular', JSON.stringify(tabularData));
    }
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

};
