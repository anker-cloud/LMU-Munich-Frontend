import torch
import torch.nn as nn
from torch.optim.lr_scheduler import ReduceLROnPlateau
from torch.nn.functional import softmax
from models.base_model import Base_Model
from models.fusion_models.tab_mri_fusion import TabMRIFusionModel
from models.fusion_models.t1w_flair_fusion import T1wFlairFusionModel
from net_utils.focal_loss import FocalLoss

class AllModalitiesFusionModel(Base_Model):
    def __init__(self, hparams):
        super().__init__(hparams)

        self.tab_t1w_model = TabMRIFusionModel.load_from_checkpoint(hparams['weights_path_tab_t1w'])
        tab_t1w_dropout = True if [module for module in self.tab_t1w_model.fuse_model.modules()
                               if isinstance(module, nn.Dropout)] else False
        tab_t1w_multiplier = 4 if tab_t1w_dropout else 3
        tab_t1w_layer_cutoff = hparams['linear_cutoff'] * tab_t1w_multiplier
        self.tab_t1w_model.fuse_model = self.tab_t1w_model.fuse_model[:-tab_t1w_layer_cutoff]

        self.tab_flair_model = TabMRIFusionModel.load_from_checkpoint(hparams['weights_path_tab_flair'])
        tab_flair_dropout = True if [module for module in self.tab_flair_model.fuse_model.modules()
                                   if isinstance(module, nn.Dropout)] else False
        tab_flair_multiplier = 4 if tab_flair_dropout else 3
        tab_flair_layer_cutoff = hparams['linear_cutoff'] * tab_flair_multiplier
        self.tab_flair_model.fuse_model = self.tab_flair_model.fuse_model[:-tab_flair_layer_cutoff]

        self.t1w_flair_model = T1wFlairFusionModel.load_from_checkpoint(hparams['weights_path_t1w_flair'])
        t1w_flair_dropout = True if [module for module in self.t1w_flair_model.fuse_model.modules()
                                     if isinstance(module, nn.Dropout)] else False
        t1w_flair_multiplier = 4 if t1w_flair_dropout else 3
        t1w_flair_layer_cutoff = hparams['linear_cutoff'] * t1w_flair_multiplier
        self.t1w_flair_model.fuse_model = self.t1w_flair_model.fuse_model[:-t1w_flair_layer_cutoff]


        if (hparams['method']=='attention') and (hparams['linear_cutoff']==2):
            n_in = 32 * 2 ** hparams['linear_cutoff'] * 3 * 2
            #n_out = 32 * 2 ** hparams['linear_cutoff'] * 4
        else:
            n_in = 32 * 2 ** hparams['linear_cutoff'] * 3
        n_out = 32 * 2 ** hparams['linear_cutoff'] #* 2
        modules = nn.ModuleList()
        modules.append(nn.Linear(n_in, n_out))
        modules.append(nn.BatchNorm1d(n_out))
        modules.append(nn.ReLU())
        if hparams['dropout']:
            modules.append(nn.Dropout(0.5))
        n_in = n_out

        for i in range(hparams['linear_cutoff']-1):
            n_out = int(n_in / 2)
            modules.append(nn.Linear(n_in, n_out))
            modules.append(nn.BatchNorm1d(n_out))
            modules.append(nn.ReLU())
            if hparams['dropout']:
                modules.append(nn.Dropout(0.5))
            n_in = n_out
        modules.append(nn.Linear(n_in, hparams["n_classes"]))

        '''
        self.tab_t1w_model = TabMRIFusionModel.load_from_checkpoint(hparams['weights_path_tab_t1w'])
        self.tab_t1w_model.fuse_model = self.tab_t1w_model.fuse_model[:-4]
        self.tab_flair_model = TabMRIFusionModel.load_from_checkpoint(hparams['weights_path_tab_flair'])
        self.tab_flair_model.fuse_model = self.tab_flair_model.fuse_model[:-4]
        self.t1w_flair_model = T1wFlairFusionModel.load_from_checkpoint(hparams['weights_path_t1w_flair'])
        self.t1w_flair_model.fuse_model = self.t1w_flair_model.fuse_model[:-4]

        n_in = 64 * 3
        n_out = 64
        modules = nn.ModuleList()
        modules.append(nn.Linear(n_in, n_out))
        modules.append(nn.BatchNorm1d(n_out))
        modules.append(nn.ReLU())
        modules.append(nn.Dropout(hparams['dropout_prob']))
        modules.append(nn.Linear(n_in, hparams["n_classes"]))
        '''

        self.fuse_model = nn.Sequential(*modules)

        loss = hparams.get('loss', 'focal_loss')
        if loss == 'cross_entropy':
            class_weights = hparams.get('class_weights', None)
            self.criterion = nn.CrossEntropyLoss(weight=class_weights)
        elif loss == 'focal_loss':
            self.criterion = FocalLoss(gamma=self.hparams.get('fl_gamma', 2))
        else:
            raise ValueError('Loss invalid!')


    def forward(self, x_tab, x_t1w, x_flair):
        out_tab_t1w = self.tab_t1w_model(x_tab, x_t1w)
        out_tab_flair = self.tab_flair_model(x_tab, x_flair)
        out_t1w_flair = self.t1w_flair_model(x_t1w, x_flair)
        out_all = torch.cat((out_tab_t1w, out_tab_flair, out_t1w_flair), dim=1)
        out_all = self.fuse_model(out_all)
        return out_all

    def predict(self, batch):
        x_tab = batch['TABULAR'].cuda()
        x_t1w = batch['T1w']['data'].cuda()
        x_flair = batch['FLAIR']['data'].cuda()
        y_hat = self.forward(x_tab, x_t1w, x_flair).to(dtype=torch.float32)
        return y_hat

    def general_step(self, batch, batch_idx):
        x_tab = batch['TABULAR']
        x_t1w = batch['T1w']['data']
        x_flair = batch['FLAIR']['data']
        y = batch['DIAGNOSIS']
        y_hat = self.forward(x_tab, x_t1w, x_flair).to(dtype=torch.float32)
        loss = self.criterion(y_hat, y)
        y_hat = softmax(y_hat)
        return {'loss': loss, 'y': y, 'y_hat': y_hat}


    def configure_optimizers(self):
        parameters_optim = []
        for name, param in self.fuse_model.named_parameters():
            parameters_optim.append({
                'params': param,
                'lr': self.hparams['lr']})
        for name, param in self.tab_t1w_model.named_parameters():
            parameters_optim.append({
                'params': param,
                'lr': self.hparams['lr_pretrained']})
        for name, param in self.tab_flair_model.named_parameters():
            parameters_optim.append({
                'params': param,
                'lr': self.hparams['lr_pretrained']})
        for name, param in self.t1w_flair_model.named_parameters():
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
