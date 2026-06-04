import numpy as np

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