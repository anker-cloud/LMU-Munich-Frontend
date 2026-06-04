import pandas as pd
from sklearn.model_selection import StratifiedGroupKFold, GroupShuffleSplit
import json
import os
from itertools import combinations


def sub_lists(l):
    '''
    :param l: list
    :return: reversed list of all sublists (except empty list)
    [['FLAIR', 'T1w', 'TABULAR']
    ['T1w', 'TABULAR']
    ['FLAIR', 'TABULAR']
    ['FLAIR', 'T1w']
    ['TABULAR']
    ['T1w']
    ['FLAIR']]
    '''
    l = sorted(l)
    result = []
    for i in range(1,len(l)+1):
        result += [list(j) for j in combinations(l, i)]
    return result[::-1]


def create_groups(data_paths_df, modalities_list):
    df_copy = data_paths_df.copy()
    data_paths_df['modality_group'] = pd.NA
    for i in range(len(modalities_list)):
        # get indices where no element within modalities_subgroup is null
        indices_incl = df_copy.index[df_copy[modalities_list[i]].notna().all(axis=1)]
        # set group
        data_paths_df.loc[indices_incl,'modality_group'] = i
        # iteratively decrease df
        df_copy = df_copy.loc[~df_copy.index.isin(indices_incl)]
    return data_paths_df


def data_split_kfold(data_paths_filepath,
                     modalities=['TABULAR', 'T1w', 'FLAIR'],
                     test_size=0.15,
                     k_fold=10):
    data_paths = pd.read_csv(data_paths_filepath).reset_index(drop=True)
    split_dict = {}
    #data_paths = data_paths.loc[(data_paths['DIAGNOSIS']=='CBS') | (data_paths['DIAGNOSIS']=='PSP') | (data_paths['DIAGNOSIS']=='VASC') | (data_paths['DIAGNOSIS']=='AD_VASC')]

    modalities_sublists = sub_lists(modalities)
    data_paths = create_groups(data_paths, modalities_sublists)

    # split test set from subgroup of data that contains all modalities
    all_mod_df = data_paths.loc[data_paths['modality_group']==0].reset_index(drop=True)
    splitter = GroupShuffleSplit(test_size=test_size, n_splits=2, random_state=0)
    split = splitter.split(all_mod_df, all_mod_df['DIAGNOSIS'], all_mod_df['Subject'])
    train_inds, test_inds = next(split)
    split_dict['test'] = all_mod_df.iloc[test_inds]['idx'].tolist()

    train_all_mod_df = all_mod_df.iloc[train_inds]
    not_all_mod_df = data_paths.loc[data_paths['modality_group']!=0]
    X = pd.concat([train_all_mod_df, not_all_mod_df]).reset_index(drop=True)
    # split equally across different modality groups and diagnoses
    y = X['modality_group'].astype(str) + '_' + X['DIAGNOSIS']
    groups = X['Subject']

    # split remaining dataset into k folds
    sgkf = StratifiedGroupKFold(n_splits=k_fold)
    for i, (train_index, val_index) in enumerate(sgkf.split(X, y, groups)):
        split_dict[i] = X.iloc[val_index]['idx'].tolist()

    return split_dict



if __name__ == "__main__":
    os.chdir('..')
    with open('./configs/config_all.json') as f:
        cfg = json.load(f)
    split_path = cfg['data']['split']
    split_dict = data_split_kfold(data_paths_filepath=cfg['data']['data_paths'],
                                  modalities=cfg['data']['modalities'],
                                  test_size=0.15,
                                  k_fold=cfg['data']['k_folds'])
    print(split_dict)
    with open(split_path, 'w') as f:
        json.dump(split_dict, f, indent=4)