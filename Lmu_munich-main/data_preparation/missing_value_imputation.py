import pandas as pd
from sklearn.experimental import enable_iterative_imputer
from sklearn.impute import IterativeImputer
from sklearn.preprocessing import OneHotEncoder
import os
import json

def one_hot_encode_df(df):
    df = df.reset_index(drop=True)

    # create an encoder and fit the dataframe
    enc = OneHotEncoder(sparse=False).fit(df[['DIAGNOSIS']])
    encoded = enc.transform(df[['DIAGNOSIS']])  # convert it to a dataframe
    encoded_df = pd.DataFrame(
        encoded,
        columns=enc.get_feature_names_out()
    )

    df[encoded_df.columns] = encoded_df
    return df, encoded_df.columns.tolist()

def impute_all(df, encoded_columns):
    # First impute SEX, AGE, EDUCATION, CDR, MMSE, APGEN1 and APGEN2, as there are less missing values.
    tab_cols = ['SEX','AGE','EDUCATION','CDR','MMSE', 'APGEN1', 'APGEN2'] + encoded_columns
    train_set = df.dropna(subset=tab_cols)
    test_set = df[df[tab_cols].isnull().any(axis=1)]

    imp = IterativeImputer(max_iter=20, random_state=0)
    imp.fit(train_set[tab_cols])
    imputed_df = pd.DataFrame(imp.transform(test_set[tab_cols]), columns=tab_cols, index=test_set.index)

    full_df = pd.concat([test_set[['Subject', 'Visit', 'idx', 'DIAGNOSIS', 'ABETA42', 'ABETA40', 'TAU', 'PTAU']],
                         imputed_df[['SEX', 'AGE', 'EDUCATION', 'CDR', 'MMSE', 'APGEN1', 'APGEN2'] + encoded_columns]], axis=1)
    full_df = pd.concat([train_set[['Subject', 'Visit', 'idx', 'DIAGNOSIS', 'SEX', 'AGE', 'EDUCATION', 'CDR', 'MMSE', 'APGEN1', 'APGEN2',
                                     'ABETA42', 'ABETA40', 'TAU', 'PTAU'] + encoded_columns], full_df], axis=0)

    # Next: impute blood biomarkers
    tab_cols = ['SEX','AGE','EDUCATION','CDR','MMSE', 'APGEN1', 'APGEN2', 'ABETA42', 'ABETA40', 'TAU', 'PTAU'] \
               + encoded_columns
    train_set = full_df.dropna()
    test_set = full_df[full_df.isnull().any(axis=1)]

    imp2 = IterativeImputer(max_iter=20, random_state=0)
    imp2.fit(train_set[tab_cols])

    imputed_df = pd.DataFrame(imp2.transform(test_set[tab_cols]), columns=tab_cols, index=test_set.index)
    full_df = pd.concat([test_set[['Subject', 'Visit', 'idx', 'DIAGNOSIS']],
                         imputed_df[['SEX', 'AGE', 'EDUCATION', 'CDR', 'MMSE', 'APGEN1', 'APGEN2', 'ABETA42',
                                     'ABETA40', 'TAU', 'PTAU'] + encoded_columns]], axis=1)
    full_df = pd.concat([train_set[['Subject', 'Visit', 'idx', 'DIAGNOSIS', 'SEX', 'AGE', 'EDUCATION', 'CDR', 'MMSE',
                                    'APGEN1', 'APGEN2', 'ABETA42', 'ABETA40', 'TAU', 'PTAU'] \
                                   + encoded_columns], full_df], axis=0)
    # round values
    round_cols = ['SEX', 'AGE', 'EDUCATION', 'MMSE', 'APGEN1', 'APGEN2', 'ABETA42', 'ABETA40', 'TAU', 'PTAU']
    full_df[round_cols] = round(full_df[round_cols]).astype(int)
    # round to nearest .5
    full_df['CDR'] = round(full_df['CDR'] * 2) / 2

    return full_df


def impute_missing_values_df(df):
    df, encoded_columns = one_hot_encode_df(df)
    df = impute_all(df, encoded_columns)
    return df


'''
if __name__ == "__main__":
    os.chdir('..')
    with open('./configs/config_all.json') as f:
        cfg = json.load(f)   
    with open(cfg['data']['split'], 'r') as f:
        data_split = json.loads(f.read())

    data_paths = pd.read_csv(cfg['data']['data_paths'])
    tab_data = pd.read_csv(cfg['data']['dataset_tab'])
    
    # impute test data 
    test_ids = data_split["test"]
    test_data_paths = data_paths[data_paths['idx'].isin(test_ids)].reset_index(drop=True)
    test_tab_data = tab_data.loc[tab_data['idx'].isin(test_data_paths['idx'])].reset_index(drop=True)
    test_tab_data = impute_df(test_tab_data)
    
    
    
    #.to_csv(cfg['data']['dataset_tab'], index=False)
'''




