import torch
import pytorch_lightning as pl
from net_utils.confusion_matrix import visualize_confusion_matrix
from torchmetrics.classification import MulticlassF1Score, MulticlassAccuracy, MulticlassPrecision, \
    MulticlassRecall, MulticlassConfusionMatrix
from abc import ABC, abstractmethod
import matplotlib.pyplot as plt

try:
    from aim import Image as AimImage
    _AIM_AVAILABLE = True
except ImportError:
    _AIM_AVAILABLE = False


class Base_Model(pl.LightningModule, ABC):
    def __init__(self, hparams, gpu_id=None):
        super().__init__()
        self.save_hyperparameters(hparams, ignore=["gpu_id"])
        self.inverted_class_mapping = {v: k for k, v in hparams['class_mapping'].items()}

        self.f1_score_train = MulticlassF1Score(num_classes=hparams['n_classes'], average='macro')
        self.f1_score_val = MulticlassF1Score(num_classes=hparams['n_classes'], average='macro')
        self.f1_score_test = MulticlassF1Score(num_classes=hparams['n_classes'], average='macro')
        self.accuracy_train = MulticlassAccuracy(num_classes=hparams['n_classes'], average='macro')
        self.accuracy_val = MulticlassAccuracy(num_classes=hparams['n_classes'], average='macro')
        self.accuracy_test = MulticlassAccuracy(num_classes=hparams['n_classes'], average='macro')
        self.precision_train = MulticlassPrecision(num_classes=hparams['n_classes'], average='macro')
        self.precision_val = MulticlassPrecision(num_classes=hparams['n_classes'], average='macro')
        self.precision_test = MulticlassPrecision(num_classes=hparams['n_classes'], average='macro')
        self.recall_train = MulticlassRecall(num_classes=hparams['n_classes'], average='macro')
        self.recall_val = MulticlassRecall(num_classes=hparams['n_classes'], average='macro')
        self.recall_test = MulticlassRecall(num_classes=hparams['n_classes'], average='macro')
        self.cm_train = MulticlassConfusionMatrix(num_classes=hparams['n_classes'])
        self.cm_val = MulticlassConfusionMatrix(num_classes=hparams['n_classes'])
        self.cm_test = MulticlassConfusionMatrix(num_classes=hparams['n_classes'])
        self.f1_score_per_class_train = MulticlassF1Score(num_classes=hparams['n_classes'], average='none')
        self.f1_score_per_class_val = MulticlassF1Score(num_classes=hparams['n_classes'], average='none')
        self.f1_score_per_class_test = MulticlassF1Score(num_classes=hparams['n_classes'], average='none')

    @abstractmethod
    def forward(self, x):
        pass


    @abstractmethod
    def predict(self, batch) -> dict:
        pass

    @abstractmethod
    def general_step(self, batch, batch_idx) -> dict:
        pass

    @abstractmethod
    def configure_optimizers(self):
        pass


    def training_step(self, batch, batch_idx):
        result = self.general_step(batch, batch_idx)
        loss = result['loss']
        y = result['y']
        y_hat = result['y_hat']
        self.log("train_loss", torch.tensor([loss]))
        self.cm_train.update(y_hat, y)
        self.f1_score_train.update(y_hat, y)
        self.accuracy_train.update(y_hat, y)
        self.precision_train.update(y_hat, y)
        self.recall_train.update(y_hat, y)
        self.f1_score_per_class_train.update(y_hat, y)
        return {'loss': loss}

    def validation_step(self, batch, batch_idx):
        result = self.general_step(batch, batch_idx)
        loss = result['loss']
        y = result['y']
        y_hat = result['y_hat']
        self.log("val_loss_step", torch.tensor([loss]))
        self.cm_val.update(y_hat, y)
        self.f1_score_val.update(y_hat, y)
        self.accuracy_val.update(y_hat, y)
        self.precision_val.update(y_hat, y)
        self.recall_val.update(y_hat, y)
        self.f1_score_per_class_val.update(y_hat, y)
        return {'val_loss_step': loss}

    def test_step(self, batch, batch_idx):
        result = self.general_step(batch, batch_idx)
        loss = result['loss']
        y = result['y']
        y_hat = result['y_hat']
        self.log("test_loss_step", torch.tensor([loss]))
        self.cm_test.update(y_hat, y)
        self.f1_score_test.update(y_hat, y)
        self.accuracy_test.update(y_hat, y)
        self.precision_test.update(y_hat, y)
        self.recall_test.update(y_hat, y)
        self.f1_score_per_class_test.update(y_hat, y)
        return {'test_loss_step': loss}



    def training_epoch_end(self, outputs) -> None:
        train_loss = torch.stack([x['loss'] for x in outputs]).mean()
        f1_score_per_class = self.f1_score_per_class_train.compute()
        cm = self.cm_train.compute()
        log_dict = {
            'train_loss': train_loss,
            'train_f1_score': self.f1_score_train.compute(),
            'train_accuracy': self.accuracy_train.compute(),
            'train_precision': self.precision_train.compute(),
            'train_recall': self.recall_train.compute(),
            'epoch': float(self.current_epoch)
        }
        for i in range(self.hparams["n_classes"]):
            class_name = self.inverted_class_mapping[i]
            log_dict[f"train_f1_epoch_class_{class_name}"] = f1_score_per_class[i]
        self.log_dict(log_dict)
        cm = visualize_confusion_matrix(cm.detach().cpu().numpy(), self.hparams['class_mapping'])
        if _AIM_AVAILABLE and self.logger:
            cm_im = AimImage(cm, format='jpeg')
            self.logger.experiment.track(cm_im, name='train_confusion_matrix', step=self.current_epoch)
        plt.close(cm)

        self.f1_score_train.reset()
        self.accuracy_train.reset()
        self.precision_train.reset()
        self.recall_train.reset()
        self.cm_train.reset()
        self.f1_score_per_class_train.reset()

    def validation_epoch_end(self, outputs) -> None:
        val_loss = torch.stack([x['val_loss_step'] for x in outputs]).mean()
        f1_score_per_class = self.f1_score_per_class_val.compute()
        cm = self.cm_val.compute()
        log_dict = {
            'val_loss': val_loss,
            'val_f1_score': self.f1_score_val.compute(),
            'val_accuracy': self.accuracy_val.compute(),
            'val_precision': self.precision_val.compute(),
            'val_recall': self.recall_val.compute(),
            'epoch': float(self.current_epoch)
        }
        for i in range(self.hparams["n_classes"]):
            class_name = self.inverted_class_mapping[i]
            log_dict[f"val_f1_score_class_{class_name}"] = f1_score_per_class[i]
        self.log_dict(log_dict)
        cm = visualize_confusion_matrix(cm.detach().cpu().numpy(), self.hparams['class_mapping'])
        if _AIM_AVAILABLE and self.logger:
            cm_im = AimImage(cm, format='jpeg')
            self.logger.experiment.track(cm_im, name='val_confusion_matrix', step=self.current_epoch)
        plt.close(cm)

        self.f1_score_val.reset()
        self.accuracy_val.reset()
        self.precision_val.reset()
        self.recall_val.reset()
        self.cm_val.reset()
        self.f1_score_per_class_val.reset()


    def test_epoch_end(self, outputs) -> None:
        test_loss = torch.stack([x['test_loss_step'] for x in outputs]).mean()
        f1_score_per_class = self.f1_score_per_class_test.compute()
        cm = self.cm_test.compute()
        log_dict = {
            'val_loss': test_loss,
            'val_f1_score': self.f1_score_test.compute(),
            'val_accuracy': self.accuracy_test.compute(),
            'val_precision': self.precision_test.compute(),
            'val_recall': self.recall_test.compute(),
        }
        for i in range(self.hparams["n_classes"]):
            class_name = self.inverted_class_mapping[i]
            log_dict[f"test_f1_score_class_{class_name}"] = f1_score_per_class[i]
        self.log_dict(log_dict)
        cm = visualize_confusion_matrix(cm.detach().cpu().numpy(), self.hparams['class_mapping'])
        if _AIM_AVAILABLE and self.logger:
            cm_im = AimImage(cm, format='jpeg')
            self.logger.experiment.track(cm_im, name='test_confusion_matrix', step=self.current_epoch)
        plt.close(cm)

        self.f1_score_test.reset()
        self.accuracy_test.reset()
        self.precision_test.reset()
        self.recall_test.reset()
        self.cm_test.reset()
        self.f1_score_per_class_test.reset()

