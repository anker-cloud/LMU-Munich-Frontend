#!/usr/bin/env python3
"""
Verify NIfTI Grad-CAM files on the backend

Run this script on the AWS backend to check if Grad-CAM NIfTI files are valid.

Usage:
    python3 verify_nifti_backend.py AAA107
"""

import sys
import os
import nibabel as nib
import numpy as np

def verify_nifti_file(patient_id, base_path="/path/to/s3-bucket"):
    """
    Verify that a patient's Grad-CAM NIfTI file is valid.

    Args:
        patient_id: Patient ID (e.g., "AAA107")
        base_path: Base path to S3 bucket or data storage
    """
    print(f"\n{'='*60}")
    print(f"Verifying Grad-CAM NIfTI for Patient: {patient_id}")
    print(f"{'='*60}\n")

    # File paths
    gradcam_path = os.path.join(base_path, patient_id, f"{patient_id}_gradcam.nii.gz")
    mri_path = os.path.join(base_path, patient_id, f"{patient_id}_t1w.nii.gz")

    # Check if files exist
    print("1. Checking file existence...")
    if not os.path.exists(gradcam_path):
        print(f"   ❌ Grad-CAM file NOT FOUND: {gradcam_path}")
        return False
    else:
        size_mb = os.path.getsize(gradcam_path) / (1024 * 1024)
        print(f"   ✓ Grad-CAM file exists: {gradcam_path}")
        print(f"   ✓ File size: {size_mb:.2f} MB")

    if not os.path.exists(mri_path):
        print(f"   ⚠️ MRI file NOT FOUND: {mri_path}")
        mri_vol = None
    else:
        print(f"   ✓ MRI file exists: {mri_path}")
        try:
            mri_vol = nib.load(mri_path)
            print(f"   ✓ MRI shape: {mri_vol.shape}")
        except Exception as e:
            print(f"   ❌ Failed to load MRI: {e}")
            mri_vol = None

    # Try to load Grad-CAM file
    print("\n2. Loading Grad-CAM NIfTI file...")
    try:
        gradcam_vol = nib.load(gradcam_path)
        print(f"   ✓ File loaded successfully")
    except Exception as e:
        print(f"   ❌ FAILED to load: {e}")
        return False

    # Check shape
    print("\n3. Checking volume shape...")
    try:
        shape = gradcam_vol.shape
        print(f"   ✓ Shape: {shape}")

        if len(shape) != 3:
            print(f"   ⚠️ WARNING: Expected 3D volume, got {len(shape)}D")

        if mri_vol and shape != mri_vol.shape[:3]:
            print(f"   ⚠️ WARNING: Shape doesn't match MRI shape: {mri_vol.shape[:3]}")
    except Exception as e:
        print(f"   ❌ FAILED to get shape: {e}")
        return False

    # Check affine matrix
    print("\n4. Checking affine transformation matrix...")
    try:
        affine = gradcam_vol.affine
        print(f"   ✓ Affine exists: {affine is not None}")
        print(f"   ✓ Affine shape: {affine.shape}")
        print(f"   Affine matrix:\n{affine}")

        # Check if affine is valid (not all zeros, not NaN)
        if np.all(affine == 0):
            print(f"   ❌ ERROR: Affine is all zeros!")
            return False

        if np.any(np.isnan(affine)):
            print(f"   ❌ ERROR: Affine contains NaN values!")
            return False

        # Check if it's just identity matrix (might be incorrect)
        if np.allclose(affine, np.eye(4)):
            print(f"   ⚠️ WARNING: Affine is identity matrix (might not be aligned to MRI)")

        if mri_vol and not np.allclose(affine, mri_vol.affine):
            print(f"   ⚠️ WARNING: Affine doesn't match MRI affine")
            print(f"   MRI affine:\n{mri_vol.affine}")
    except Exception as e:
        print(f"   ❌ FAILED to get affine: {e}")
        return False

    # Check header
    print("\n5. Checking NIfTI header...")
    try:
        header = gradcam_vol.header
        print(f"   ✓ Header exists: {header is not None}")
        print(f"   ✓ Data type: {header.get_data_dtype()}")
        print(f"   ✓ Dimensions: {header.get_data_shape()}")

        # Check data type
        dtype = header.get_data_dtype()
        if dtype not in [np.float32, np.float64]:
            print(f"   ⚠️ WARNING: Data type is {dtype}, expected float32")
    except Exception as e:
        print(f"   ❌ FAILED to get header: {e}")
        return False

    # Try to load data array
    print("\n6. Loading data array...")
    try:
        data = gradcam_vol.get_fdata()
        print(f"   ✓ Data loaded successfully")
        print(f"   ✓ Data shape: {data.shape}")
        print(f"   ✓ Data type: {data.dtype}")
        print(f"   ✓ Data range: [{data.min():.4f}, {data.max():.4f}]")
        print(f"   ✓ Non-zero voxels: {np.count_nonzero(data)} / {data.size}")

        # Check if all zeros
        if np.all(data == 0):
            print(f"   ⚠️ WARNING: All voxels are zero!")
    except Exception as e:
        print(f"   ❌ FAILED to load data: {e}")
        return False

    # Test mm2vox function (this is what fails in Niivue)
    print("\n7. Testing coordinate transformations...")
    try:
        # Test if we can compute voxel-to-mm and mm-to-voxel transforms
        test_vox = np.array([shape[0]//2, shape[1]//2, shape[2]//2, 1])
        test_mm = affine @ test_vox
        print(f"   ✓ Voxel-to-mm transform works")
        print(f"   Example: voxel {test_vox[:3]} → mm {test_mm[:3]}")

        # Compute inverse (mm-to-vox)
        affine_inv = np.linalg.inv(affine)
        test_vox_back = affine_inv @ test_mm
        print(f"   ✓ Mm-to-voxel transform works")
        print(f"   Example: mm {test_mm[:3]} → voxel {test_vox_back[:3]}")
    except Exception as e:
        print(f"   ❌ FAILED coordinate transforms: {e}")
        print(f"   This is likely why Niivue fails with 'mm2vox is not a function'")
        return False

    # Summary
    print(f"\n{'='*60}")
    print("✅ ALL CHECKS PASSED!")
    print(f"{'='*60}\n")
    print("The NIfTI file appears valid.")
    print("If Niivue still fails, the issue might be:")
    print("  1. CORS headers on the backend")
    print("  2. File corruption during download")
    print("  3. Niivue version incompatibility")
    print()

    return True


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 verify_nifti_backend.py <patient_id> [base_path]")
        print("Example: python3 verify_nifti_backend.py AAA107")
        sys.exit(1)

    patient_id = sys.argv[1]
    base_path = sys.argv[2] if len(sys.argv) > 2 else "/path/to/s3-bucket"

    # Update this path based on your backend setup
    if base_path == "/path/to/s3-bucket":
        print("⚠️  Please update the base_path in the script or pass it as argument")
        print("   Common paths:")
        print("   - /tmp/s3_cache")
        print("   - /var/lib/lmu-backend/data")
        print("   - ~/lmu-data")
        print()

    success = verify_nifti_file(patient_id, base_path)
    sys.exit(0 if success else 1)
