"""
Patient ID Generator
--------------------
Generates anonymized, incremental patient IDs in the format:
  ABC001 → ABC002 → ... → ABC999 → ABD001 → ... → ZZZ999

Registry is persisted in patient_registry.json at the project root.
"""

import json
import os
import string
from datetime import datetime, timezone

REGISTRY_PATH = os.path.join(os.path.dirname(__file__), '..', 'patient_registry.json')
REGISTRY_PATH = os.path.abspath(REGISTRY_PATH)

LETTERS = string.ascii_uppercase  # A-Z


# ---------------------------------------------------------------------------
# ID arithmetic
# ---------------------------------------------------------------------------

def _letters_to_index(letters: str) -> int:
    """Convert 3-letter prefix to a base-26 index.  AAA=0, AAB=1, ..."""
    idx = 0
    for ch in letters:
        idx = idx * 26 + LETTERS.index(ch)
    return idx


def _index_to_letters(idx: int) -> str:
    """Convert a base-26 index back to a 3-letter prefix."""
    result = []
    for _ in range(3):
        result.append(LETTERS[idx % 26])
        idx //= 26
    return ''.join(reversed(result))


def _increment_id(patient_id: str) -> str:
    """
    Return the next ID after patient_id.
    e.g. ABC001 -> ABC002, ABC999 -> ABD001, ZZZ999 -> raises OverflowError
    """
    letters = patient_id[:3]
    digits  = int(patient_id[3:])

    if digits < 999:
        return f"{letters}{digits + 1:03d}"

    # digits rolled over — increment letter prefix
    letter_idx = _letters_to_index(letters) + 1
    max_index  = 26 ** 3  # 17576
    if letter_idx >= max_index:
        raise OverflowError("Patient ID space exhausted (ZZZ999 reached).")

    new_letters = _index_to_letters(letter_idx)
    return f"{new_letters}001"


# ---------------------------------------------------------------------------
# Registry I/O
# ---------------------------------------------------------------------------

def _load_registry() -> dict:
    if os.path.exists(REGISTRY_PATH):
        with open(REGISTRY_PATH, 'r') as f:
            return json.load(f)
    return {"last_id": None, "patients": {}}


def _save_registry(registry: dict) -> None:
    with open(REGISTRY_PATH, 'w') as f:
        json.dump(registry, f, indent=2)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def generate_next_id() -> str:
    """
    Generate and persist the next available patient ID.
    Checks both S3 and local registry for the highest existing ID so that
    a registry reset never produces an ID that already exists in S3.
    """
    # Scan S3 for the highest existing patient folder
    s3_last = None
    try:
        from net_utils.s3_utils import list_patient_folders
        folders = list_patient_folders()
        valid   = [f for f in folders if len(f) == 6 and f[:3].isalpha() and f[3:].isdigit()]
        if valid:
            s3_last = sorted(valid)[-1]   # lexicographic == numeric for zero-padded IDs
    except Exception:
        pass

    registry   = _load_registry()
    local_last = registry.get("last_id")

    # Use whichever source has the higher ID
    candidates = [x for x in (s3_last, local_last) if x]
    last_id    = sorted(candidates)[-1] if candidates else None

    new_id = "AAA001" if last_id is None else _increment_id(last_id)
    registry["last_id"] = new_id
    _save_registry(registry)
    return new_id


def register_patient(tabular_data: dict,
                     t1w_path: str = None,
                     flair_path: str = None) -> str:
    """
    Register a new patient: assigns an ID, stores tabular data + MRI paths.

    Parameters
    ----------
    tabular_data : dict
        Keys: SEX, AGE, EDUCATION, CDR, MMSE, APGEN1, APGEN2
        Optional: ABETA42, ABETA40, TAU, PTAU
    t1w_path : str, optional
        Absolute path to the T1w NIfTI file.
    flair_path : str, optional
        Absolute path to the FLAIR NIfTI file.

    Returns
    -------
    str
        The newly assigned patient ID (e.g. "AAA001").
    """
    patient_id = generate_next_id()
    registry   = _load_registry()

    registry["patients"][patient_id] = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "tabular":    tabular_data,
        "mri": {
            "T1w":   t1w_path,
            "FLAIR": flair_path,
        }
    }
    _save_registry(registry)
    return patient_id


def lookup_patient(patient_id: str) -> dict:
    """
    Retrieve stored record for a patient ID.

    Returns
    -------
    dict with keys: created_at, tabular, mri

    Raises
    ------
    KeyError if patient_id not found.
    """
    registry = _load_registry()
    if patient_id not in registry["patients"]:
        raise KeyError(f"Patient ID '{patient_id}' not found in registry.")
    return registry["patients"][patient_id]


def update_patient_mri(patient_id: str, t1w_path: str = None, flair_path: str = None) -> None:
    """Update stored MRI paths for an existing patient (e.g. after file rename)."""
    registry = _load_registry()
    if patient_id not in registry["patients"]:
        raise KeyError(f"Patient ID '{patient_id}' not found in registry.")
    if t1w_path is not None:
        registry["patients"][patient_id]["mri"]["T1w"] = t1w_path
    if flair_path is not None:
        registry["patients"][patient_id]["mri"]["FLAIR"] = flair_path
    _save_registry(registry)


def update_patient_prediction(patient_id: str, prediction: dict) -> None:
    """Store the most recent prediction result in the patient registry."""
    registry = _load_registry()
    if patient_id not in registry["patients"]:
        raise KeyError(f"Patient ID '{patient_id}' not found in registry.")

    safe = {}
    for k, v in prediction.items():
        if k == 'gradcam' and isinstance(v, dict):
            safe[k] = {
                'heatmap_path': v.get('heatmap_path'),
                'heatmap_png':  v.get('heatmap_png'),
            }
        elif k == 'gradcam' and v is None:
            safe[k] = None
        elif hasattr(v, '__array__'):
            pass  # skip raw numpy arrays
        else:
            safe[k] = v

    safe['_timestamp'] = datetime.now(timezone.utc).isoformat()
    registry["patients"][patient_id]["last_prediction"] = safe
    _save_registry(registry)


def list_patients() -> list:
    """
    Return all patient IDs.
    S3 folder listing is the primary source of truth; local registry is the fallback.
    """
    try:
        from net_utils.s3_utils import list_patient_folders
        s3_patients = list_patient_folders()
        if s3_patients:
            return s3_patients
    except Exception as e:
        print(f"[list_patients] S3 listing failed, falling back to registry: {e}")
    registry = _load_registry()
    return list(registry["patients"].keys())


# ---------------------------------------------------------------------------
# Quick test
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    # Simulate registering a few patients
    for i in range(3):
        pid = register_patient(
            tabular_data={"SEX": 1, "AGE": 72, "EDUCATION": 12,
                          "CDR": 1.0, "MMSE": 23, "APGEN1": 3, "APGEN2": 4},
            t1w_path=f"/data/patient_{i}/t1w.nii.gz",
            flair_path=f"/data/patient_{i}/flair.nii.gz"
        )
        print(f"Registered: {pid}")

    print("\nAll patients:", list_patients())
    print("\nLookup AAA001:", lookup_patient("AAA001"))