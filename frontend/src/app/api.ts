// import axios from 'axios';

// const API_BASE_URL = 'http://localhost:8000';

// export const api = {
//   // GET /patient/list (Assuming this exists for your dropdown)
//   getPatients: async () => {
//     const response = await axios.get(`${API_BASE_URL}/patient/list`);
//     return response.data;
//   },

//   // GET /patient/{id} — Retrieve record for Dashboard
//   getPatientRecord: async (id: string) => {
//     const response = await axios.get(`${API_BASE_URL}/patient/${id}`);
//     return response.data;
//   },

//   // POST /patient/register-and-predict — New Analysis
//   registerAndPredict: async (file: File) => {
//     const formData = new FormData();
//     formData.append('file', file);
//     const response = await axios.post(`${API_BASE_URL}/patient/register-and-predict`, formData, {
//       headers: { 'Content-Type': 'multipart/form-data' }
//     });
//     return response.data;
//   },

//   // POST /patient/{id}/predict — Existing Patient + New MRI
//   predictExisting: async (id: string, file: File) => {
//     const formData = new FormData();
//     formData.append('file', file);
//     const response = await axios.post(`${API_BASE_URL}/patient/${id}/predict`, formData, {
//       headers: { 'Content-Type': 'multipart/form-data' }
//     });
//     return response.data;
//   }
// };




import axios from 'axios';

const API_BASE_URL = 'http://localhost:8000';

export const api = {
  // GET /patient/list — Populates the "Existing Records" dropdown
  getPatients: async () => {
    const response = await axios.get(`${API_BASE_URL}/patient/list`);
    return response.data;
  },

  // GET /patient/{id} — Retrieve record for Dashboard
  getPatientRecord: async (id: string) => {
    const response = await axios.get(`${API_BASE_URL}/patient/${id}`);
    return response.data;
  },

  // POST /patient/register-and-predict — Upload + Clinical Metadata
  registerAndPredict: async (file: File, metadata: any) => {
    const formData = new FormData();
    formData.append('file', file);
    // Clinical fields from your image
    formData.append('metadata', JSON.stringify(metadata)); 

    const response = await axios.post(`${API_BASE_URL}/patient/register-and-predict`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    return response.data;
  }
};