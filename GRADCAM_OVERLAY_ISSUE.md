# GradCAM Overlay Issue - Backend Fix Required

**Date:** June 17, 2026  
**Status:** ⚠️ BACKEND BUG - Needs Fix

---

## Problem

The 3D brain viewer is loading but the GradCAM overlay heatmap is not visible.

**Symptoms:**
```
[MRIViewer3D] ✓✓✓ Overlay loaded successfully! Volumes: 2
[MRIViewer3D] Overlay volume dims: undefined
[MRIViewer3D] ❌ OVERLAY HAS NO DIMENSIONS - File may be corrupted or empty!
```

---

## Root Cause

The backend is generating `/api/patient/AAA114/file/AAA114_gradcam.nii.gz` but the file has **invalid or missing dimension information** in the NIfTI header.

**Evidence:**
- File exists and has data (gzipped binary)
- Niivue successfully loads it (2 volumes total)
- BUT: `overlayVol.dims` is `undefined`
- This means the NIfTI header is malformed or missing dimension metadata

---

## What's Working

✅ Base MRI loads correctly: `dims: [3, 192, 256, 256]`  
✅ Frontend code is correct (implements all backend specs)  
✅ Heatmap PNG works: `/api/patient/AAA114/file/AAA114_heatmap.png` (1265x1502 PNG)  
✅ Overlay file exists and has data

---

## What's Broken

❌ GradCAM overlay NIfTI has no readable dimensions  
❌ Backend NIfTI generation is not creating valid headers  
❌ 3D overlay visualization cannot work without valid dimensions

---

## Backend Fix Required

The backend must fix the GradCAM NIfTI file generation to ensure:

### 1. Valid NIfTI Header
```python
# Example using nibabel:
import nibabel as nib

# Load base MRI to get header template
base_img = nib.load('patient_t1w.nii.gz')
base_header = base_img.header
base_affine = base_img.affine

# Create overlay with SAME header and affine
overlay_data = generate_gradcam_heatmap()  # Your GradCAM output
overlay_img = nib.Nifti1Image(overlay_data, affine=base_affine, header=base_header)

# Verify dimensions match
assert overlay_img.shape == base_img.shape

# Save
nib.save(overlay_img, 'patient_gradcam.nii.gz')
```

### 2. Dimension Requirements
- **MUST** have same dimensions as base MRI: `[3, 192, 256, 256]`
- **MUST** have same affine matrix as base MRI
- **MUST** have valid NIfTI header with all required fields

### 3. Verification
```python
# After generation, verify the file is readable:
test_img = nib.load('patient_gradcam.nii.gz')
print(f"Overlay dims: {test_img.shape}")
print(f"Overlay affine:\n{test_img.affine}")
print(f"Data range: {test_img.get_fdata().min()} to {test_img.get_fdata().max()}")

# Should output:
# Overlay dims: (192, 256, 256)  # or (3, 192, 256, 256) with time dimension
# Overlay affine: <4x4 matrix matching base MRI>
# Data range: 0.0 to 1.0
```

---

## Temporary Workaround

The frontend can show the 2D heatmap PNG as a fallback when the 3D overlay fails.

---

## Files to Check

**Backend:**
- Look for GradCAM generation code
- Search for `gradcam.nii.gz` or `_gradcam.nii` file creation
- Check if using nibabel, SimpleITK, or custom NIfTI writer
- Verify the affine matrix and header are copied from base MRI

---

## Expected Result After Fix

```
[MRIViewer3D] Overlay volume dims: [3, 192, 256, 256]  # ✅ Valid!
[MRIViewer3D] ✅ Overlay dimensions match base MRI - alignment should be correct
```

The red/orange heatmap overlay will then be visible on the 3D brain.

---

**Priority:** HIGH - Core diagnostic feature not working  
**Component:** Backend NIfTI Generation  
**Action Required:** Fix GradCAM overlay NIfTI file generation
