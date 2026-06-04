import torch
from torch.utils.data import Dataset
import pandas as pd
import torchio as tio
from data_preparation.missing_value_imputation import impute_missing_values_df


class IndependentTestset(Dataset):
    def __init__(self,
                 cfg
                 ):
        self.data_paths = pd.read_csv(cfg['data']['test_data_paths'])
        self.tab_data = pd.read_csv(cfg['data']['test_dataset_tab'])
        print(self.data_paths['DIAGNOSIS'].value_counts())

        self.datasets_paths = cfg['datasets']
        self.class_mapping = cfg['class_mapping']
        self.tab_columns = cfg["tab_columns"]

        ''' missing value imputation '''
        # self.tab_data = impute_missing_values_df(self.tab_data)
        self.transforms = tio.Compose([
            tio.ToCanonical(),
            tio.Resample(1),
            tio.CropOrPad((140, 160, 160)),
        ])

    def __len__(self):
        return self.data_paths.shape[0]

    def __getitem__(self, idx):
        out_dict = {}
        subject_paths = self.data_paths.iloc[idx]
        diagnosis = self.class_mapping[subject_paths['DIAGNOSIS']]
        out_dict['DIAGNOSIS'] = torch.tensor(diagnosis)

        dataset = subject_paths['dataset']

        # TABULAR
        tabular = self.tab_data.loc[self.tab_data['idx']==subject_paths['idx']]
        tabular = tabular[self.tab_columns]
        out_dict['TABULAR'] = torch.tensor(tabular.iloc[0].values).to(torch.float)

        # T1w
        subj_path = self.datasets_paths[dataset] + subject_paths['T1w']
        t1_img = tio.ScalarImage(subj_path)
        t1_img = self.transforms(t1_img)
        # define rescale separately for each image, otherwise it does not work properly
        t1_img = tio.RescaleIntensity(out_min_max=(0, 1))(t1_img)
        out_dict['T1w'] = t1_img

        # FLAIR
        subj_path = self.datasets_paths[dataset] + subject_paths['FLAIR']
        flair_img = tio.ScalarImage(subj_path)
        flair_img = self.transforms(flair_img)
        flair_img = tio.RescaleIntensity(out_min_max=(0, 1))(flair_img)
        out_dict['FLAIR'] = flair_img

        return out_dict

def get_independent_test_dataset(cfg):
    return IndependentTestset(cfg)

