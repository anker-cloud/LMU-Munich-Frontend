import torch
from torch.utils.data import Dataset
import pandas as pd
from typing import List
import torchio as tio
import json
import numpy as np
from sklearn.utils.class_weight import compute_class_weight
from net_utils.transform_helper import bbox_values
from data_preparation.missing_value_imputation import impute_missing_values_df




class MultimodalDataset(Dataset):
    def __init__(self,
                 cfg,
                 hparams,
                 ids: List[int],
                 modalities: List[str]=['TABULAR', 'T1w', 'FLAIR'],
                 mode='train'
                 ):
        self.data_paths = pd.read_csv(cfg['data']['data_paths']) # one csv file with all paths and diagnoses
        self.modalities = modalities
        # include only data that has all the required modalities
        self.data_paths = self.data_paths.dropna(axis=0, subset=self.modalities)
        # only those within data fold
        self.data_paths = self.data_paths[self.data_paths['idx'].isin(ids)].reset_index(drop=True)
        print(self.data_paths['DIAGNOSIS'].value_counts())

        self.datasets_paths = cfg['datasets']
        self.mode = mode
        self.class_mapping = cfg['class_mapping']

        self.tab_columns = cfg["tab_columns"]

        self.tab_data = None
        #
        # TODO: check if tabular indices really match paths indices
        #
        if 'TABULAR' in self.modalities:
            self.tab_data = pd.read_csv(cfg['data']['dataset_tab'])
            self.tab_data = self.tab_data.loc[self.tab_data['idx'].isin(self.data_paths['idx'])].reset_index(drop=True)

            ''' missing value imputation '''
            #self.tab_data = impute_missing_values_df(self.tab_data)

        if self.mode=='test' and self.modalities!=['TABULAR']:
            self.transforms = tio.Compose([
                tio.ToCanonical(),
                tio.Resample(2),
                tio.CropOrPad((70, 80, 80)),
                #tio.RescaleIntensity(out_min_max=(0, 1)),
                ])
        elif self.mode=='train' and self.modalities!=['TABULAR']:
            self.transforms = tio.Compose([
                tio.ToCanonical(),
                tio.Resample(2), #also as hparam?
                tio.CropOrPad((70, 80, 80)),
                tio.RandomMotion(p=hparams['randommotion_prob']), #0, 0.2, ..
                #tio.RescaleIntensity(out_min_max=(0, 1)),
                tio.RandomBiasField(p=hparams['randombiasfield_prob']), #0, 0.2
                tio.RandomBlur(p=hparams['randomblur_prob']), #0, 0.2
                tio.RandomNoise(p=hparams['randomnoise_prob']),
                tio.RandomElasticDeformation(p=hparams['randomelasticdef_prob']),
                tio.RandomAffine(p=hparams['randomaffine_prob'])
                ])

    def __len__(self):
        return self.data_paths.shape[0]

    def __getitem__(self, idx):
        out_dict = {}
        subject_paths = self.data_paths.iloc[idx]#.loc[self.data_paths['idx']==idx]
        # or subject_paths = self.data_paths.loc[idx] if idx column is set as index
        diagnosis = self.class_mapping[subject_paths['DIAGNOSIS']]
        out_dict['DIAGNOSIS'] = torch.tensor(diagnosis)

        dataset = subject_paths['dataset']

        if 'TABULAR' in self.modalities:
            tabular = self.tab_data.loc[self.tab_data['idx']==subject_paths['idx']]
            tabular = tabular[self.tab_columns]
            out_dict['TABULAR'] = torch.tensor(tabular.iloc[0].values).to(torch.float)
            #print(out_dict['TABULAR'])

        if 'T1w' in self.modalities:
            subj_path = self.datasets_paths[dataset] + subject_paths['T1w']
            t1_img = tio.ScalarImage(subj_path)
            t1_img = self.transforms(t1_img)
            # define rescale separately for each image, otherwise it does not work properly
            t1_img = tio.RescaleIntensity(out_min_max=(0, 1))(t1_img)
            out_dict['T1w'] = t1_img
            #out_dict['T1w_path'] = subj_path

        if 'FLAIR' in self.modalities:
            subj_path = self.datasets_paths[dataset] + subject_paths['FLAIR']
            flair_img = tio.ScalarImage(subj_path)
            flair_img = self.transforms(flair_img)
            flair_img = tio.RescaleIntensity(out_min_max=(0, 1))(flair_img)
            out_dict['FLAIR'] = flair_img

        return out_dict


    def get_class_weights(self):
        classes = self.data_paths['DIAGNOSIS'].map(self.class_mapping)
        class_weights = compute_class_weight(class_weight="balanced", classes=np.unique(classes), y=np.array(classes))
        return torch.tensor(class_weights, dtype=torch.float)


    def get_sample_weights(self):
        value_counts = self.data_paths['DIAGNOSIS'].value_counts()
        keys = value_counts.index
        values = 1.0 / value_counts
        weights_dict = dict(zip(keys, values))
        sample_weights = self.data_paths['DIAGNOSIS'].map(weights_dict)
        return torch.tensor(sample_weights.values)


    def get_class_mapping(self):
        return self.class_mapping

    def get_number_tab_features(self):
        return len(self.tab_columns)



def get_train_dataset(cfg,
                      hparams,
                      val_fold,
                      modalities: List[str]=['TABULAR', 'T1w', 'FLAIR']):
    with open(cfg['data']['split'], 'r') as j:
        data_split = json.loads(j.read())
    train_folds = list(range(cfg['data']['k_folds']))
    train_folds.remove(val_fold)
    train_ids = []
    for i in train_folds:
        train_ids.extend(data_split[str(i)])
    train_dataset = MultimodalDataset(cfg, hparams, train_ids, modalities, 'train')
    return train_dataset


def get_val_dataset(cfg,
                    hparams,
                    val_fold,
                    modalities: List[str]=['TABULAR', 'T1w', 'FLAIR']):
    with open(cfg['data']['split'], 'r') as j:
        data_split = json.loads(j.read())
    val_ids = data_split[str(val_fold)]
    val_dataset = MultimodalDataset(cfg, hparams, val_ids, modalities, 'test')
    return val_dataset


def get_train_val_dataset(cfg, modalities: List[str]=['TABULAR', 'T1w', 'FLAIR']):
    # get all indices
    # TODO prettier way, just use range(nr_train_and_val_samples)

    with open(cfg['data']['split'], 'r') as j:
        data_split = json.loads(j.read())
    ids = []
    for i in range(cfg["data"]["k_folds"]):
        ids.extend(data_split[str(i)])
    train_dataset = MultimodalDataset(cfg, {}, ids, modalities, 'test')
    return train_dataset


def get_test_dataset(cfg,
                     modalities: List[str]=['TABULAR', 'T1w', 'FLAIR']):
    with open(cfg['data']['split'], 'r') as j:
        data_split = json.loads(j.read())
    ids = data_split["test"]
    test_dataset = MultimodalDataset(cfg, {}, ids, modalities, mode='test')
    return test_dataset


