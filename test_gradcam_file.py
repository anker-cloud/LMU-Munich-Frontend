#!/usr/bin/env python3
"""
Test script to verify GradCAM NIfTI file from backend S3
Downloads and inspects the file to diagnose heatmap visibility issues
"""

import requests
import nibabel as nib
import numpy as np
import tempfile
import os

# Test with patient AAA004
BACKEND_URL = "http://35.159.51.22:8000"
PATIENT_ID = "AAA004"

def test_gradcam_nifti():
    """Download and inspect the GradCAM NIfTI file"""

    print("=" * 60)
    print(f"Testing GradCAM file for patient: {PATIENT_ID}")
    print("=" * 60)

    # Get patient record to get presigned URL
    print("\n1. Fetching patient record...")
    response = requests.get(f"{BACKEND_URL}/patient/{PATIENT_ID}")

    if response.status_code != 200:
        print(f"❌ Failed to get patient record: {response.status_code}")
        print(response.text)
        return

    data = response.json()
    print(f"✓ Patient record retrieved")

    # Find gradcam file
    gradcam_file = None
    for file_obj in data.get('files', []):
        if 'gradcam' in file_obj['filename'].lower() and file_obj['filename'].endswith('.nii.gz'):
            gradcam_file = file_obj
            break

    if not gradcam_file:
        print("❌ No gradcam.nii.gz file found in patient record!")
        print("Available files:")
        for f in data.get('files', []):
            print(f"  - {f['filename']}")
        return

    print(f"\n2. Found GradCAM file: {gradcam_file['filename']}")
    print(f"   Size: {gradcam_file['size_bytes']:,} bytes")
    print(f"   URL: {gradcam_file['url'][:80]}...")

    # Download the file
    print("\n3. Downloading GradCAM NIfTI file...")
    gradcam_response = requests.get(gradcam_file['url'])

    if gradcam_response.status_code != 200:
        print(f"❌ Failed to download: {gradcam_response.status_code}")
        return

    print(f"✓ Downloaded {len(gradcam_response.content):,} bytes")

    # Save to temp file and load with nibabel
    print("\n4. Analyzing NIfTI file structure...")
    with tempfile.NamedTemporaryFile(suffix='.nii.gz', delete=False) as tmp:
        tmp.write(gradcam_response.content)
        tmp_path = tmp.name

    try:
        img = nib.load(tmp_path)
        data_array = img.get_fdata()

        print(f"✓ Successfully loaded NIfTI file")
        print()
        print("=" * 60)
        print("GRADCAM DATA ANALYSIS")
        print("=" * 60)
        print(f"Shape:              {data_array.shape}")
        print(f"Data type:          {data_array.dtype}")
        print(f"Total voxels:       {data_array.size:,}")
        print()
        print(f"Min value:          {np.min(data_array):.6f}")
        print(f"Max value:          {np.max(data_array):.6f}")
        print(f"Mean value:         {np.mean(data_array):.6f}")
        print(f"Median value:       {np.median(data_array):.6f}")
        print(f"Std deviation:      {np.std(data_array):.6f}")
        print()
        print(f"Non-zero voxels:    {np.count_nonzero(data_array):,}")
        print(f"% non-zero:         {100 * np.count_nonzero(data_array) / data_array.size:.4f}%")
        print()

        # Value distribution
        non_zero = data_array[data_array > 0]
        if len(non_zero) > 0:
            print(f"Non-zero min:       {np.min(non_zero):.6f}")
            print(f"Non-zero max:       {np.max(non_zero):.6f}")
            print(f"Non-zero mean:      {np.mean(non_zero):.6f}")
            print()

            # Percentiles
            print("Value percentiles (non-zero only):")
            for p in [10, 25, 50, 75, 90, 95, 99]:
                val = np.percentile(non_zero, p)
                print(f"  {p}th percentile:  {val:.6f}")
        else:
            print("⚠️  ALL VALUES ARE ZERO! Heatmap will be invisible.")

        print()
        print("=" * 60)
        print("DIAGNOSIS")
        print("=" * 60)

        # Diagnosis
        max_val = np.max(data_array)
        non_zero_pct = 100 * np.count_nonzero(data_array) / data_array.size

        if max_val == 0:
            print("❌ CRITICAL: All values are zero!")
            print("   → Backend did not generate GradCAM properly")
            print("   → Check backend logs for errors during prediction")
        elif max_val < 0.01:
            print("⚠️  WARNING: Max value is very low (< 0.01)")
            print("   → Heatmap will be barely visible even with cal_min=0")
            print("   → Backend should normalize/rescale GradCAM to [0, 1] range")
        elif max_val > 10:
            print("⚠️  WARNING: Values are not normalized (max > 10)")
            print("   → Backend should normalize GradCAM to [0, 1] range")
            print("   → Frontend expects values in [0, 1]")
        elif non_zero_pct < 0.01:
            print("⚠️  WARNING: Very few non-zero voxels (< 0.01%)")
            print("   → Heatmap will be very sparse")
            print("   → Check if GradCAM is focusing on tiny region only")
        else:
            print("✓ Values look reasonable!")
            print(f"  → Max: {max_val:.3f} (in expected [0, 1] range)")
            print(f"  → Non-zero: {non_zero_pct:.3f}% (reasonable coverage)")

            if max_val < 0.1:
                print()
                print("⚠️  However, max value is < 0.1")
                print("   → With frontend cal_min=0.05, only values > 0.05 show")
                print("   → Our fix (cal_min=0.0) should make this visible")

        print("=" * 60)

    finally:
        os.unlink(tmp_path)

if __name__ == "__main__":
    test_gradcam_nifti()
