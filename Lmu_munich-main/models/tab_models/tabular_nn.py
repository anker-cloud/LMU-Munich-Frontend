from torch import optim, nn
import torch
from torch.nn.functional import softmax
from models.base_model import Base_Model
from net_utils.focal_loss import FocalLoss


class TabularNN(Base_Model):
    def __init__(self, hparams):
        super().__init__(hparams)
        self.model = nn.Sequential(
            nn.Linear(hparams['n_in_features'], 256),
            nn.BatchNorm1d(256),
            nn.ReLU(),
            nn.Dropout(0.5), #hparams['dropout']
            nn.Linear(256, 128),
            nn.BatchNorm1d(128),
            nn.ReLU(),
            nn.Dropout(0.5),
            nn.Linear(128, 64),
            nn.BatchNorm1d(64),
            nn.ReLU(),
            nn.Dropout(0.5),
            nn.Linear(64, hparams['n_classes'])
        )

        '''
        n_in = hparams['n_in_features']
        modules = nn.ModuleList()
        for l in hparams['linear_layer_option']:
            n_out = l
            modules.append(nn.Linear(n_in, n_out))
            modules.append(nn.BatchNorm1d(n_out))
            modules.append(nn.ReLU())
            modules.append(nn.Dropout(hparams['dropout_prob']))
            n_in = n_out
        modules.append(nn.Linear(n_in, hparams["n_classes"]))
        '''

        class_weights = hparams.get('class_weights', None)
        self.criterion = nn.CrossEntropyLoss(weight=class_weights)
        '''
        if hparams['loss'] == 'cross_entropy':
            class_weights = hparams.get('class_weights', None)
            self.criterion = nn.CrossEntropyLoss(weight=class_weights)
        elif hparams['loss'] == 'focal_loss':
            self.criterion = FocalLoss(gamma=self.hparams['fl_gamma'])
        else:
            raise ValueError('Loss invalid!')
        '''


    def forward(self, x):
        return self.model(x).to(dtype=torch.float32)


    def predict(self, batch):
        x_tab = batch['TABULAR'].cuda()
        y_hat = self.forward(x_tab).to(dtype=torch.float32)
        return y_hat


    def general_step(self, batch, batch_idx):
        x = batch['TABULAR']  # .to(torch.float)#['data']
        y = batch['DIAGNOSIS']
        y_hat = self.forward(x)
        loss = self.criterion(y_hat, y)
        y_hat = softmax(y_hat)
        return {'loss': loss, 'y': y, 'y_hat': y_hat}


    def configure_optimizers(self):
        optimizer = optim.Adam(self.parameters(), lr=self.hparams['lr'], weight_decay=self.hparams['l2_reg'])
        return optimizer



