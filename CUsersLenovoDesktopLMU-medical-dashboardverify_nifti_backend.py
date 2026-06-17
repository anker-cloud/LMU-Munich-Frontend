#!/usr/bin/env python3
"""Verify NIfTI file integrity for GradCAM overlays"""
import requests
import nibabel as nib
import numpy as np
import tempfile
import os

BACKEND_URL = "http://35.159.51.22:8000"

def check_patient_gradcam(patient_id):
    print(f"\n{'='*60}")
    print(f"Checking patient: {patient_id}")
    print('='*60)
    
    gradcam_url = f"{BACKEND_URL}/patient/{patient_id}/file/{patient_id}_gradcam.nii.gz"
    
    try:
        response = requests.get(gradcam_url, timeout=10)
        if response.status_code != 200:
            print(f"❌ HTTP {response.status_code}")
            return False
        
        with tempfile.NamedTemporaryFile(suffix='.nii.gz', delete=False) as tmp:
            tmp.write(response.content)
            tmp_path = tmp.name
        
        try:
            img = nib.load(tmp_path)
            data = img.get_fdata()
            
            print(f"✓ Shape: {data.shape}")
            print(f"✓ Min/Max: {np.min(data):.4f} / {np.max(data):.4f}")
            print(f"✓ Non-zero: {np.count_nonzero(data):,}")
            
            valid = len(data.shape) == 3 and np.max(data) > 0
            print(f"\n{'✓ VALID' if valid else '❌ CORRUPTED'}")
            return valid
        finally:
            os.unlink(tmp_path)
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

for pid in ["AAA004", "AAA111", "AAA112", "AAA113"]:
    check_patient_gradcam(pid)
