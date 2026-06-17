# Backend Changes

**Last Updated:** June 17, 2026  
**Status:** ✅ Complete

---

## Overview

Backend changes focused on fixing data retrieval issues and generating properly aligned NIfTI files for 3D brain visualization.

---

## 1. Fixed Patient Data Retrieval Bug (June 16, 2026)

### Problem
The `/patient/{patient_id}/predict` endpoint was failing with "No tabular data found" error for existing patients.

### Root Cause
In `backend/inference.py`, the code was looking for the wrong key in S3 JSON:
```python
# WRONG - this key doesn't exist:
tabular_data = s3_json.get("tabular")

# CORRECT - actual structure in S3:
tabular_data = s3_json["prediction"]["patient_info"]
```

### Solution
Fixed the S3 JSON parsing to extract `patient_info` from the correct nested location:

```python
# backend/inference.py - Line ~150
def load_tabular_from_s3(patient_id: str):
    s3_json = get_patient_s3_json(patient_id)
    
    # Extract from correct location
    if "prediction" in s3_json and "patient_info" in s3_json["prediction"]:
        patient_info = s3_json["prediction"]["patient_info"]
        
        # Transform to model input format
        tabular_data = {
            "SEX": 1 if patient_info.get("sex") == "Male" else 2,
            "AGE": float(patient_info.get("age", 0)),
            "EDUCATION": float(patient_info.get("education", 0)),
            "CDR": float(patient_info.get("cdr", 0)),
            "MMSE": float(patient_info.get("mmse", 0)),
            "APGEN1": float(patient_info.get("apgen1", 0)),
            "APGEN2": float(patient_info.get("apgen2", 0))
        }
        return tabular_data
```

### Impact
- ✅ Existing patients can now run new scans without errors
- ✅ Frontend no longer needs to send redundant clinical data
- ✅ Proper separation of concerns restored

---

## 2. GradCAM NIfTI Generation (June 16, 2026)

### Enhancement
Backend now generates properly aligned NIfTI files for 3D visualization:

**Generated Files:**
1. `{patient_id}_t1w.nii.gz` - Base brain MRI (full resolution)
2. `{patient_id}_gradcam.nii.gz` - GradCAM++ heatmap overlay
3. `{patient_id}_heatmap.png` - 2D heatmap (backward compatibility)

**Critical Requirements:**
- Both NIfTI files share **identical affine matrices** and **dimensions**
- Overlay values normalized to [0, 1] range
- Background voxels (near-zero activation) properly set to 0

### API Response Format
The `/patient/{patient_id}/predict` endpoint now returns:

```json
{
  "patient_id": "AAA112",
  "prediction": "VASC",
  "probabilities": {...},
  "gradcam": {
    "heatmap_png": "http://.../heatmap.png",           // Legacy 2D
    "mri_nifti_url": "http://.../t1w.nii.gz",          // 3D base MRI
    "overlay_nifti_url": "http://.../gradcam.nii.gz"   // 3D overlay
  }
}
```

### Technical Specifications

**Overlay Calibration:**
- `cal_min: 0.1` - Hides near-zero values (transparent background)
- `cal_max: 1.0` - Maximum activation value
- `opacity: 0.5` - Semi-transparent overlay

**Colormap:**
- Uses "hot" colormap (black → red → orange → yellow)
- Shows activation intensity gradient
- Colorbar enabled for reference scale

---

## 3. File Serving Endpoint (June 16, 2026)

### New Endpoint
```
GET /patient/{patient_id}/file/{filename}
```

**Purpose:** Stream large NIfTI files directly without presigned URLs

**Supported Files:**
- `{patient_id}_t1w.nii.gz` - Brain MRI
- `{patient_id}_flair.nii.gz` - FLAIR scan (if available)
- `{patient_id}_gradcam.nii.gz` - Heatmap overlay
- `{patient_id}_heatmap.png` - 2D heatmap
- `{patient_id}_shap.png` - SHAP chart

**Benefits:**
- ✅ No URL expiration issues (no presigned URLs)
- ✅ Better caching control
- ✅ Direct file streaming from S3
- ✅ Automatic cache-busting via query params

---

## Files Modified

### backend/inference.py
**Changes:**
1. Fixed `load_tabular_from_s3()` function to parse correct JSON structure
2. Added NIfTI generation for base MRI and GradCAM overlay
3. Ensured affine matrix alignment between volumes

### backend/main.py (or equivalent)
**Changes:**
1. Added `/patient/{patient_id}/file/{filename}` endpoint
2. Implemented S3 streaming with proper Content-Type headers
3. Added cache control headers

---

## Testing

### Test Scenarios
1. ✅ New patient registration with MRI upload
2. ✅ Existing patient running new scan (no "tabular data" error)
3. ✅ NIfTI files properly aligned (no offset/rotation issues)
4. ✅ GradCAM overlay visible and transparent background
5. ✅ File serving endpoint returns correct files
6. ✅ Frontend 3D viewer loads both volumes successfully

### Validation
```python
# Verify affine matrices match
assert np.allclose(base_mri.affine, overlay.affine)
assert base_mri.shape == overlay.shape

# Verify overlay value range
assert overlay.get_fdata().min() >= 0
assert overlay.get_fdata().max() <= 1
```

---

## API Contract Summary

### `/patient/{patient_id}/predict`
**Method:** POST  
**Body:** 
- `t1w_file`: MRI file (multipart/form-data)
- `explain`: "true" (generate GradCAM)

**Response:**
```json
{
  "patient_id": "string",
  "prediction": "string",
  "probabilities": {"diagnosis": float},
  "patient_info": {...},
  "gradcam": {
    "heatmap_png": "url",
    "mri_nifti_url": "url",
    "overlay_nifti_url": "url"
  },
  "shap": {
    "features": [...],
    "chart_path": "url"
  }
}
```

### `/patient/{patient_id}/file/{filename}`
**Method:** GET  
**Response:** Binary file stream

---

## Benefits

**Architecture:**
- ✅ Backend properly manages its own data retrieval
- ✅ No redundant data passing from frontend
- ✅ Proper separation of concerns

**User Experience:**
- ✅ 3D brain visualization with aligned overlays
- ✅ No "tabular data" errors for existing patients
- ✅ Faster workflow (no extra API calls)

**Maintainability:**
- ✅ Cleaner code with proper JSON parsing
- ✅ Better error handling
- ✅ Comprehensive logging

---

**Status:** ✅ Complete and Production-Ready  
**Last Updated:** June 17, 2026
