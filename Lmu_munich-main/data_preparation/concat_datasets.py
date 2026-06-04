import pandas as pd
import json

def concat_train_path_datasets(cfg):
    paths_adni = pd.read_csv(cfg['datasets']['ADNI']+'/ADNI_paths.csv', index_col=0)
    paths_4rtni = pd.read_csv(cfg['datasets']['4RTNI']+'/4RTNI_paths.csv', index_col=0)
    paths_dzne_psp = pd.read_csv(cfg['datasets']['DZNE_PSP']+'/DZNE_PSP_paths.csv', index_col=0)
    paths_nifd = pd.read_csv(cfg['datasets']['NIFD']+'/NIFD_paths.csv', index_col=0)
    paths_aibl = pd.read_csv(cfg['datasets']['AIBL']+'AIBL/AIBL_paths.csv', index_col=0)

    paths_all = pd.concat([paths_adni, paths_4rtni, paths_dzne_psp, paths_nifd, paths_aibl], axis=0)
    paths_all['T1w'] = [pd.NA if pd.isnull(path) else path[:-7] + '_crop.nii.gz' for path in paths_all['T1w']]
    paths_all['FLAIR'] = [pd.NA if pd.isnull(path) else path[:-7] + '_crop.nii.gz' for path in paths_all['FLAIR']]

    paths_all.to_csv(cfg['data']['data_paths'], index=False)


def concat_train_tab_datasets(cfg):
    tab_adni = pd.read_csv(cfg['datasets']['ADNI']+'/ADNI_TABULAR.csv', index_col=0)
    tab_4rtni = pd.read_csv(cfg['datasets']['4RTNI']+'4RTNI/4RTNI_TABULAR.csv', index_col=0)
    tab_dzne_psp = pd.read_csv(cfg['datasets']['DZNE_PSP']+'DZNE_PSP/DZNE_PSP_TABULAR.csv', index_col=0)
    tab_nifd = pd.read_csv(cfg['datasets']['NIFD']+'NIFD/NIFD_TABULAR.csv')
    tab_aibl = pd.read_csv(cfg['datasets']['AIBL']+'AIBL/AIBL_TABULAR.csv', index_col=0)

    tab_all = pd.concat([tab_adni, tab_4rtni, tab_nifd, tab_dzne_psp, tab_aibl], axis=0)

    # replace weird values by NAN
    tab_all['CDR'].loc[tab_all['CDR'] < 0] = pd.NA
    tab_all['MMSE'].loc[tab_all['MMSE'] < 0] = pd.NA
    tab_all['EDUCATION'].loc[tab_all['EDUCATION'] == 99] = pd.NA

    tab_all.to_csv(cfg['data']['dataset_tab'], index=False)


def concat_test_path_datasets(cfg):
    paths_actiglia = pd.read_csv(cfg['datasets']['ActiGLIA']+'/ACTIGLIA_paths.csv', index_col=0)

    paths_all = pd.concat([paths_actiglia], axis=0)
    paths_all['T1w'] = [pd.NA if pd.isnull(path) else path[:-7] + '_crop.nii.gz' for path in paths_all['T1w']]
    paths_all['FLAIR'] = [pd.NA if pd.isnull(path) else path[:-7] + '_crop.nii.gz' for path in paths_all['FLAIR']]

    paths_all.to_csv(cfg['data']['teste_data_paths'], index=False)


def concat_test_tab_datasets(cfg):
    tab_actiglia = pd.read_csv(cfg['datasets']['ActiGLIA']+'/ACTIGLIA_TABULAR.csv', index_col=0)

    tab_all = pd.concat([tab_actiglia], axis=0)

    # replace weird values by NAN
    tab_all['CDR'].loc[tab_all['CDR'] < 0] = pd.NA
    tab_all['MMSE'].loc[tab_all['MMSE'] < 0] = pd.NA
    tab_all['EDUCATION'].loc[tab_all['EDUCATION'] == 99] = pd.NA

    tab_all.to_csv(cfg['data']['test_dataset_tab'], index=False)



if __name__ == '__main__':
    with open("./configs/config_all.json", 'r') as j:
        cfg = json.loads(j.read())

    concat_train_path_datasets(cfg)
    concat_train_tab_datasets(cfg)

    concat_test_path_datasets(cfg)
    concat_test_tab_datasets(cfg)
