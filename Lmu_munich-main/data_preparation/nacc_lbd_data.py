import pandas as pd
import shutil
import os

csv_path = '/media/demenzbild/Studiendaten3/NACC/lbd_df.csv'
mri_path = '/media/demenzbild/Studiendaten3/NACC/MRI/all/nifti/'
destination_dir = '/media/demenzbild/Studiendaten3/NACC/MRI/lbd'


lbd_df = pd.read_csv(csv_path, usecols=['NACCID', 'year', 'NACCMRFI'])

for row in lbd_df['NACCMRFI']:
    file_path = mri_path + row[:-4] + 'ni.zip'
    if os.path.isfile(file_path):
        try:
            shutil.copy(file_path, destination_dir)
            print(f"File '{row}' copied successfully.")
        except PermissionError:
            print(f"Permission denied for file '{row}'.")