import numpy as np
import os
import json
import pandas as pd
import torchio as tio

def bbox_values(mask_volume: np.ndarray):
    """Return 6 coordinates indicating the number of values that are supposed to be cropped from each axis

    Taken from `<https://stackoverflow.com/questions/31400769/bounding-box-of-numpy-array>`_
    and `<https://torchio.readthedocs.io/_modules/torchio/transforms/preprocessing/spatial/crop_or_pad.html>`_

    Args:
        mask_volume: 3D NumPy array.
    """  # noqa: B950
    i_any = np.any(mask_volume, axis=(1, 2))
    j_any = np.any(mask_volume, axis=(0, 2))
    k_any = np.any(mask_volume, axis=(0, 1))
    i_min, i_max = np.where(i_any)[0][[0, -1]]
    j_min, j_max = np.where(j_any)[0][[0, -1]]
    k_min, k_max = np.where(k_any)[0][[0, -1]]
    w_ini = i_min
    w_fin = mask_volume.shape[0] - i_max
    h_ini = j_min
    h_fin = mask_volume.shape[1] - j_max
    d_ini = k_min
    d_fin = mask_volume.shape[2] - k_max
    return (w_ini, w_fin, h_ini, h_fin, d_ini,d_fin)



if __name__ == "__main__":
    os.chdir('..')
    with open('./configs/config_all.json') as f:
        cfg = json.load(f)
    data_paths = pd.read_csv(cfg['data']['data_paths'])
    #data_paths = data_paths.loc[data_paths['dataset']=='DZNE_PSP']
    datasets_paths = cfg['datasets']
    modality = 'FLAIR'
    data_paths = data_paths.dropna(axis=0, subset=modality).reset_index(drop=True)

    for i in range(data_paths.shape[0]):
        subject_paths = data_paths.iloc[i]
        dataset = subject_paths['dataset']
        subj_path = datasets_paths[dataset] + subject_paths[modality]
        print(subj_path)
        t1_img = tio.ScalarImage(subj_path)
        transform_crop = tio.Crop(bbox_values(t1_img.numpy().squeeze()))
        t1_img = transform_crop(t1_img)
        t1_img.save(subj_path[:-7]+'_crop.nii.gz')


