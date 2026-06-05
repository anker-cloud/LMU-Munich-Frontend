"""
See "TabPFN: A Transformer That Solves Small Tabular Classification Problems in a Second"
https://arxiv.org/abs/2207.01848
"""

# ── Fix for TabPFN compatibility with PyTorch 2.0+ ────────────────────────────
try:
    from torch.nn.modules.transformer import Optional
except ImportError:
    from typing import Optional as TypingOptional
    import torch.nn.modules.transformer as transformer_module
    transformer_module.Optional = TypingOptional

import tabpfn
import torch
from models.dataloader import *
import pytorch_lightning as pl
NOT_IMPLEMENTED_ERROR_MESSAGE = (
    "The tabular model was not trained with pl." +
    "This wrapper is just for testing purposes."
)



class TabPFNClassifier(pl.LightningModule):
    def __init__(self, hparams):
        super().__init__()

        self.classifier = tabpfn.TabPFNClassifier(device='cuda', N_ensemble_configurations=hparams["ensemble_size"])


    def train_model(self, x_train, y_train):
        self.classifier.fit(x_train, y_train, overwrite_warning=True)
        return self.classifier


    def forward(self, x):
        x = x.cpu().squeeze(dim=1)
        out = self.classifier.predict_proba(x, normalize_with_test=False)
        out = torch.tensor(out, device=self.device)
        return out

    def general_step(self, batch, batch_idx):
        raise NotImplementedError(NOT_IMPLEMENTED_ERROR_MESSAGE)

    def configure_optimizers(self):
        raise NotImplementedError(NOT_IMPLEMENTED_ERROR_MESSAGE)


