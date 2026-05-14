# from fastapi import FastAPI, File, UploadFile, HTTPException
# from fastapi.middleware.cors import CORSMiddleware
# from typing import List, Optional
# import uuid

# app = FastAPI(title="NeuroAI Diagnostics Backend")

# # --- STEP 1: FIX CORS (Crucial for React connection) ---
# # This allows your frontend (localhost:5173) to talk to this backend
# app.add_middleware(
#     CORSMiddleware,
#     allow_origins=["http://localhost:5173"],
#     allow_credentials=True,
#     allow_methods=["*"],
#     allow_headers=["*"],
# )

# # --- STEP 2: MOCK DATABASE (For testing Ezra's registry) ---
# # In production, this would load from patient_registry.json
# mock_patients = {
#     "AAA001": {
#         "age": 68,
#         "gender": "Male",
#         "diagnosis": "Alzheimer's Disease",
#         "confidence": 92,
#         "description": "Evidence of significant hippocampal atrophy and cortical thinning.",
#         "heatmap_url": "https://placehold.co/600x400/1e293b/white?text=MRI+Heatmap+AAA001",
#         "shap_url": "https://placehold.co/600x400/1e293b/white?text=SHAP+Plot+AAA001"
#     },
#     "BBB002": {
#         "age": 75,
#         "gender": "Female",
#         "diagnosis": "Mild Cognitive Impairment",
#         "confidence": 78,
#         "description": "Early indicators of temporal lobe deterioration noted.",
#         "heatmap_url": "https://placehold.co/600x400/1e293b/white?text=MRI+Heatmap+BBB002",
#         "shap_url": "https://placehold.co/600x400/1e293b/white?text=SHAP+Plot+BBB002"
#     },
#     "CCC003": {
#         "age": 72,
#         "gender": "Female",
#         "diagnosis": "Normal / No Dementia detected",
#         "confidence": 95,
#         "description": "Brain volumes within expected ranges for age group.",
#         "heatmap_url": "https://placehold.co/600x400/1e293b/white?text=MRI+Heatmap+CCC003",
#         "shap_url": "https://placehold.co/600x400/1e293b/white?text=SHAP+Plot+CCC003"
#     }
# }

# # --- STEP 3: ENDPOINTS ---

# @app.get("/")
# async def root():
#     return {"status": "NeuroAI Backend Active"}

# # GET /patient/list — Populates the "Existing Records" dropdown
# @app.get("/patient/list")
# async def get_patient_list():
#     return list(mock_patients.keys())

# # GET /patient/{id} — Retrieves record for the Dashboard
# @app.get("/patient/{id}")
# async def get_patient(id: str): # MUST be lowercase 'str'
#     if id not in mock_patients:
#         raise HTTPException(status_code=404, detail="Patient not found")
#     return mock_patients[id]

# # POST /patient/register-and-predict — New Analysis
# @app.post("/patient/register-and-predict")
# async def register_and_predict(file: UploadFile = File(...)):
#     # Simulating Ezra's AI pipeline processing NIfTI/PNG files
#     new_id = f"PAT-{uuid.uuid4().hex[:5].upper()}"
    
#     # Mock result returned after "Analysis"
#     return {
#         "patient_id": new_id,
#         "age": 70, # Mock detected age
#         "gender": "Unknown",
#         "diagnosis": "Analysis Result (Mock Data)",
#         "confidence": 85,
#         "filename": file.filename
#     }

# # POST /patient/{id}/predict — Existing Patient + New MRI
# @app.post("/patient/{id}/predict")
# async def predict_existing(id: str, file: UploadFile = File(...)):
#     if id not in mock_patients:
#         raise HTTPException(status_code=404, detail="Patient not found")
        
#     return {
#         "patient_id": id,
#         "diagnosis": "Updated Diagnosis (Mock)",
#         "confidence": 89,
#         "filename": file.filename
#     }

# if __name__ == "__main__":
#     import uvicorn
#     uvicorn.run(app, host="0.0.0.0", port=8000)



from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Optional
import json
import uuid

app = FastAPI(title="NeuroAI Diagnostics Backend")

# --- STEP 1: ENABLE CORS ---
# Allows the React frontend (localhost:5173) to communicate with this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- STEP 2: MOCK DATABASE ---
# Updated with the clinical fields requested for the PatientInfo component
mock_patients = {
    "PAT-00142": {
        "patient_id": "PAT-00142",
        "age": 72,
        "gender": "Female",
        "education": 12,
        "cdr": 1.0,
        "mmse": 23,
        "apgen1": 3,
        "apgen2": 4,
        "diagnosis": "Alzheimer's Disease (Moderate Stage)",
        "confidence": 87
    },
    "PAT-00589": {
        "patient_id": "PAT-00589",
        "age": 65,
        "gender": "Male",
        "education": 16,
        "cdr": 0.5,
        "mmse": 27,
        "apgen1": 2,
        "apgen2": 3,
        "diagnosis": "Mild Cognitive Impairment",
        "confidence": 92
    },
    "PAT-00921": {
        "patient_id": "PAT-00921",
        "age": 80,
        "gender": "Female",
        "education": 10,
        "cdr": 0,
        "mmse": 29,
        "apgen1": 3,
        "apgen2": 3,
        "diagnosis": "Normal",
        "confidence": 98
    }
}

# --- STEP 3: ENDPOINTS ---

@app.get("/")
async def root():
    return {"status": "NeuroAI Backend Active"}

# GET /patient/list — Returns IDs for the IdentificationPage dropdown
@app.get("/patient/list")
async def get_patient_list():
    return list(mock_patients.keys())

# GET /patient/{id} — Returns full record for the Dashboard
@app.get("/patient/{id}")
async def get_patient(id: str): # lowercase 'str' is essential
    if id not in mock_patients:
        raise HTTPException(status_code=404, detail="Patient not found")
    return mock_patients[id]

# POST /patient/register-and-predict — Receives MRI + Form Metadata
@app.post("/patient/register-and-predict")
async def register_and_predict(
    file: UploadFile = File(...), 
    metadata: str = Form(...)
):
    try:
        # Parse the clinical metadata sent from the ProcessingPage form
        clinical_data = json.loads(metadata)
        
        # Generate a new unique ID for the session
        new_id = f"PAT-{uuid.uuid4().hex[:5].upper()}"
        
        # Mock AI Result merged with the clinical data provided by the user
        result = {
            "patient_id": new_id,
            "diagnosis": "Alzheimer's Disease (Probable)",
            "confidence": 88,
            "filename": file.filename,
            **clinical_data  # Merges AGE, SEX, MMSE, CDR, EDUCATION, etc.
        }
        
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid metadata format: {str(e)}")

# POST /patient/{id}/predict — Existing Patient with new MRI scan
@app.post("/patient/{id}/predict")
async def predict_existing(id: str, file: UploadFile = File(...)):
    if id not in mock_patients:
        raise HTTPException(status_code=404, detail="Patient not found")
        
    # Return the existing record updated with the new scan result
    record = mock_patients[id].copy()
    record["diagnosis"] = "Updated Diagnostic Result"
    record["confidence"] = 91
    return record

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)