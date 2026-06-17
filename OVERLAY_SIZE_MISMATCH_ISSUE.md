# GradCAM Overlay Size/Dimension Mismatch Issue

**Date:** June 17, 2026  
**Priority:** 🔴 CRITICAL - Backend Fix Required  
**Status:** Root cause identified

---

## The Problem

The GradCAM overlay appears **much larger than the brain** - extending far beyond the brain boundaries in all directions. This makes the visualization unusable.

**Visual Evidence:**
- Brain MRI: Proper size, centered, well-defined boundaries
- Overlay: Huge red blob extending beyond screen edges
- Result: Overlay doesn't align with brain anatomy

---

## Root Cause

The backend-generated `{patient_id}_gradcam.nii.gz` file has **invalid dimension information** in the NIfTI header.

**Evidence from Console:**
```javascript
[MRIViewer3D]   Volume 0: {dims: [3, 192, 256, 256], ...}  // Base MRI - CORRECT ✅
[MRIViewer3D]   Volume 1: {dims: undefined, ...}           // Overlay - BROKEN ❌
```

When Niivue loads a NIfTI file with `dims: undefined`, it **cannot determine the proper spatial dimensions or voxel spacing**, resulting in:
1. Wrong physical size
2. Wrong scale/zoom
3. Wrong alignment with base MRI
4. Overlay rendered at arbitrary/incorrect dimensions

---

## Why This Happens

### NIfTI Files Store Two Types of Information:

#### 1. **Dimensions (dim)** - Voxel grid size
```
dims: [3, 192, 256, 256]
      ↑   ↑    ↑    ↑
      |   |    |    └─ Z-axis voxels (depth)
      |   |    └────── Y-axis voxels (height)
      |   └─────────── X-axis voxels (width)
      └─────────────── Number of dimensions
```

#### 2. **Affine Matrix** - Physical space mapping
```
Affine matrix (4x4) defines:
- Voxel spacing (mm per voxel)
- Rotation/orientation
- Translation (position in space)
- Scale factors

Example:
[-1.0   0     0    90]   // X: -1mm per voxel, centered at 90mm
[ 0     1.0   0   -90]   // Y: +1mm per voxel, centered at -90mm
[ 0     0     1.0 -90]   // Z: +1mm per voxel, centered at -90mm
[ 0     0     0    1 ]   // Homogeneous coordinate
```

### The Backend Bug:

The backend is creating a GradCAM NIfTI file where:
- ✅ Raw data exists (14.8 MB file)
- ✅ Header has some bytes
- ❌ **Dimension field is unreadable** (Niivue gets `undefined`)
- ❌ **Affine matrix is missing or invalid**

Without this information, Niivue has no way to know:
- How many voxels in each dimension
- How big each voxel should be in physical space
- Where to position the overlay relative to the brain

**Result:** Overlay rendered at wrong size/scale/position

---

## The Fix - Backend Must Regenerate Overlay

### ✅ CORRECT Way (using nibabel):

```python
import nibabel as nib
import numpy as np

# Step 1: Load base MRI to get header and affine
base_img = nib.load(f'{patient_id}_t1w.nii.gz')
base_affine = base_img.affine.copy()  # CRITICAL: Copy affine matrix
base_shape = base_img.shape           # CRITICAL: Get exact dimensions
base_header = base_img.header.copy()  # CRITICAL: Copy full header

print(f"Base MRI shape: {base_shape}")
print(f"Base MRI affine:\n{base_affine}")

# Step 2: Generate GradCAM heatmap data
gradcam_data = generate_gradcam_heatmap(...)  # Your existing code
# Returns numpy array with shape (192, 256, 256) or (3, 192, 256, 256)

# Step 3: CRITICAL - Ensure exact same shape
if gradcam_data.shape != base_shape:
    print(f"ERROR: Shape mismatch! {gradcam_data.shape} vs {base_shape}")
    # Resize/resample gradcam_data to match base_shape
    from scipy.ndimage import zoom
    zoom_factors = [b/g for b, g in zip(base_shape, gradcam_data.shape)]
    gradcam_data = zoom(gradcam_data, zoom_factors, order=1)
    print(f"Resampled to: {gradcam_data.shape}")

assert gradcam_data.shape == base_shape, "Shape still doesn't match!"

# Step 4: Create NIfTI image with EXACT SAME header and affine
gradcam_img = nib.Nifti1Image(
    gradcam_data.astype(np.float32),  # Data
    affine=base_affine,               # SAME affine as base
    header=base_header                # SAME header as base
)

# Step 5: Verify dimensions are set correctly
print(f"✓ GradCAM shape: {gradcam_img.shape}")
print(f"✓ GradCAM header dim: {gradcam_img.header['dim']}")
print(f"✓ GradCAM affine:\n{gradcam_img.affine}")

assert gradcam_img.shape == base_shape, "Created image has wrong shape!"
assert np.allclose(gradcam_img.affine, base_affine), "Affine doesn't match!"

# Step 6: Save with compression
nib.save(gradcam_img, f'{patient_id}_gradcam.nii.gz')
print(f"✓ Saved {patient_id}_gradcam.nii.gz")

# Step 7: VERIFY saved file is readable
verify_img = nib.load(f'{patient_id}_gradcam.nii.gz')
print(f"✓ Verification - shape: {verify_img.shape}")
print(f"✓ Verification - dims: {verify_img.header['dim']}")
assert verify_img.shape == base_shape, "Saved file dimensions corrupted!"
print("✅ GradCAM NIfTI file is valid and aligned!")
```

### ❌ WRONG Way (what's probably happening now):

```python
# DON'T DO THIS:
import gzip

# Manually constructing header - ERROR PRONE!
header = bytearray(348)
# ... manually setting header bytes ...
# Missing or incorrect dim values
# Missing or incorrect affine matrix

with gzip.open(f'{patient_id}_gradcam.nii.gz', 'wb') as f:
    f.write(header)  # Incomplete/invalid header
    f.write(data)    # Data is fine, but header is broken
```

---

## Verification After Fix

### Test Script:

```python
import nibabel as nib
import numpy as np

patient_id = "AAA116"

# Load both files
base = nib.load(f'{patient_id}_t1w.nii.gz')
overlay = nib.load(f'{patient_id}_gradcam.nii.gz')

# Test 1: Dimensions must match EXACTLY
print(f"Base shape: {base.shape}")
print(f"Overlay shape: {overlay.shape}")
assert overlay.shape == base.shape, "❌ FAIL: Shapes don't match!"
print("✅ PASS: Shapes match")

# Test 2: Affine matrices must match (within floating point tolerance)
print(f"Base affine:\n{base.affine}")
print(f"Overlay affine:\n{overlay.affine}")
assert np.allclose(base.affine, overlay.affine, rtol=1e-5), "❌ FAIL: Affines don't match!"
print("✅ PASS: Affines match")

# Test 3: Header dim field must be valid
print(f"Overlay header dim: {overlay.header['dim']}")
assert overlay.header['dim'][0] == len(overlay.shape), "❌ FAIL: Invalid dim field!"
print("✅ PASS: Header dim is valid")

# Test 4: Data range should be [0, 1]
data = overlay.get_fdata()
print(f"Data range: {data.min():.3f} to {data.max():.3f}")
assert 0 <= data.min() <= data.max() <= 1, "❌ FAIL: Data not normalized!"
print("✅ PASS: Data is normalized")

print("\n✅✅✅ ALL TESTS PASSED - Overlay is valid and aligned!")
```

### Expected Output After Fix:

```
Base shape: (192, 256, 256)
Overlay shape: (192, 256, 256)
✅ PASS: Shapes match

Base affine:
[[-1.0   0     0    90]
 [ 0     1.0   0   -90]
 [ 0     0     1.0 -90]
 [ 0     0     0    1 ]]
Overlay affine:
[[-1.0   0     0    90]
 [ 0     1.0   0   -90]
 [ 0     0     1.0 -90]
 [ 0     0     0    1 ]]
✅ PASS: Affines match

Overlay header dim: [3 192 256 256 1 1 1 1]
✅ PASS: Header dim is valid

Data range: 0.000 to 1.000
✅ PASS: Data is normalized

✅✅✅ ALL TESTS PASSED - Overlay is valid and aligned!
```

---

## Frontend After Backend Fix

Once backend generates valid NIfTI files, the frontend logs should show:

```
[MRIViewer3D] ✓✓✓ Successfully loaded 2 volume(s)
[MRIViewer3D] Volume 0: {dims: [3, 192, 256, 256], ...}  ✅ Base MRI
[MRIViewer3D] Volume 1: {dims: [3, 192, 256, 256], ...}  ✅ Overlay - FIXED!
[MRIViewer3D] ✅ Overlay dimensions match base MRI - alignment correct!
```

**Visual Result:**
- ✅ Overlay same size as brain
- ✅ Red/orange heatmap perfectly aligned with brain structures
- ✅ No oversized blob
- ✅ Professional medical imaging visualization

---

## Summary

**Problem:** Overlay too large, extends beyond brain  
**Root Cause:** Backend NIfTI file has invalid dimensions and affine matrix  
**Frontend Status:** Code is correct, waiting for backend fix  
**Backend Action:** Use `nibabel` to create overlay with EXACT SAME dimensions and affine as base MRI  

**This is NOT a frontend issue** - the frontend cannot fix malformed NIfTI files.

---

**Priority:** CRITICAL  
**Blocking:** 3D visualization feature  
**Action Required:** Backend developer must regenerate GradCAM NIfTI files using proper nibabel API
