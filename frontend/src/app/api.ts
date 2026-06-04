import axios from 'axios';

// Use proxy in development to avoid CORS issues
const BASE_URL = import.meta.env.DEV ? '/api' : 'http://35.159.51.22:8000';

export const api = {
  // Get list of all patient IDs
  getPatients: async () => {
    const response = await axios.get(`${BASE_URL}/patients`);
    return response.data.patients;
  },

  // Get patient record (includes last_prediction if available)
  getPatientRecord: async (patientId: string) => {
    const response = await axios.get(`${BASE_URL}/patient/${patientId}`);
    return response.data;
  },

  // Predict for a patient - returns full patient info, diagnosis, SHAP, and Grad-CAM
  predictPatient: async (patientId: string, file: File) => {
    const formData = new FormData();
    formData.append('t1w_file', file);
    formData.append('explain', 'true');

    const response = await axios.post(`${BASE_URL}/patient/${patientId}/predict`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  // Register new patient and predict - returns full patient info, diagnosis, SHAP, and Grad-CAM
  registerAndPredict: async (patientData: {
    PATIENT_ID: string;
    SEX: string;
    AGE: string;
    EDUCATION: string;
    CDR: string;
    MMSE: string;
    APGEN1: string;
    APGEN2: string;
  }, file: File) => {
    const formData = new FormData();

    // Backend expects a JSON string in 'tabular' field with numeric values
    const tabularData = {
      SEX: Number(patientData.SEX),
      AGE: Number(patientData.AGE),
      EDUCATION: Number(patientData.EDUCATION),
      CDR: Number(patientData.CDR),
      MMSE: Number(patientData.MMSE),
      APGEN1: Number(patientData.APGEN1),
      APGEN2: Number(patientData.APGEN2)
    };

    console.log('Tabular data being sent:', tabularData);
    console.log('File being uploaded:', file.name, file.size, file.type);

    formData.append('tabular', JSON.stringify(tabularData));
    formData.append('t1w_file', file);
    formData.append('explain', 'true');

    console.log('FormData contents:');
    for (let [key, value] of formData.entries()) {
      console.log(key, value);
    }

    const response = await axios.post(`${BASE_URL}/patient/register-and-predict`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },
};