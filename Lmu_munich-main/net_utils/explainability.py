"""
Explainability Module — ki-alz
-------------------------------
Provides two explainability methods aligned with the PDF spec:

  1. SHAP (Tabular branch)
     - Uses Captum ShapleyValueSampling on the tabular sub-model
     - Returns ranked feature contributions for clinical features

  2. Grad-CAM++ (MRI branch)
     - Uses medcam injected into the 3D-CNN (PretrainedResNet)
     - Returns a 3D attention heatmap aligned to the input MRI

Usage
-----
    from net_utils.explainability import compute_shap, compute_gradcam

    shap_result  = compute_shap(model, x_tab, pred_idx, tab_columns)
    gradcam_result = compute_gradcam(mri_model, x_mri, save_dir="outputs/gradcam")
"""

import os
import numpy as np
import torch
import torchio as tio


# ---------------------------------------------------------------------------
# Baseline clinical values (approximate population averages from training data)
# Used as SHAP reference point.  Order must match TAB_COLUMNS.
# SEX  AGE   EDUC  CDR   MMSE  APGEN1  APGEN2
TAB_BASELINES = (1.5, 74.0, 16.0, 0.4, 26.0, 3.0, 3.0)
# ---------------------------------------------------------------------------


def compute_shap(model,
                 x_tab: torch.Tensor,
                 pred_idx: int,
                 tab_columns: list,
                 baselines: tuple = TAB_BASELINES,
                 patient_id: str = "unknown") -> list:
    """
    Compute SHAP feature importances for a single tabular input.

    Parameters
    ----------
    model : AllModalitiesFusionModel (or any model that exposes tab_t1w_model.tab_model)
        The loaded multimodal model.
    x_tab : torch.Tensor, shape [1, 7]
        Preprocessed tabular input (already on correct device).
    pred_idx : int
        Predicted class index (SHAP attributes w.r.t. this class).
    tab_columns : list of str
        Feature names in the same order as x_tab columns.
    baselines : tuple
        Reference baseline values for each feature.

    Returns
    -------
    list of dicts, sorted by |shap_value| descending:
        [{"feature": "MMSE", "value": 23.0, "shap": 0.142}, ...]
    """
    # Extract the tabular sub-model from the fusion model
    if hasattr(model, 'tab_t1w_model'):
        # AllModalitiesFusionModel
        tab_model = model.tab_t1w_model.tab_model
    elif hasattr(model, 'reduce_tab'):
        # TabMRIFusionModel — tab_model is passed as a pre-wrapped callable
        tab_model = model
    else:
        tab_model = model

    tab_model.eval()
    x_tab = x_tab.requires_grad_(True)

    baseline_tensor = torch.tensor(
        [list(baselines)], dtype=torch.float32, device=x_tab.device
    )

    from captum.attr import ShapleyValueSampling
    print(f"[SHAP] Starting attribution for patient {patient_id}, pred_idx={pred_idx}")
    shap_explainer = ShapleyValueSampling(tab_model)
    attributions   = shap_explainer.attribute(
        x_tab,
        target=pred_idx,
        baselines=baseline_tensor,
        n_samples=25,  # reduced from 200 — keeps runtime under 30s
    )
    print(f"[SHAP] Attribution done")

    attr_np    = attributions.squeeze().detach().cpu().numpy()
    input_vals = x_tab.squeeze().detach().cpu().numpy()

    results = [
        {
            "feature": col,
            "value":   round(float(input_vals[i]), 4),
            "shap":    round(float(attr_np[i]), 4),
        }
        for i, col in enumerate(tab_columns)
    ]

    # Sort by absolute SHAP value — most important first
    results.sort(key=lambda d: abs(d["shap"]), reverse=True)

    # Save bar chart — returns S3 URL or local path
    chart_url = _save_shap_chart(results, patient_id=patient_id)

    return results, chart_url


_FEATURE_DISPLAY = {
    'SEX':       'Sex',
    'AGE':       'Age',
    'EDUCATION': 'Education (yrs)',
    'CDR':       'CDR Score',
    'MMSE':      'MMSE Score',
    'APGEN1':    'APOE ε4 Allele 1',
    'APGEN2':    'APOE ε4 Allele 2',
}


def _save_shap_chart(shap_results: list, save_dir: str = "outputs/shap",
                     patient_id: str = "unknown") -> str:
    """Save a horizontal bar chart of SHAP values as a PNG. Returns saved path or S3 URL."""
    import matplotlib.pyplot as plt
    from matplotlib.patches import Patch

    os.makedirs(save_dir, exist_ok=True)
    features = [_FEATURE_DISPLAY.get(r["feature"], r["feature"]) for r in shap_results]
    values   = [r["shap"] for r in shap_results]
    colors   = ["#d73027" if v > 0 else "#4575b4" for v in values]

    fig, ax = plt.subplots(figsize=(8, max(3, len(features) * 0.65)))
    ax.barh(features[::-1], values[::-1], color=colors[::-1], height=0.6)
    ax.axvline(0, color="black", linewidth=0.8)
    ax.set_xlabel("SHAP value", fontsize=11)
    ax.set_title(f"Feature Importance — {patient_id}", fontsize=13, fontweight='bold')
    legend_elements = [
        Patch(facecolor='#d73027', label='Increases probability'),
        Patch(facecolor='#4575b4', label='Decreases probability'),
    ]
    ax.legend(handles=legend_elements, loc='lower right', fontsize=9)
    ax.tick_params(axis='y', labelsize=10)
    plt.tight_layout()

    filename = f"{patient_id}_shap.png"
    path     = os.path.join(save_dir, filename)
    fig.savefig(path, dpi=150)
    plt.close(fig)

    # Upload to s3://{bucket}/{patient_id}/{patient_id}_shap.png
    try:
        from net_utils.s3_utils import upload_to_patient_folder
        url = upload_to_patient_folder(path, patient_id, f"{patient_id}_shap.png")
        if url:
            return url
    except Exception:
        pass

    return path


def compute_gradcam(mri_model,
                    x_mri: torch.Tensor,
                    save_dir: str = "outputs/gradcam",
                    layer: str = "auto",
                    patient_id: str = "unknown",
                    original_stem: str = "scan") -> dict:
    """
    Compute Grad-CAM++ attention heatmap for a single MRI volume.
    Hooks directly into layer4 of the 3D ResNet backbone — no medcam dependency.
    """
    import torch.nn.functional as F

    os.makedirs(save_dir, exist_ok=True)
    mri_model.eval()

    # Hook into the last convolutional block (layer4) of the ResNet backbone
    target_layer = mri_model.model.layer4

    activations, gradients = {}, {}

    fwd_handle = target_layer.register_forward_hook(
        lambda m, i, o: activations.update({'feat': o})
    )
    bwd_handle = target_layer.register_full_backward_hook(
        lambda m, gi, go: gradients.update({'feat': go[0]})
    )

    try:
        x = x_mri.float().requires_grad_(True)
        output = mri_model(x)                          # [1, n_classes]
        pred_idx = int(output.argmax(dim=1))
        score = output[0, pred_idx]
        mri_model.zero_grad()
        score.backward()
    finally:
        fwd_handle.remove()
        bwd_handle.remove()

    acts  = activations['feat']                        # [1, C, D, H, W]
    grads = gradients['feat']                          # [1, C, D, H, W]

    # Grad-CAM: global-average-pool gradients → weight activations
    weights = grads.mean(dim=(2, 3, 4), keepdim=True)  # [1, C, 1, 1, 1]
    cam = F.relu((weights * acts).sum(dim=1, keepdim=True))  # [1, 1, D, H, W]
    heatmap = cam.squeeze().detach().cpu().numpy()     # [D, H, W]

    # Normalise to [0, 1]
    h_min, h_max = heatmap.min(), heatmap.max()
    if h_max > h_min:
        heatmap = (heatmap - h_min) / (h_max - h_min)

    # Upsample to input MRI shape (70, 80, 80)
    target_shape = x_mri.shape[2:]
    if heatmap.shape != tuple(target_shape):
        heatmap_tensor = torch.tensor(heatmap).unsqueeze(0).unsqueeze(0).float()
        heatmap_tensor = F.interpolate(
            heatmap_tensor, size=target_shape, mode='trilinear', align_corners=False
        )
        heatmap = heatmap_tensor.squeeze().numpy()

    # Save as NIfTI for downstream overlay
    filename     = f"{original_stem}_{patient_id}_gradcam.nii.gz"
    heatmap_path = os.path.join(save_dir, filename)
    _save_nifti(heatmap, heatmap_path)

    # Save middle axial slice as PNG — side-by-side: original MRI | Grad-CAM overlay
    import matplotlib.pyplot as plt
    import matplotlib.cm as cm
    png_filename = f"{original_stem}_{patient_id}_heatmap.png"
    png_path     = os.path.join(save_dir, png_filename)
    mid_idx      = heatmap.shape[0] // 2
    cam_slice    = heatmap[mid_idx, :, :]
    mri_slice    = x_mri.squeeze().detach().cpu().numpy()[mid_idx, :, :]

    fig, axes = plt.subplots(1, 2, figsize=(12, 5))
    axes[0].imshow(mri_slice, cmap='gray', vmin=0, vmax=1)
    axes[0].set_title('Original MRI Image', fontsize=12, fontweight='bold')
    axes[0].axis('off')

    axes[1].imshow(mri_slice, cmap='gray', vmin=0, vmax=1)
    axes[1].imshow(cam_slice, cmap='hot',  vmin=0, vmax=1, alpha=0.5)
    axes[1].set_title('Enhanced GRAD-CAM Heatmap', fontsize=12, fontweight='bold')
    axes[1].axis('off')

    sm   = cm.ScalarMappable(cmap='hot', norm=plt.Normalize(0, 1))
    cbar = fig.colorbar(sm, ax=axes, fraction=0.015, pad=0.02, shrink=0.7)
    cbar.set_label('Low → High Activation', fontsize=10)
    fig.text(0.5, 0.01, 'GRAD-CAM Visualization', ha='center', fontsize=9, color='gray')
    plt.tight_layout(rect=[0, 0.04, 1, 1])
    fig.savefig(png_path, dpi=150, bbox_inches='tight')
    plt.close(fig)

    # Upload both NIfTI and PNG into s3://{bucket}/{patient_id}/
    output_url = heatmap_path
    png_url    = png_path
    try:
        from net_utils.s3_utils import upload_to_patient_folder
        output_url = upload_to_patient_folder(heatmap_path, patient_id, f"{patient_id}_gradcam.nii.gz") or heatmap_path
        png_url    = upload_to_patient_folder(png_path,     patient_id, f"{patient_id}_heatmap.png")    or png_path
    except Exception:
        pass

    return {
        "heatmap":      heatmap,
        "heatmap_path": output_url,
        "heatmap_png":  png_url,
    }


def _save_nifti(volume: np.ndarray, path: str) -> None:
    """Save a 3D numpy array as a NIfTI file via torchio."""
    tensor = torch.tensor(volume, dtype=torch.float32).unsqueeze(0)  # [1, D, H, W]
    img    = tio.ScalarImage(tensor=tensor)
    img.save(path)


def extract_mri_submodel(fusion_model, modality: str = 'T1w'):
    """
    Extract the MRI sub-model from a fusion model for Grad-CAM use.

    Parameters
    ----------
    fusion_model : AllModalitiesFusionModel
    modality     : 'T1w' or 'FLAIR'

    Returns
    -------
    PretrainedResNet sub-model
    """
    if modality == 'T1w':
        return fusion_model.tab_t1w_model.mri_model
    elif modality == 'FLAIR':
        return fusion_model.tab_flair_model.mri_model
    else:
        raise ValueError(f"Unknown modality: {modality}")
