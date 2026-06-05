import os
import torch.cuda

os.environ["CUDA_VISIBLE_DEVICES"]="0"

# ── Fix for TabPFN compatibility with PyTorch 2.0+ ────────────────────────────
try:
    from torch.nn.modules.transformer import Optional
except ImportError:
    from typing import Optional as TypingOptional
    import torch.nn.modules.transformer as transformer_module
    transformer_module.Optional = TypingOptional

from models.dataloader import *
from torch.utils.data import DataLoader, WeightedRandomSampler
from models.fusion_models.all_modalities_fusion import AllModalitiesFusionModel
from models.fusion_models.tab_mri_fusion import TabMRIFusionModel
import pytorch_lightning as pl
from aim.pytorch_lightning import AimLogger
import json
import torch.nn as nn
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from xgboost import XGBClassifier
from sklearn.svm import SVC
from net_utils.confusion_matrix import visualize_confusion_matrix
from sklearn.metrics import confusion_matrix, f1_score, accuracy_score, precision_score, recall_score, balanced_accuracy_score
import matplotlib.pyplot as plt
from tabpfn import TabPFNClassifier
from torchmetrics.classification import MulticlassF1Score, MulticlassAccuracy, MulticlassPrecision, \
    MulticlassRecall, MulticlassConfusionMatrix


def get_classifier_data(dataloader, model):
    all_features = []
    all_y = []
    for i, data in enumerate(dataloader, 0):
        out = model.predict(data)#.to(dtype=torch.float32)
        out = out.squeeze().detach().cpu().numpy()
        y = data['DIAGNOSIS'].numpy()
        all_features.extend(out)
        all_y.extend(y)
    all_features = np.array(all_features)
    all_y = np.array(all_y)
    return all_features, all_y


def print_metrics(val_y, pred_y, clf_name):
    print('\n'+clf_name+' results: ')
    print('Accuracy: ', accuracy_score(val_y, pred_y))
    print('Balanced Accuracy: ', balanced_accuracy_score(val_y, pred_y))
    #print('F1 score: ', f1_score(val_y, pred_y, average='micro'))
    print('F1 score: ', f1_score(val_y, pred_y, average='macro'))
    #print('F1 score: ', f1_score(val_y, pred_y, average='samples'))
    print('Precision: ', precision_score(val_y, pred_y, average='macro'))
    print('Recall: ', recall_score(val_y, pred_y, average='macro'))

    #print('F1 score: ', MulticlassF1Score(torch.tensor(val_y, dtype=torch.int32), torch.tensor(pred_y, dtype=torch.int32), average='macro'))
    #print('Accuracy: ', MulticlassAccuracy(torch.tensor(val_y, dtype=torch.int32), torch.tensor(pred_y, dtype=torch.int32), average='macro'))




if __name__ == '__main__':
    pl.seed_everything(0)  # for reproducibility of random transforms
    with open("./configs/config_all.json", 'r') as j:
        cfg = json.loads(j.read())

    gpu_id = os.getenv('CUDA_VISIBLE_DEVICES')
    device_count = torch.cuda.device_count()
    if not gpu_id or not device_count:
        raise ValueError('No gpu specified! Please select "export CUDA_VISIBLE_DEVICES=<device_id>')

    linear_cutoff = 1
    #class_mapping = {v: k for k, v in cfg['class_mapping'].items()}

    hparams = {}
    hparams['randommotion_prob'] = 0
    hparams['randombiasfield_prob'] = 0
    hparams['randomblur_prob'] = 0
    hparams['randomnoise_prob'] = 0
    hparams['randomelasticdef_prob'] = 0
    hparams['randomaffine_prob'] = 0

    train_dataset = get_train_dataset(cfg, hparams, val_fold=0, modalities=['T1w', 'TABULAR', 'FLAIR'])
    val_dataset = get_val_dataset(cfg, hparams, val_fold=0, modalities=['T1w', 'TABULAR', 'FLAIR'])
    test_dataset = get_test_dataset(cfg, hparams, modalities=['T1w', 'TABULAR', 'FLAIR'])
    batch_size = 16
    train_loader = DataLoader(dataset=train_dataset,
                            num_workers=cfg['device']['num_workers'],
                            batch_size=batch_size,
                            shuffle=False,
                            drop_last=False)
    val_loader = DataLoader(dataset=val_dataset,
                            num_workers=cfg['device']['num_workers'],
                            batch_size=batch_size,
                            shuffle=False,
                            drop_last=False)
    test_loader = DataLoader(dataset=test_dataset,
                            num_workers=cfg['device']['num_workers'],
                            batch_size=batch_size,
                            shuffle=False,
                            drop_last=False)

    fusion_model = AllModalitiesFusionModel.load_from_checkpoint(cfg['weights']['weights_path_all_mod'] +
                                  cfg['weights']['weights_file_all_mod'])
    #fusion_model = TabMRIFusionModel.load_from_checkpoint(cfg['weights']['weights_path_TABULAR_T1w'] +
    #                                                      cfg['weights']['weights_file_TABULAR_T1w'])
    dropout = True if [module for module in fusion_model.fuse_model.modules()
                               if isinstance(module, nn.Dropout)] else False
    multiplier = 4 if dropout else 3
    layer_cutoff = linear_cutoff * multiplier
    fusion_model.fuse_model = fusion_model.fuse_model[:-layer_cutoff]
    fusion_model = fusion_model.cuda()
    fusion_model.eval()

    train_x, train_y = get_classifier_data(train_loader, fusion_model)
    val_x, val_y = get_classifier_data(test_loader, fusion_model)
    #test_x, test_y = get_classifier_data(test_loader, fusion_model)

    # use cross validation here! or not? does it make sense if trained on other folds?
    print('... classifier training starts...')

    clf = LogisticRegression(class_weight='balanced')
    clf.fit(train_x, train_y)
    pred_y = clf.predict(val_x)
    print_metrics(val_y, pred_y, 'Logistic Regression')

    clf = RandomForestClassifier(n_estimators=100, random_state=0, class_weight='balanced')
    clf.fit(train_x, train_y)
    pred_y = clf.predict(val_x)
    print_metrics(val_y, pred_y, 'Random Forest')

    clf = XGBClassifier()
    clf.fit(train_x, train_y)
    pred_y = clf.predict(val_x)
    print_metrics(val_y, pred_y, 'XGBoost')

    clf = SVC(class_weight='balanced')
    clf.fit(train_x, train_y)
    pred_y = clf.predict(val_x)
    print_metrics(val_y, pred_y, 'SVM')

    #clf = TabPFNClassifier(device='cuda', N_ensemble_configurations=4)
    #clf.fit(train_x, train_y)
    #pred_y = clf.predict(val_x)
    #print_metrics(val_y, pred_y, 'TabPFN')


    cm = confusion_matrix(val_y, pred_y)
    cm_fig = visualize_confusion_matrix(cm, cfg['class_mapping'])
    plt.show()

    #pred_y = clf.predict(test_x)
    #cm = confusion_matrix(test_y, pred_y)
    #cm_fig = visualize_confusion_matrix(cm, cfg['class_mapping'])
    #plt.show()

















