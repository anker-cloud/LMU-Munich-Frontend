"""
ki-alz Inference Pipeline
--------------------------
Usage
-----
1. Register a new patient (first visit):

    from inference import register_and_predict

    result = register_and_predict(
        tabular_data = {
            "SEX": 1, "AGE": 72, "EDUCATION": 12,
            "CDR": 1.0, "MMSE": 23, "APGEN1": 3, "APGEN2": 4
        },
        t1w_path   = "/path/to/t1w.nii.gz",
        flair_path = "/path/to/flair.nii.gz"   # optional
    )
    print(result)

2. Run prediction for an existing patient (new MRI uploaded):

    from inference import predict_for_patient

    result = predict_for_patient(
        patient_id = "AAA001",
        t1w_path   = "/path/to/new_t1w.nii.gz",
        flair_path = "/path/to/new_flair.nii.gz"
    )
    print(result)
"""

import os
import json
import torch
import torchio as tio
import numpy as np
from torch.nn.functional import softmax

# ── Fix for TabPFN compatibility with PyTorch 2.0+ ────────────────────────────
# TabPFN 0.1.9 tries to import Optional from torch.nn.modules.transformer
# which was removed in PyTorch 2.0+. We inject it here as a workaround.
try:
    from torch.nn.modules.transformer import Optional
except ImportError:
    from typing import Optional as TypingOptional
    import torch.nn.modules.transformer as transformer_module
    transformer_module.Optional = TypingOptional

from net_utils.patient_id import register_patient, lookup_patient
from net_utils.explainability import compute_shap, compute_gradcam, extract_mri_submodel

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

CONFIG_PATH = os.path.join(os.path.dirname(__file__), 'configs', 'config_all.json')

with open(CONFIG_PATH, 'r') as f:
    CFG = json.load(f)

# Local checkpoint paths (relative to project root)
_BASE = os.path.dirname(__file__)
CHECKPOINT_PATHS = {
    'all_mod':       os.path.join(_BASE, 'model_checkpoints', 'all_mod',       'all_mod',       'epoch=epoch=22-val_loss=val_loss_epoch=0.000.ckpt'),
    'T1W_FLAIR':     os.path.join(_BASE, 'model_checkpoints', 'T1W_FLAIR',     'T1W_FLAIR',     'epoch=epoch=165-val_f1=val_f1_epoch=0.000.ckpt'),
    'TAB_T1W':       os.path.join(_BASE, 'model_checkpoints', 'TAB_T1W',       'TAB_T1W',       'epoch=epoch=99-val_loss=val_loss_epoch=0.000.ckpt'),
    'TAB_FLAIR':     os.path.join(_BASE, 'model_checkpoints', 'TAB_FLAIR',     'TAB_FLAIR',     'epoch=epoch=99-val_loss=val_loss_epoch=0.000.ckpt'),
    'WEIGHTS_T1W':   os.path.join(_BASE, 'model_checkpoints', 'WEIGHTS_T1W',   'WEIGHTS_T1W',   'epoch=epoch=144-val_loss=val_loss_epoch=0.000.ckpt'),
    'weights_FLAIR': os.path.join(_BASE, 'model_checkpoints', 'weights_FLAIR', 'weights_FLAIR', 'epoch=epoch=111-val_f1=val_f1_epoch=0.000.ckpt'),
}

# Class index → label
CLASS_NAMES = {v: k for k, v in CFG['class_mapping'].items()}

# Tabular feature order (must match training order)
TAB_COLUMNS = CFG['tab_columns']  # ['SEX','AGE','EDUCATION','CDR','MMSE','APGEN1','APGEN2']

# CDR → Alzheimer's stage mapping (temporary rule-based)
CDR_STAGE_MAP = {
    0.0: None,
    0.5: "Mild",
    1.0: "Mild",
    2.0: "Moderate",
    3.0: "Severe",
}

# MRI preprocessing transforms (same as used during training)
MRI_TRANSFORMS = tio.Compose([
    tio.ToCanonical(),
    tio.Resample(2),
    tio.CropOrPad((70, 80, 80)),
    tio.RescaleIntensity(out_min_max=(0, 1)),
])

# ---------------------------------------------------------------------------
# Model loader (lazy, cached)
# ---------------------------------------------------------------------------

_model_cache = {}


def _load_model(model_key: str):
    """Load a model checkpoint, cache it so it's only loaded once."""
    if model_key in _model_cache:
        return _model_cache[model_key]

    ckpt_path = CHECKPOINT_PATHS[model_key]

    # Auto-download from S3 if not present locally
    try:
        from net_utils.s3_utils import download_checkpoint_if_missing
        download_checkpoint_if_missing(ckpt_path)
    except Exception:
        pass

    if not os.path.exists(ckpt_path):
        raise FileNotFoundError(f"Checkpoint not found: {ckpt_path}")

    if model_key == 'all_mod':
        from models.fusion_models.all_modalities_fusion import AllModalitiesFusionModel
        model = AllModalitiesFusionModel.load_from_checkpoint(ckpt_path)
    elif model_key == 'T1W_FLAIR':
        from models.fusion_models.t1w_flair_fusion import T1wFlairFusionModel
        model = T1wFlairFusionModel.load_from_checkpoint(ckpt_path)
    elif model_key in ('TAB_T1W', 'TAB_FLAIR'):
        from models.fusion_models.tab_mri_fusion import TabMRIFusionModel
        model = TabMRIFusionModel.load_from_checkpoint(ckpt_path)
    elif model_key in ('WEIGHTS_T1W', 'weights_FLAIR'):
        from models.mri_models.pretrained_resnet import PretrainedResNet
        model = PretrainedResNet.load_from_checkpoint(ckpt_path)
    else:
        raise ValueError(f"Unknown model key: {model_key}")

    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    model = model.to(device)
    model.eval()
    _model_cache[model_key] = model
    return model


# ---------------------------------------------------------------------------
# Preprocessing helpers
# ---------------------------------------------------------------------------

def _preprocess_tabular(tabular_data: dict) -> torch.Tensor:
    """Convert tabular dict -> float tensor [1, 7]."""
    values = [float(tabular_data.get(col, 0)) for col in TAB_COLUMNS]
    return torch.tensor(values, dtype=torch.float32).unsqueeze(0)


def _preprocess_mri(nii_path: str) -> torch.Tensor:
    """Load NIfTI, apply transforms -> tensor [1, 1, 70, 80, 80]."""
    img = tio.ScalarImage(nii_path)
    img = MRI_TRANSFORMS(img)
    return img.data.unsqueeze(0)


# ---------------------------------------------------------------------------
# Staging (temporary CDR rule-based)
# ---------------------------------------------------------------------------

def _get_ad_stage(cdr_value):
    """Returns Alzheimer's stage string based on CDR, or None."""
    try:
        cdr = float(cdr_value)
    except (TypeError, ValueError):
        return None
    valid_cdrs = [0.0, 0.5, 1.0, 2.0, 3.0]
    closest = min(valid_cdrs, key=lambda x: abs(x - cdr))
    return CDR_STAGE_MAP.get(closest)


# ---------------------------------------------------------------------------
# Core prediction
# ---------------------------------------------------------------------------

def _run_prediction(tabular_data, t1w_path=None, flair_path=None,
                    explain=True, gradcam_save_dir="outputs/gradcam",
                    patient_id="unknown", original_stem="scan"):
    """
    Select best model, run inference, optionally run explainability.
    Returns a result dict.
    """
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    gpu = torch.cuda.is_available()

    has_tab   = tabular_data is not None
    has_t1w   = t1w_path is not None and os.path.exists(t1w_path)
    has_flair = flair_path is not None and os.path.exists(flair_path)

    print(f"[INF] patient={patient_id} gpu={gpu} has_tab={has_tab} has_t1w={has_t1w} has_flair={has_flair}")

    # ── Select model ─────────────────────────────────────────────────────────
    if gpu and has_tab and has_t1w and has_flair:
        model_key = 'all_mod'
    elif has_t1w and has_flair:
        model_key = 'T1W_FLAIR'
    elif gpu and has_tab and has_t1w:
        model_key = 'TAB_T1W'
    elif gpu and has_tab and has_flair:
        model_key = 'TAB_FLAIR'
    elif has_t1w:
        model_key = 'WEIGHTS_T1W'
    elif has_flair:
        model_key = 'weights_FLAIR'
    else:
        raise ValueError("At least one MRI file (t1w_path or flair_path) must be provided.")

    print(f"[INF] Selected model: {model_key}")
    model = _load_model(model_key)
    print(f"[INF] Model loaded")

    # ── Forward pass ─────────────────────────────────────────────────────────
    with torch.no_grad():
        if model_key == 'all_mod':
            x_tab   = _preprocess_tabular(tabular_data).to(device)
            x_t1w   = _preprocess_mri(t1w_path).to(device)
            x_flair = _preprocess_mri(flair_path).to(device)
            logits  = model.forward(x_tab, x_t1w, x_flair)

        elif model_key == 'T1W_FLAIR':
            x_t1w   = _preprocess_mri(t1w_path).to(device)
            x_flair = _preprocess_mri(flair_path).to(device)
            logits  = model.forward(x_t1w, x_flair)

        elif model_key in ('TAB_T1W', 'TAB_FLAIR'):
            x_tab  = _preprocess_tabular(tabular_data).to(device)
            x_mri  = _preprocess_mri(t1w_path if model_key == 'TAB_T1W' else flair_path).to(device)
            logits = model.forward(x_tab, x_mri)

        elif model_key in ('WEIGHTS_T1W', 'weights_FLAIR'):
            x_mri  = _preprocess_mri(t1w_path if model_key == 'WEIGHTS_T1W' else flair_path).to(device)
            logits = model.forward(x_mri)

    # ── Probabilities & prediction ────────────────────────────────────────────
    print(f"[INF] Forward pass complete")
    probs         = softmax(logits, dim=1).squeeze(0).cpu().numpy()
    pred_idx      = int(np.argmax(probs))
    pred_label    = CLASS_NAMES[pred_idx]
    probabilities = {CLASS_NAMES[i]: round(float(p), 4) for i, p in enumerate(probs)}
    print(f"[INF] Prediction: {pred_label} | probs: {probabilities}")

    # ── AD staging ────────────────────────────────────────────────────────────
    stage = None
    if pred_label == 'AD' and has_tab:
        stage = _get_ad_stage(tabular_data.get('CDR'))

    # ── Explainability ────────────────────────────────────────────────────────
    shap_values    = None
    gradcam_result = None

    if explain:
        model_expl   = _load_model(model_key)
        mri_submodel = None
        mri_input    = None

        print(f"[EXPL] Starting explainability (explain={explain})")
        if gpu and has_tab and model_key in ('all_mod', 'TAB_T1W', 'TAB_FLAIR'):
            x_tab_expl = _preprocess_tabular(tabular_data).to(device).requires_grad_(True)

            # For TAB fusion models, wrap so SHAP only varies x_tab (x_mri is fixed)
            if model_key in ('TAB_T1W', 'TAB_FLAIR'):
                _mri_path    = t1w_path if model_key == 'TAB_T1W' else flair_path
                _x_mri_fixed = _preprocess_mri(_mri_path).to(device)
                import torch.nn as _nn
                class _TabWrapper(_nn.Module):
                    def __init__(self, m, xm): super().__init__(); self.m = m; self.xm = xm
                    def forward(self, xt): return self.m(xt, self.xm)
                shap_model = _TabWrapper(model_expl, _x_mri_fixed)
            else:
                shap_model = model_expl

            shap_list, shap_chart_url = compute_shap(
                model       = shap_model,
                x_tab       = x_tab_expl,
                pred_idx    = pred_idx,
                tab_columns = TAB_COLUMNS,
                patient_id  = patient_id,
            )
            shap_values = {
                "features":   shap_list,
                "chart_path": shap_chart_url,
            }

        # Grad-CAM++ — works on any MRI model
        print(f"[EXPL] Starting Grad-CAM")
        if model_key == 'all_mod':
            if has_t1w:
                mri_submodel = extract_mri_submodel(model_expl, modality='T1w')
                mri_input    = _preprocess_mri(t1w_path).to(device)
            elif has_flair:
                mri_submodel = extract_mri_submodel(model_expl, modality='FLAIR')
                mri_input    = _preprocess_mri(flair_path).to(device)

        elif model_key in ('WEIGHTS_T1W', 'TAB_T1W') and has_t1w:
            mri_submodel = model_expl.mri_model if hasattr(model_expl, 'mri_model') else model_expl
            mri_input    = _preprocess_mri(t1w_path).to(device)

        elif model_key in ('weights_FLAIR', 'TAB_FLAIR') and has_flair:
            mri_submodel = model_expl.mri_model if hasattr(model_expl, 'mri_model') else model_expl
            mri_input    = _preprocess_mri(flair_path).to(device)

        elif model_key == 'T1W_FLAIR':
            if has_t1w:
                mri_submodel = model_expl.t1w_model
                mri_input    = _preprocess_mri(t1w_path).to(device)
            elif has_flair:
                mri_submodel = model_expl.flair_model
                mri_input    = _preprocess_mri(flair_path).to(device)

        if mri_submodel is not None:
            print(f"[EXPL] Running Grad-CAM on {type(mri_submodel).__name__}")
            gradcam_result = compute_gradcam(
                mri_model     = mri_submodel,
                x_mri         = mri_input,
                save_dir      = gradcam_save_dir,
                patient_id    = patient_id,
                original_stem = original_stem,
            )
            print(f"[EXPL] Grad-CAM done")
        else:
            print(f"[EXPL] No MRI submodel found for Grad-CAM")

    # Build patient_info from tabular for display in report
    patient_info = None
    if has_tab:
        sex_val = int(tabular_data.get('SEX', 1))
        patient_info = {
            'age':       int(tabular_data.get('AGE', 0)),
            'sex':       'Male' if sex_val == 1 else 'Female',
            'education': int(tabular_data.get('EDUCATION', 0)),
            'cdr':       float(tabular_data.get('CDR', 0)),
            'mmse':      int(tabular_data.get('MMSE', 0)),
            'apgen1':    int(tabular_data.get('APGEN1', 0)),
            'apgen2':    int(tabular_data.get('APGEN2', 0)),
        }

    result = {
        "model_used":    model_key,
        "prediction":    pred_label,
        "probabilities": probabilities,
        "ad_stage":      stage,
        "patient_info":  patient_info,
        "shap":          shap_values,
        "gradcam":       gradcam_result,
    }

    # Persist to registry
    try:
        from net_utils.patient_id import update_patient_prediction
        update_patient_prediction(patient_id, result)
    except Exception:
        pass

    # Upload patient JSON to s3://{bucket}/{patient_id}/{patient_id}.json
    try:
        import json as _json
        from net_utils.s3_utils import upload_to_patient_folder
        _json_dir  = os.path.join(_BASE, "outputs", "patients")
        os.makedirs(_json_dir, exist_ok=True)
        _json_path = os.path.join(_json_dir, f"{patient_id}.json")
        _safe = {k: v for k, v in result.items() if k != "gradcam"}
        if result.get("gradcam"):
            _safe["gradcam"] = {
                "heatmap_path": result["gradcam"].get("heatmap_path"),
                "heatmap_png":  result["gradcam"].get("heatmap_png"),
            }
        # Store raw tabular data so re-prediction works even after a registry reset
        if tabular_data:
            _safe["tabular"] = tabular_data
        with open(_json_path, "w") as _f:
            _json.dump(_safe, _f, indent=2)
        upload_to_patient_folder(_json_path, patient_id, f"{patient_id}.json")
        print(f"[S3] Patient JSON uploaded: {patient_id}/{patient_id}.json")
    except Exception as _e:
        print(f"[S3] Patient JSON upload failed: {_e}")

    return result


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def register_and_predict(tabular_data, t1w_path=None, flair_path=None,
                         explain=True, original_stem="scan"):
    """Register a new patient and run prediction in one step."""
    patient_id = register_patient(tabular_data, t1w_path, flair_path)
    result     = _run_prediction(tabular_data, t1w_path, flair_path,
                                 explain=explain, patient_id=patient_id,
                                 original_stem=original_stem)
    result["patient_id"] = patient_id
    return result


def predict_for_patient(patient_id, t1w_path=None, flair_path=None,
                        explain=True, original_stem="scan"):
    """Run prediction for an already-registered patient using stored tabular data.
    Tries local registry first; falls back to the S3 result JSON if not found.
    """
    tabular_data = None
    t1w          = t1w_path
    flair        = flair_path

    # Try local registry first
    try:
        record       = lookup_patient(patient_id)
        tabular_data = record['tabular']
        t1w          = t1w_path   or record['mri'].get('T1w')
        flair        = flair_path or record['mri'].get('FLAIR')
    except KeyError:
        pass

    # Fall back to the JSON stored in S3 (contains raw tabular saved at prediction time)
    if tabular_data is None:
        try:
            from net_utils.s3_utils import get_patient_result_json
            stored = get_patient_result_json(patient_id)
            if stored and 'tabular' in stored:
                tabular_data = stored['tabular']
        except Exception:
            pass

    if tabular_data is None:
        raise ValueError(
            f"No tabular data found for patient '{patient_id}'. "
            f"Not in local registry and no stored JSON in S3."
        )

    result = _run_prediction(tabular_data, t1w, flair,
                             explain=explain, patient_id=patient_id,
                             original_stem=original_stem)
    result["patient_id"] = patient_id
    return result


# ---------------------------------------------------------------------------
# CLI quick-test
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    print("=== ki-alz Inference Test ===\n")
    print("TAB columns :", TAB_COLUMNS)
    print("Class map   :", CLASS_NAMES)
    print("Checkpoints :")
    for k, v in CHECKPOINT_PATHS.items():
        exists = "OK" if os.path.exists(v) else "MISSING"
        print(f"  [{exists}] {k}: {os.path.basename(v)}")