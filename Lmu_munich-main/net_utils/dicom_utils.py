"""
DICOM to NIfTI Conversion Utility
-----------------------------------
Accepts a ZIP of DICOM files, extracts it, and converts to NIfTI using dcm2niix.
"""

import os
import glob
import zipfile
import tempfile
import subprocess


def convert_dicom_zip_to_nifti(zip_path: str, output_dir: str) -> str:
    """
    Extract a DICOM ZIP and convert to NIfTI using dcm2niix.

    Parameters
    ----------
    zip_path   : path to the uploaded .zip file
    output_dir : directory to write the converted NIfTI

    Returns
    -------
    str : path to the converted .nii.gz file

    Raises
    ------
    RuntimeError if dcm2niix fails or produces no output
    """
    os.makedirs(output_dir, exist_ok=True)

    # Extract ZIP to a temp subfolder
    extract_dir = tempfile.mkdtemp(dir=output_dir, prefix="dicom_extract_")
    print(f"[DICOM] Extracting ZIP: {zip_path} → {extract_dir}")
    with zipfile.ZipFile(zip_path, 'r') as z:
        z.extractall(extract_dir)

    # Run dcm2niix on the extracted folder
    nifti_dir = tempfile.mkdtemp(dir=output_dir, prefix="dicom_nifti_")
    cmd = [
        'dcm2niix',
        '-z', 'y',          # compress to .nii.gz
        '-i', 'y',          # ignore derived/localizer
        '-o', nifti_dir,
        '-f', 'converted',  # output filename prefix
        extract_dir
    ]
    print(f"[DICOM] Running dcm2niix...")
    result = subprocess.run(cmd, capture_output=True, text=True)
    print(f"[DICOM] dcm2niix stdout: {result.stdout[-500:]}")

    if result.returncode != 0:
        print(f"[DICOM] dcm2niix stderr: {result.stderr[-500:]}")

    # Find output NIfTI
    nifti_files = glob.glob(os.path.join(nifti_dir, '*.nii.gz'))
    if not nifti_files:
        nifti_files = glob.glob(os.path.join(nifti_dir, '*.nii'))

    if not nifti_files:
        raise RuntimeError(
            f"dcm2niix produced no NIfTI output.\n"
            f"stdout: {result.stdout}\nstderr: {result.stderr}"
        )

    # If multiple series, take the largest file (most slices)
    nifti_files.sort(key=lambda f: os.path.getsize(f), reverse=True)
    nifti_path = nifti_files[0]
    print(f"[DICOM] Converted NIfTI: {nifti_path}")
    return nifti_path


def is_dicom_zip(filename: str) -> bool:
    """Returns True if the filename looks like a DICOM ZIP upload."""
    return filename.lower().endswith('.zip')
