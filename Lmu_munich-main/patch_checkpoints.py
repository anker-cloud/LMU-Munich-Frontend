"""
One-time checkpoint path patcher
----------------------------------
All checkpoints were trained on a remote server with hardcoded paths.
This script patches the hparams inside each .ckpt file to use local paths.

Run once:
    python patch_checkpoints.py
"""

import os
import torch

BASE = os.path.dirname(__file__)

def ckpt(relative_path):
    return os.path.abspath(os.path.join(BASE, relative_path))

# ---------------------------------------------------------------------------
# Local paths
# ---------------------------------------------------------------------------
LOCAL = {
    'WEIGHTS_T1W':   ckpt('model_checkpoints/WEIGHTS_T1W/WEIGHTS_T1W/epoch=epoch=144-val_loss=val_loss_epoch=0.000.ckpt'),
    'weights_FLAIR': ckpt('model_checkpoints/weights_FLAIR/weights_FLAIR/epoch=epoch=111-val_f1=val_f1_epoch=0.000.ckpt'),
    'TAB_T1W':       ckpt('model_checkpoints/TAB_T1W/TAB_T1W/epoch=epoch=99-val_loss=val_loss_epoch=0.000.ckpt'),
    'TAB_FLAIR':     ckpt('model_checkpoints/TAB_FLAIR/TAB_FLAIR/epoch=epoch=99-val_loss=val_loss_epoch=0.000.ckpt'),
    'T1W_FLAIR':     ckpt('model_checkpoints/T1W_FLAIR/T1W_FLAIR/epoch=epoch=165-val_f1=val_f1_epoch=0.000.ckpt'),
    'all_mod':       ckpt('model_checkpoints/all_mod/all_mod/epoch=epoch=22-val_loss=val_loss_epoch=0.000.ckpt'),
    'tabpfn':        ckpt('model_checkpoints/TAB/TAB/tabpfn_seed2.p'),
}


def patch(ckpt_path, updates: dict):
    """Load checkpoint, apply hparam updates, save back."""
    print(f"\nPatching: {os.path.basename(ckpt_path)}")
    checkpoint = torch.load(ckpt_path, map_location='cpu')

    hp = checkpoint.get('hyper_parameters', {})
    for key, val in updates.items():
        old = hp.get(key, '<not set>')
        hp[key] = val
        print(f"  {key}:")
        print(f"    old: {old}")
        print(f"    new: {val}")

    checkpoint['hyper_parameters'] = hp
    torch.save(checkpoint, ckpt_path)
    print(f"  Saved.")


if __name__ == '__main__':

    # ── T1W_FLAIR ────────────────────────────────────────────────────────────
    # Depends on: WEIGHTS_T1W + weights_FLAIR
    patch(LOCAL['T1W_FLAIR'], {
        'weights_path_t1w':   LOCAL['WEIGHTS_T1W'],
        'weights_path_flair': LOCAL['weights_FLAIR'],
    })

    # ── TAB_T1W ──────────────────────────────────────────────────────────────
    # Depends on: WEIGHTS_T1W + tabpfn
    # NOTE: checkpoint was trained with TabPFN-based tabular model.
    # Current tab_mri_fusion.py expects 'weights_path_tab' (TabularNN).
    # Patching both keys for compatibility — see NOTE in inference.py.
    patch(LOCAL['TAB_T1W'], {
        'weights_path_mri': LOCAL['WEIGHTS_T1W'],
        'tabpfn_path':      LOCAL['tabpfn'],
        'weights_path_tab': LOCAL['tabpfn'],   # alias so code doesn't KeyError
        'linear_cutoff':    1,                  # required by tab_mri_fusion.py
        'dropout':          False,
    })

    # ── TAB_FLAIR ────────────────────────────────────────────────────────────
    # Depends on: weights_FLAIR + tabpfn
    patch(LOCAL['TAB_FLAIR'], {
        'weights_path_mri': LOCAL['weights_FLAIR'],
        'tabpfn_path':      LOCAL['tabpfn'],
        'weights_path_tab': LOCAL['tabpfn'],   # alias
        'linear_cutoff':    1,
        'dropout':          False,
    })

    # ── all_mod ───────────────────────────────────────────────────────────────
    # Depends on: TAB_T1W + TAB_FLAIR + T1W_FLAIR (must be patched first)
    patch(LOCAL['all_mod'], {
        'weights_path_tab_t1w':   LOCAL['TAB_T1W'],
        'weights_path_tab_flair': LOCAL['TAB_FLAIR'],
        'weights_path_t1w_flair': LOCAL['T1W_FLAIR'],
        'linear_cutoff':          1,
        'dropout':                False,
        'method':                 'linear',
    })

    print("\nAll checkpoints patched.")
    print("\nNOTE: TAB_T1W / TAB_FLAIR / all_mod use TabPFN-based tabular embeddings.")
    print("If tab_mri_fusion.py crashes on TabularNN.load_from_checkpoint,")
    print("the tabular branch code needs to be updated to match the checkpoint architecture.")
