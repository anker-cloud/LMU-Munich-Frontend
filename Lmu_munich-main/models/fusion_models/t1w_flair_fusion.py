import torch
import torch.nn as nn
from torch.optim.lr_scheduler import ReduceLROnPlateau
from torch.nn.functional import softmax
from models.base_model import Base_Model
from models.mri_models.pretrained_resnet import PretrainedResNet
from models.tab_models.tabular_nn import TabularNN
from net_utils.focal_loss import FocalLoss


class T1wFlairFusionModel(Base_Model):
    def __init__(self, hparams):
        super().__init__(hparams)
        self.fusion_strategy = hparams['fusion_strategy']
        modules = nn.ModuleList()

        if self.fusion_strategy == 'early':
            n_in = 2 # due to fusion of t1w and flair
            n_out = 8
            #stride_dict = {3:1, 5:3, 7:5}
            for kernel_size in hparams['kernel_sizes']:
                modules.append(nn.Conv3d(n_in, n_out, kernel_size,
                                         stride=1,#stride_dict[kernel_size],
                                         padding="same"))
                if hparams['normalization']=='batch_norm':
                    modules.append(nn.BatchNorm3d(n_out))
                elif hparams['normalization']=='instance_norm':
                    modules.append(nn.InstanceNorm3d(n_out))
                modules.append(nn.ReLU())
                modules.append(nn.MaxPool3d(2))
                if hparams['dropout3d']:
                    modules.append(torch.nn.Dropout3d(p=0.5))
                '''modules.append(torch.nn.Dropout3d(p=hparams['dropout3d_prob']))'''
                n_in = n_out
                n_out = n_out * 2

            modules.append(nn.AdaptiveAvgPool3d(1))
            modules.append(nn.Flatten())

            # linear layers of size 512
            for i in range(hparams['n_linear_out_const']):
                modules.append(nn.Linear(n_in, n_in))
                modules.append(nn.BatchNorm1d(n_in))
                modules.append(nn.ReLU())
                if hparams['dropout']:
                    modules.append(nn.Dropout(p=0.5))

            # linear layers of decreasing size 512 -> 256 -> 128 -> 64
            for i in range(hparams['n_linear_out_decr']):
                n_out = int(n_in / 2)
                modules.append(nn.Linear(n_in, n_out))
                modules.append(nn.BatchNorm1d(n_out))
                modules.append(nn.ReLU())
                if hparams['dropout']:
                    modules.append(nn.Dropout(p=0.5))
                n_in = n_out
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
            modules.append(nn.Linear(n_in, hparams["n_classes"]))

        elif self.fusion_strategy == 'joint':
            self.t1w_model = PretrainedResNet.load_from_checkpoint(hparams['weights_path_t1w'])
            self.flair_model = PretrainedResNet.load_from_checkpoint(hparams['weights_path_flair'])
            # only keep 3d resnet modules
            self.t1w_model.model = torch.nn.Sequential(*(list(self.t1w_model.model.children())[:-1]))  # in 1,2,3
            self.flair_model.model = torch.nn.Sequential(*(list(self.flair_model.model.children())[:-1]))

            # new 3d modules for stacked feature maps
            # 2 * 512 channels as 512 channels for flair and t1w each
            modules.append(nn.Conv3d(2 * 512, 1024, kernel_size=3, stride=1, padding="same"))
            if hparams['normalization'] == 'batch_norm':
                modules.append(nn.BatchNorm3d(1024))
            elif hparams['normalization'] == 'instance_norm':
                modules.append(nn.InstanceNorm3d(1024))
            modules.append(nn.ReLU())
            modules.append(nn.Conv3d(1024, 1024, kernel_size=3, stride=1, padding="same"))
            if hparams['normalization'] == 'batch_norm':
                modules.append(nn.BatchNorm3d(1024))
            elif hparams['normalization'] == 'instance_norm':
                modules.append(nn.InstanceNorm3d(1024))

            modules.append(nn.AdaptiveAvgPool3d(1))  # The output is of size D x H x W, for any input size.
            modules.append(nn.Flatten())

            # linear layers of decreasing size 1024 -> 512 -> 256 -> 128 -> 64
            n_in = 1024
            for i in range(4):
                n_out = int(n_in / 2)
                modules.append(nn.Linear(n_in, n_out))
                modules.append(nn.BatchNorm1d(n_out))
                modules.append(nn.ReLU())
                if hparams['dropout']:
                    modules.append(nn.Dropout(p=0.5))
                n_in = n_out

            '''
            for l in hparams['linear_layer_option']: 
                n_out = l
                modules.append(nn.Linear(n_in, n_out))
                modules.append(nn.BatchNorm1d(n_out))
                modules.append(nn.ReLU())
                modules.append(nn.Dropout(hparams['dropout_prob']))
                n_in = n_out
            '''
            modules.append(nn.Linear(n_in, hparams["n_classes"]))

        elif self.fusion_strategy == 'late': # late fusion
            self.t1w_model = PretrainedResNet.load_from_checkpoint(hparams['weights_path_t1w'])
            self.flair_model = PretrainedResNet.load_from_checkpoint(hparams['weights_path_flair'])
            '''
            if hparams['linear_cutoff']=='early':
                self.t1w_model.model.conv_seg = self.t1w_model.model.conv_seg[:1]  
                self.flair_model.model.conv_seg = self.flair_model.model.conv_seg[:1]
                n_in = 1024
                for l in hparams['linear_layer_option']:
                    n_out = l
                    modules.append(nn.Linear(n_in, n_out))
                    modules.append(nn.BatchNorm1d(n_out))
                    modules.append(nn.ReLU())
                    modules.append(nn.Dropout(hparams['dropout_prob']))
                    n_in = n_out
                modules.append(nn.Linear(n_in, hparams["n_classes"]))
                
            else: # late
                self.t1w_model.model.conv_seg = self.t1w_model.model.conv_seg[:-4]  
                self.flair_model.model.conv_seg = self.flair_model.model.conv_seg[:-4]
                n_in = 128
                modules.append(nn.Linear(128, 64))
                modules.append(nn.BatchNorm1d(64))
                modules.append(nn.ReLU())
                modules.append(nn.Dropout(hparams['dropout_prob']))
                modules.append(nn.Linear(n_in, hparams["n_classes"]))
            '''

            # check if model contains dropout layers
            t1w_dropout = True if [module for module in self.t1w_model.model.conv_seg.modules()
                                    if isinstance(module, nn.Dropout)] else False
            flair_dropout = True if [module for module in self.flair_model.model.conv_seg.modules()
                                    if isinstance(module, nn.Dropout)] else False
            t1w_multiplier = 4 if t1w_dropout else 3
            t1w_layer_cutoff = hparams['linear_cutoff'] * t1w_multiplier
            flair_multiplier = 4 if flair_dropout else 3
            flair_layer_cutoff = hparams['linear_cutoff'] * flair_multiplier

            self.t1w_model.model.conv_seg = self.t1w_model.model.conv_seg[:-t1w_layer_cutoff]  # in 1,2,3,4
            self.flair_model.model.conv_seg = self.flair_model.model.conv_seg[:-flair_layer_cutoff]

            n_in = 32 * 2 ** hparams['linear_cutoff'] * 2
            for i in range(hparams['linear_cutoff']):
                n_out = int(n_in / 2)
                modules.append(nn.Linear(n_in, n_out))
                modules.append(nn.BatchNorm1d(n_out))
                modules.append(nn.ReLU())
                if hparams['dropout']:
                    modules.append(nn.Dropout(0.5))
                n_in = n_out
            modules.append(nn.Linear(n_in, hparams["n_classes"]))

        elif self.fusion_strategy=='attention':
            self.t1w_model = PretrainedResNet.load_from_checkpoint(hparams['weights_path_t1w'])
            self.flair_model = PretrainedResNet.load_from_checkpoint(hparams['weights_path_flair'])
            # check if model contains dropout layers
            t1w_dropout = True if [module for module in self.t1w_model.model.conv_seg.modules()
                                   if isinstance(module, nn.Dropout)] else False
            flair_dropout = True if [module for module in self.flair_model.model.conv_seg.modules()
                                     if isinstance(module, nn.Dropout)] else False
            t1w_multiplier = 4 if t1w_dropout else 3
            t1w_layer_cutoff = hparams['linear_cutoff'] * t1w_multiplier
            flair_multiplier = 4 if flair_dropout else 3
            flair_layer_cutoff = hparams['linear_cutoff'] * flair_multiplier

            self.t1w_model.model.conv_seg = self.t1w_model.model.conv_seg[:-t1w_layer_cutoff]
            self.flair_model.model.conv_seg = self.flair_model.model.conv_seg[:-flair_layer_cutoff]

            '''
            self.t1w_model.model.conv_seg = self.t1w_model.model.conv_seg[:-4]  
            self.flair_model.model.conv_seg = self.flair_model.model.conv_seg[:-4]
            '''

            self.self_attention_t1w = nn.MultiheadAttention(embed_dim=64, num_heads=4, batch_first=True)
            self.self_attention_flair = nn.MultiheadAttention(embed_dim=64, num_heads=4, batch_first=True)
            self.cross_modal_attention_1 = nn.MultiheadAttention(embed_dim=64, num_heads=4, batch_first=True)
            self.cross_modal_attention_2 = nn.MultiheadAttention(embed_dim=64, num_heads=4, batch_first=True)
            modules = nn.ModuleList()
            modules.append(nn.Linear(256, 64))
            modules.append(nn.BatchNorm1d(64))
            modules.append(nn.ReLU())
            if hparams['dropout']:
                modules.append(nn.Dropout(0.5))
            '''modules.append(nn.Dropout(hparams['dropout_prob']))'''
            modules.append(nn.Linear(64, hparams["n_classes"]))
            self.fuse_model = nn.Sequential(*modules)

        else:
            raise ValueError('Not a valid fusion strategy!')

        self.fuse_model = nn.Sequential(*modules)

        loss = hparams.get('loss', 'focal_loss')
        if loss == 'cross_entropy':
            class_weights = hparams.get('class_weights', None)
            self.criterion = nn.CrossEntropyLoss(weight=class_weights)
        elif loss == 'focal_loss':
            self.criterion = FocalLoss(gamma=self.hparams.get('fl_gamma', 2))
        else:
            raise ValueError('Loss invalid!')


    def forward(self, x_t1w, x_flair):
        if self.fusion_strategy == 'early':
            x = torch.cat((x_t1w, x_flair), dim=1)
            y_hat = self.fuse_model(x).to(dtype=torch.float32)
        elif self.fusion_strategy == 'joint':
            out_t1w = self.t1w_model(x_t1w)
            out_flair = self.flair_model(x_flair)#.squeeze()
            out_both = torch.cat((out_t1w, out_flair), dim=1).to(dtype=torch.float32)
            y_hat = self.fuse_model(out_both).to(dtype=torch.float32)
        elif self.fusion_strategy=='late':
            out_t1w = self.t1w_model(x_t1w)
            out_flair = self.flair_model(x_flair)
            out_both = torch.cat((out_t1w, out_flair), dim=1).to(dtype=torch.float32)
            y_hat = self.fuse_model(out_both).to(dtype=torch.float32)
        else: #attention
            out_t1w = self.t1w_model(x_t1w)
            out_flair = self.flair_model(x_flair)
            out_t1w = out_t1w.unsqueeze(1)
            out_flair = out_flair.unsqueeze(1)
            att_t1w = self.self_attention_t1w(out_t1w, out_t1w, out_t1w, need_weights=False)[0]
            att_flair = self.self_attention_flair(out_flair, out_flair, out_flair, need_weights=False)[0]
            att_1 = self.cross_modal_attention_1(att_t1w, att_flair, att_flair, need_weights=False)[0]
            att_2 = self.cross_modal_attention_2(att_flair, att_t1w, att_t1w, need_weights=False)[0]
            out_all = torch.cat((att_1.squeeze(1), att_2.squeeze(1), out_t1w.squeeze(1), out_flair.squeeze(1)), dim=1)
            y_hat = self.fuse_model(out_all).to(dtype=torch.float32)
        return y_hat

    def predict(self, batch):
        x_t1w = batch['T1w']['data'].cuda()
        x_flair = batch['FLAIR']['data'].cuda()
        y_hat = self.forward(x_t1w, x_flair).to(dtype=torch.float32)
        return y_hat


    def general_step(self, batch, batch_idx):
        x_t1w = batch['T1w']['data']
        x_flair = batch['FLAIR']['data']
        y = batch['DIAGNOSIS']
        y_hat = self.forward(x_t1w, x_flair)
        loss = self.criterion(y_hat, y)
        y_hat = softmax(y_hat)
        return {'loss': loss, 'y': y, 'y_hat': y_hat}


    def configure_optimizers(self):
        parameters_optim = []
        for name, param in self.fuse_model.named_parameters():
            parameters_optim.append({
                'params': param,
                'lr': self.hparams['lr']})
        if self.fusion_strategy != 'early':
            for name, param in self.t1w_model.named_parameters():
                parameters_optim.append({
                    'params': param,
                    'lr': self.hparams['lr_pretrained']})
            for name, param in self.flair_model.named_parameters():
                parameters_optim.append({
                    'params': param,
                    'lr': self.hparams['lr_pretrained']})
        if self.fusion_strategy == 'attention':
            parameters_optim.extend([
                {'params': self.self_attention_t1w.parameters(),
                 'lr': self.hparams['lr']},
                {'params': self.self_attention_flair.parameters(),
                 'lr': self.hparams['lr']},
                {'params': self.cross_modal_attention_1.parameters(),
                 'lr': self.hparams['lr']},
                {'params': self.cross_modal_attention_2.parameters(),
                 'lr': self.hparams['lr']},
            ])

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


