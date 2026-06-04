import os
import torch
import torch.nn as nn
from torch.optim.lr_scheduler import ReduceLROnPlateau
from MedicalNet.model import generate_model
from MedicalNet.setting import parse_opts
from torch.nn.functional import softmax
from models.base_model import Base_Model
from net_utils.focal_loss import FocalLoss


class PretrainedResNet(Base_Model):
    def __init__(self, hparams):
        super().__init__(hparams)
        self.modality = hparams['modality']
        # Initialize Model
        opts = parse_opts()
        # pretrain_path is only needed when training from scratch.
        # When loading from a checkpoint the weights are overwritten anyway,
        # so skip loading if the original server path is gone.
        pretrain_path = hparams.get(
            'pretrain_path',
            '/media/demenzbild/Studiendaten3/all_datasets/MedicalNet/MedicalNet/pretrain/resnet_18_23dataset.pth'
        )
        opts.pretrain_path = pretrain_path if os.path.exists(pretrain_path) else ''
        opts.no_cuda      = not torch.cuda.is_available()
        opts.gpu_id       = hparams.get("gpu_id", [0]) if torch.cuda.is_available() else [0]

        opts.model_depth = 18
        n_in = 512 # based on model_depth, number of channels
        # generate pre-trained resnet
        resnet, _ = generate_model(opts)
        # DataParallel wraps the model in .module — but only when CUDA is used.
        # On CPU generate_model returns the bare ResNet directly.
        self.model = resnet.module if hasattr(resnet, 'module') else resnet

        # create empty module list that will be filled based on hparams options
        modules = nn.ModuleList()

        #if "batchnorm_begin" in hparams and hparams["batchnorm_begin"]:
        modules.append(nn.BatchNorm3d(n_in))
        # global avg pool
        modules.append(nn.AdaptiveAvgPool3d(1)) #The output is of size D x H x W, for any input size.
        modules.append(nn.Flatten())

        if 'linear_layer_option' in hparams:
            # Legacy checkpoint style: explicit list of layer sizes e.g. [256, 64]
            for n_out in hparams['linear_layer_option']:
                modules.append(nn.Linear(n_in, n_out))
                modules.append(nn.BatchNorm1d(n_out))
                modules.append(nn.ReLU())
                modules.append(nn.Dropout(p=hparams.get('dropout_prob', 0)))
                n_in = n_out
            modules.append(nn.Linear(n_in, hparams["n_classes"]))
        else:
            # New-style: constant + decreasing blocks
            for i in range(hparams.get('n_linear_out_const', 1)):
                modules.append(nn.Linear(n_in, n_in))
                modules.append(nn.BatchNorm1d(n_in))
                modules.append(nn.ReLU())
                if hparams.get('dropout', False):
                    modules.append(nn.Dropout(p=0.5))

            for i in range(hparams.get('n_linear_out_decr', 1)):
                n_out = int(n_in / 2)
                modules.append(nn.Linear(n_in, n_out))
                modules.append(nn.BatchNorm1d(n_out))
                modules.append(nn.ReLU())
                if hparams.get('dropout', False):
                    modules.append(nn.Dropout(p=0.5))
                n_in = n_out
            modules.append(nn.Linear(n_in, hparams["n_classes"]))

        '''
        for l in hparams['linear_layer_option']: 
            n_out = l
            modules.append(nn.Linear(n_in, n_out))
            modules.append(nn.BatchNorm1d(n_out))
            modules.append(nn.ReLU())
            modules.append(nn.Dropout(hparams['dropout_prob']))
            n_in = n_out
        modules.append(nn.Linear(n_in, hparams["n_classes"]))
        '''

        self.model.conv_seg = nn.Sequential(*modules)

        if hparams['loss']=='cross_entropy':
            self.criterion = nn.CrossEntropyLoss(weight=hparams['class_weights'])
        elif hparams['loss']=='focal_loss':
            self.criterion = FocalLoss(gamma=self.hparams['fl_gamma'])
        else:
            raise ValueError('Loss invalid!')


    def forward(self, x):
        return self.model(x).to(dtype=torch.float32)


    def predict(self, batch):
        x_mri = batch[self.modality]['data'].cuda()
        y_hat = self.forward(x_mri).to(dtype=torch.float32)
        return y_hat

    def general_step(self, batch, batch_idx):
        x = batch[self.modality]['data']
        y = batch['DIAGNOSIS']
        y_hat = self.forward(x)
        loss = self.criterion(y_hat, y)
        y_hat = softmax(y_hat)
        return {'loss': loss, 'y': y, 'y_hat': y_hat}


    def configure_optimizers(self):
        parameters_optim = []
        for name, param in self.model.named_parameters():
            if 'conv_seg' in name:
                parameters_optim.append({
                    'params': param,
                    'lr': self.hparams['lr']})
            elif 'lr_pretrained' not in self.hparams or not self.hparams['lr_pretrained']:
                param.requires_grad = False
                parameters_optim.append({'params': param})
            else:
                param.requires_grad = True
                parameters_optim.append({
                    'params': param,
                    'lr': self.hparams['lr_pretrained']})

        if self.hparams['optimizer']=='adam':
            optimizer = torch.optim.Adam(parameters_optim, weight_decay=self.hparams['l2_reg'])
        elif self.hparams['optimizer']=='sgd':
            optimizer = torch.optim.SGD(parameters_optim, momentum=self.hparams['momentum'])
        elif self.hparams['optimizer']=='rmsprop':
            optimizer = torch.optim.RMSprop(parameters_optim, momentum=self.hparams['momentum'])
        else:
            raise ValueError('Not a valid optimizer!')
        scheduler = ReduceLROnPlateau(optimizer, factor=self.hparams['reduce_factor_lr_schedule'])
        return {"optimizer": optimizer,
                "lr_scheduler": scheduler,
                "monitor": "val_loss"}




