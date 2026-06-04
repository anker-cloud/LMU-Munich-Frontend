"""
ki-alz FastAPI Backend
-----------------------
Start the server:
    python -m uvicorn api:app --host 0.0.0.0 --port 8000 --reload

Interactive docs (auto-generated):
    http://localhost:8000/docs

Endpoints
---------
POST /patient/register-and-predict
    New patient: upload MRI + tabular JSON → get patient_id + prediction

POST /patient/{patient_id}/predict
    Existing patient: upload new MRI → get prediction (tabular from registry)

GET  /patient/{patient_id}
    Fetch stored patient record

GET  /patients
    List all registered patient IDs

GET  /health
    Health check
"""

import os
import json
import shutil
import tempfile
from typing import Optional, List

from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from net_utils.patient_id import lookup_patient, list_patients, update_patient_mri

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------

app = FastAPI(
    title="ki-alz Inference API",
    description="Multimodal dementia differential diagnosis pipeline",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],     # tighten in production
    allow_methods=["*"],
    allow_headers=["*"],
)

# Temp directory for uploaded MRI files
UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)


# ---------------------------------------------------------------------------
# Response schema
# ---------------------------------------------------------------------------

class SHAPFeature(BaseModel):
    feature: str
    value:   float
    shap:    float

class SHAPResult(BaseModel):
    features:   List[SHAPFeature]
    chart_path: Optional[str] = None

class GradCAMResult(BaseModel):
    heatmap_path: str
    heatmap_png:  Optional[str] = None

class PatientInfo(BaseModel):
    age:       int
    sex:       str
    education: int
    cdr:       float
    mmse:      int
    apgen1:    int
    apgen2:    int

class PredictionResponse(BaseModel):
    patient_id:    str
    model_used:    str
    prediction:    str
    probabilities: dict
    patient_info:  Optional[PatientInfo]   = Field(None, description="Clinical input values for display")
    ad_stage:      Optional[str]           = Field(None, description="Mild/Moderate/Severe — only if prediction is AD")
    shap:          Optional[SHAPResult]    = Field(None, description="SHAP feature importances + S3 chart URL")
    gradcam:       Optional[GradCAMResult] = Field(None, description="Grad-CAM++ heatmap NIfTI + PNG S3 URLs")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _save_upload(file: UploadFile, patient_id: str, label: str) -> str:
    """Save an uploaded file to the uploads directory. Returns saved path."""
    name = file.filename or ""
    if name.endswith(".nii.gz"):
        ext = ".nii.gz"
    else:
        ext = os.path.splitext(name)[-1] or ".nii.gz"
    filename = f"{patient_id}_{label}{ext}"
    dest     = os.path.join(UPLOAD_DIR, filename)
    with open(dest, "wb") as f:
        shutil.copyfileobj(file.file, f)
    return dest


def _handle_mri_upload(file: UploadFile, patient_id: str, label: str) -> tuple:
    """
    Save upload and convert DICOM ZIP to NIfTI if needed.
    Returns (nifti_path, original_zip_path_or_None).
    """
    from net_utils.dicom_utils import is_dicom_zip, convert_dicom_zip_to_nifti

    saved_path = _save_upload(file, patient_id, label)

    if is_dicom_zip(file.filename or ""):
        print(f"[API] DICOM ZIP detected — converting to NIfTI")
        dicom_zip  = saved_path
        nifti_dir  = os.path.join(UPLOAD_DIR, "dicom_converted")
        nifti_path = convert_dicom_zip_to_nifti(dicom_zip, nifti_dir)
        return nifti_path, dicom_zip

    return saved_path, None


def _get_stem(file: Optional[UploadFile]) -> str:
    """Extract filename stem (without extension) for use in output filenames."""
    if file is None:
        return "scan"
    name = file.filename or "scan"
    if name.endswith(".nii.gz"):
        return name[:-7]
    return os.path.splitext(name)[0]


def _format_response(raw: dict) -> dict:
    """
    Convert inference result to JSON-serialisable dict.
    Drops the raw numpy heatmap array (too large for JSON) — only path is returned.
    """
    result = {k: v for k, v in raw.items() if k != "gradcam"}

    if raw.get("gradcam"):
        result["gradcam"] = {
            "heatmap_path": raw["gradcam"].get("heatmap_path"),
            "heatmap_png":  raw["gradcam"].get("heatmap_png"),
        }

    return result


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/patients")
def get_all_patients():
    """Return all registered patient IDs."""
    return {"patients": list_patients()}


@app.get("/patient/{patient_id}")
def get_patient(patient_id: str):
    """
    Fetch all available data for a patient directly from S3.
    Returns the list of files in their S3 folder (with presigned download URLs)
    and the stored prediction result if it exists.
    """
    from net_utils.s3_utils import list_patient_files, get_patient_result_json

    files = list_patient_files(patient_id)
    if not files:
        raise HTTPException(status_code=404, detail=f"Patient '{patient_id}' not found in S3.")

    prediction = get_patient_result_json(patient_id)

    return JSONResponse(content={
        "patient_id": patient_id,
        "file_count": len(files),
        "files":      files,
        "prediction": prediction,
    })


@app.post("/patient/register-and-predict", response_model=PredictionResponse)
async def register_and_predict(
    tabular: str       = Form(..., description='JSON string: {"SEX":1,"AGE":72,"EDUCATION":12,"CDR":1.0,"MMSE":23,"APGEN1":3,"APGEN2":4}'),
    t1w_file:   Optional[UploadFile] = File(None, description="T1w MRI scan (.nii / .nii.gz / .dcm)"),
    flair_file: Optional[UploadFile] = File(None, description="FLAIR MRI scan (.nii / .nii.gz / .dcm)"),
    explain:    bool   = Form(True,  description="Run SHAP + Grad-CAM++ explainability"),
):
    """
    **New patient flow.**

    - Parses tabular clinical data from JSON form field
    - Saves uploaded MRI file(s) to server
    - Assigns a new anonymised patient ID (e.g. AAA001)
    - Runs inference with the best available model
    - Returns prediction, probabilities, AD stage (if applicable), SHAP and Grad-CAM++
    """
    # Parse tabular JSON
    try:
        tabular_data = json.loads(tabular)
    except json.JSONDecodeError:
        raise HTTPException(status_code=422, detail="'tabular' must be a valid JSON string.")

    if t1w_file is None and flair_file is None:
        raise HTTPException(status_code=422, detail="At least one MRI file (t1w_file or flair_file) is required.")

    # Import here to avoid loading models at import time
    from inference import register_and_predict as _register_predict

    # Extract original filename stem for output naming
    original_stem = _get_stem(t1w_file or flair_file)

    # Temporarily save MRI files with a placeholder ID — real ID assigned inside
    tmp_id          = tempfile.mktemp(prefix="tmp_", dir=UPLOAD_DIR)
    t1w_dicom_zip   = None
    flair_dicom_zip = None
    t1w_path        = None
    flair_path      = None
    if t1w_file:
        t1w_path, t1w_dicom_zip   = _handle_mri_upload(t1w_file,   tmp_id, "t1w")
    if flair_file:
        flair_path, flair_dicom_zip = _handle_mri_upload(flair_file, tmp_id, "flair")

    try:
        raw = _register_predict(
            tabular_data  = tabular_data,
            t1w_path      = t1w_path,
            flair_path    = flair_path,
            explain       = explain,
            original_stem = original_stem,
        )
    except Exception as e:
        # Clean up temp files on failure
        if t1w_path and os.path.exists(t1w_path):
            os.remove(t1w_path)
        if flair_path and os.path.exists(flair_path):
            os.remove(flair_path)
        raise HTTPException(status_code=500, detail=str(e))

    # Rename uploaded files to use the real patient_id and update registry
    pid = raw.get("patient_id", "unknown")
    new_t1w_path   = None
    new_flair_path = None
    if t1w_path and os.path.exists(t1w_path):
        new_t1w_path = os.path.join(UPLOAD_DIR, f"{pid}_t1w.nii.gz")
        os.rename(t1w_path, new_t1w_path)
    if flair_path and os.path.exists(flair_path):
        new_flair_path = os.path.join(UPLOAD_DIR, f"{pid}_flair.nii.gz")
        os.rename(flair_path, new_flair_path)
    update_patient_mri(pid, t1w_path=new_t1w_path, flair_path=new_flair_path)

    # Upload MRI files to s3://{bucket}/{patient_id}/
    try:
        from net_utils.s3_utils import upload_to_patient_folder
        if new_t1w_path:
            upload_to_patient_folder(new_t1w_path, pid, f"{pid}_t1w.nii.gz")
        if new_flair_path:
            upload_to_patient_folder(new_flair_path, pid, f"{pid}_flair.nii.gz")
        # Upload original DICOM ZIPs if provided
        if t1w_dicom_zip and os.path.exists(t1w_dicom_zip):
            upload_to_patient_folder(t1w_dicom_zip, pid, f"{pid}_t1w_dicom.zip")
        if flair_dicom_zip and os.path.exists(flair_dicom_zip):
            upload_to_patient_folder(flair_dicom_zip, pid, f"{pid}_flair_dicom.zip")
    except Exception:
        pass

    formatted = _format_response(raw)

    # Persist prediction result to S3 so it survives registry resets
    try:
        from net_utils.s3_utils import upload_result_json
        upload_result_json(pid, {**formatted, "patient_id": pid})
    except Exception as e:
        print(f"[API] Failed to save result JSON for {pid}: {e}")

    return JSONResponse(content=formatted)


@app.post("/patient/{patient_id}/predict", response_model=PredictionResponse)
async def predict_existing_patient(
    patient_id: str,
    t1w_file:   Optional[UploadFile] = File(None, description="New T1w MRI scan"),
    flair_file: Optional[UploadFile] = File(None, description="New FLAIR MRI scan"),
    explain:    bool = Form(True, description="Run SHAP + Grad-CAM++ explainability"),
):
    """
    **Existing patient — new MRI upload.**

    - Fetches stored tabular data for this patient_id
    - Saves newly uploaded MRI file(s)
    - Runs inference and returns updated prediction
    """
    # Verify patient exists — check S3 folder (works even if local registry was reset)
    from net_utils.s3_utils import list_patient_files
    if not list_patient_files(patient_id):
        raise HTTPException(status_code=404, detail=f"Patient '{patient_id}' not found in S3.")

    if t1w_file is None and flair_file is None:
        raise HTTPException(status_code=422, detail="At least one MRI file (t1w_file or flair_file) is required.")

    from inference import predict_for_patient as _predict

    original_stem = _get_stem(t1w_file or flair_file)
    t1w_path   = _save_upload(t1w_file,   patient_id, "t1w")   if t1w_file   else None
    flair_path = _save_upload(flair_file, patient_id, "flair") if flair_file else None

    try:
        raw = _predict(
            patient_id    = patient_id,
            t1w_path      = t1w_path,
            flair_path    = flair_path,
            explain       = explain,
            original_stem = original_stem,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    formatted = _format_response(raw)

    # Persist prediction result to S3 so it survives registry resets
    try:
        from net_utils.s3_utils import upload_result_json
        upload_result_json(patient_id, {**formatted, "patient_id": patient_id})
    except Exception as e:
        print(f"[API] Failed to save result JSON for {patient_id}: {e}")

    return JSONResponse(content=formatted)


# ---------------------------------------------------------------------------
# Dev runner
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api:app", host="0.0.0.0", port=8000, reload=True)