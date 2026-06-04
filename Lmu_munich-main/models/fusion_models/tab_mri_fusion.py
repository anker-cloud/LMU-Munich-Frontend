"""
TabMRIFusionModel
-----------------
Fuses a tabular branch (TabPFN embeddings) with an MRI branch (3D-ResNet).

Architecture (derived from saved checkpoint state dict):
  - mri_model  : PretrainedResNet, conv_seg head outputs 64-dim embedding
                   BN3d → AvgPool → Flatten
                   → Linear(512,512) → BN → ReLU → Dropout
                   → Linear(512,256) → BN → ReLU → Dropout
                   → Linear(256,64)
  - reduce_tab : Linear(1024 → 64)
                   TabPFN produces 1024-dim output
                   (128 ensemble configs × 8 class probabilities, stacked)
  - fuse_model : Linear(128,64) → BN → ReLU → Dropout → Linear(64, n_classes)

NOTE on TabPFN (GPU only):
  The tabpfn .p file was serialised with CUDA tensors and requires a GPU.
  On CPU-only machines the tabular branch cannot run;
  use T1W_FLAIR or single-modality models instead.
"""

import os
import torch
import torch.nn as nn
from torch.optim.lr_scheduler import ReduceLROnPlateau
from torch.nn.functional import softmax

from models.base_model import Base_Model
from models.mri_models.pretrained_resnet import PretrainedResNet
from net_utils.focal_loss import FocalLoss

# Dimension TabPFN produces (128 ensemble configs × 8 classes)
TABPFN_EMBED_DIM = 1024
MRI_EMBED_DIM    = 64
TAB_EMBED_DIM    = 64     # after reduce_tab


class TabMRIFusionModel(Base_Model):
    """
    Multimodal fusion of tabular (TabPFN) and MRI (3D-ResNet) branches.
    Architecture matches the saved checkpoints exactly.
    """

    def __init__(self, hparams):
        super().__init__(hparams)
        self.mri_modality = hparams['mri_modality']

        # ── MRI branch ────────────────────────────────────────────────────────
        # conv_seg architecture (from checkpoint state dict):
        #   BN3d(512) → AvgPool → Flatten
        #   → Linear(512,256) → BN1d(256) → ReLU → Dropout
        #   → Linear(256, 64)   ← MRI_EMBED_DIM output
        # Instantiate fresh — Lightning applies fusion checkpoint weights.
        # T1w checkpoint has two intermediate blocks [512,256]; FLAIR has one [256]
        _ll_option = [512, 256] if hparams.get('mri_modality') == 'T1w' else [256]
        mri_hparams = {
            **hparams,
            'linear_layer_option': _ll_option,
            'n_classes':           MRI_EMBED_DIM,  # 64-dim embedding output
            'modality':            hparams['mri_modality'],
        }
        mri_hparams.pop('n_linear_out_const', None)
        mri_hparams.pop('n_linear_out_decr',  None)
        mri_hparams.pop('dropout',            None)
        self.mri_model = PretrainedResNet(mri_hparams)

        # ── Tabular branch ────────────────────────────────────────────────────
        # reduce_tab projects TabPFN's 1024-dim embedding → 64-dim
        self.reduce_tab = nn.Sequential(
            nn.Linear(TABPFN_EMBED_DIM, TAB_EMBED_DIM),
        )

        # TabPFN classifier — loaded lazily at forward time (needs GPU)
        self._tabpfn = None
        self._tabpfn_path = hparams.get('tabpfn_path')

        # ── Fusion head ───────────────────────────────────────────────────────
        # concat(tab_embed[64], mri_embed[64]) → 128 → 64 → n_classes
        self.fuse_model = nn.Sequential(
            nn.Linear(TAB_EMBED_DIM + MRI_EMBED_DIM, TAB_EMBED_DIM),  # 0
            nn.BatchNorm1d(TAB_EMBED_DIM),                              # 1
            nn.ReLU(),                                                  # 2
            nn.Dropout(p=hparams.get('dropout_prob', 0)),               # 3
            nn.Linear(TAB_EMBED_DIM, hparams['n_classes']),             # 4
        )

        # ── Loss ──────────────────────────────────────────────────────────────
        loss = hparams.get('loss', 'focal_loss')
        if loss == 'cross_entropy':
            self.criterion = nn.CrossEntropyLoss(weight=hparams['class_weights'])
        elif loss == 'focal_loss':
            self.criterion = FocalLoss(gamma=hparams.get('fl_gamma', 2))
        else:
            raise ValueError(f"Unknown loss: {loss}")

    # ── TabPFN helpers ────────────────────────────────────────────────────────

    def _load_tabpfn(self):
        """Load the fitted TabPFN classifier from the .p file (requires GPU)."""
        if self._tabpfn is not None:
            return

        if not self._tabpfn_path or not os.path.exists(self._tabpfn_path):
            raise FileNotFoundError(
                f"TabPFN file not found: {self._tabpfn_path}. "
                "Tabular branch requires a GPU and the fitted tabpfn .p file."
            )

        if not torch.cuda.is_available():
            raise RuntimeError(
                "TabPFN requires a CUDA GPU. "
                "On CPU-only machines use the T1W_FLAIR or single-MRI models."
            )

        import pickle
        with open(self._tabpfn_path, 'rb') as f:
            self._tabpfn = pickle.load(f)

    def _get_tabpfn_embedding(self, x_tab: torch.Tensor) -> torch.Tensor:
        """
        Generate a 1024-dim embedding from tabular input using TabPFN.

        TabPFN was trained with 128 ensemble configurations; the per-config
        probability outputs (shape [128, B, 8]) are stacked and transposed
        to [B, 1024].

        Parameters
        ----------
        x_tab : torch.Tensor, shape [B, n_tab_features]

        Returns
        -------
        torch.Tensor, shape [B, 1024]
        """
        self._load_tabpfn()

        x_np = x_tab.detach().cpu().numpy()

        # Collect raw per-configuration probability outputs
        per_config_probs = []
        classifier = self._tabpfn.classifier if hasattr(self._tabpfn, 'classifier') else self._tabpfn
        n_configs = getattr(classifier, 'N_ensemble_configurations', 128)

        # Temporarily set to 1 config and iterate to collect all
        orig_n = classifier.N_ensemble_configurations
        for _ in range(n_configs):
            classifier.N_ensemble_configurations = 1
            proba = classifier.predict_proba(x_np, normalize_with_test=False)
            per_config_probs.append(torch.tensor(proba, dtype=torch.float32))

        classifier.N_ensemble_configurations = orig_n

        # Stack: [B, n_configs * n_classes] = [B, 1024]
        embedding = torch.cat(per_config_probs, dim=1).to(x_tab.device)

        if embedding.shape[1] != TABPFN_EMBED_DIM:
            # Fallback: pad or truncate to expected dim
            if embedding.shape[1] < TABPFN_EMBED_DIM:
                pad = torch.zeros(embedding.shape[0],
                                  TABPFN_EMBED_DIM - embedding.shape[1],
                                  device=x_tab.device)
                embedding = torch.cat([embedding, pad], dim=1)
            else:
                embedding = embedding[:, :TABPFN_EMBED_DIM]

        return embedding

    # ── Forward ───────────────────────────────────────────────────────────────

    def forward(self, x_tab: torch.Tensor, x_mri: torch.Tensor) -> torch.Tensor:
        # Tabular: TabPFN → reduce_tab → [B, 64]
        tab_embed_raw = self._get_tabpfn_embedding(x_tab)   # [B, 1024]
        tab_embed = self.reduce_tab(tab_embed_raw)            # [B, 64]

        # MRI: ResNet conv_seg → [B, 64]
        mri_embed = self.mri_model(x_mri)                    # [B, 64]

        # Fusion: cat → [B, 128] → fuse_model → [B, n_classes]
        fused = torch.cat([tab_embed, mri_embed], dim=1)
        return self.fuse_model(fused).to(dtype=torch.float32)

    def predict(self, batch):
        x_tab = batch['TABULAR'].cuda()
        x_mri = batch[self.mri_modality]['data'].cuda()
        return self.forward(x_tab, x_mri)

    def general_step(self, batch, batch_idx):
        x_tab = batch['TABULAR']
        x_mri = batch[self.mri_modality]['data']
        y     = batch['DIAGNOSIS']
        y_hat = self.forward(x_tab, x_mri)
        loss  = self.criterion(y_hat, y)
        y_hat = softmax(y_hat, dim=1)
        return {'loss': loss, 'y': y, 'y_hat': y_hat}

    def configure_optimizers(self):
        params = [
            {'params': self.fuse_model.parameters(),   'lr': self.hparams['lr']},
            {'params': self.reduce_tab.parameters(),   'lr': self.hparams['lr']},
            {'params': self.mri_model.parameters(),    'lr': self.hparams.get('lr_pretrained', 1e-6)},
        ]
        if self.hparams.get('optimizer', 'adam') == 'adam':
            optimizer = torch.optim.Adam(params, weight_decay=self.hparams.get('l2_reg', 0))
        elif self.hparams['optimizer'] == 'sgd':
            optimizer = torch.optim.SGD(params, momentum=self.hparams.get('momentum', 0.9))
        else:
            optimizer = torch.optim.RMSprop(params, momentum=self.hparams.get('momentum', 0.9))

        scheduler = ReduceLROnPlateau(optimizer, factor=self.hparams.get('reduce_factor_lr_schedule', 0.1))
        return {"optimizer": optimizer, "lr_scheduler": scheduler, "monitor": "val_loss"}
