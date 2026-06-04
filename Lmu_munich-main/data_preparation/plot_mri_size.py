import torchio as tio
import nibabel as nib
import numpy as np

subj_path = '/media/demenzbild/Studiendaten3/ADNI/T1w/002_S_0295/MPRAGE/2012-05-10_15_44_50.0/S150055/ADNI_002_S_0295_MR_MPRAGE_br_raw_20120511095524148_75_S150055_I303066_bet.nii.gz'
img = tio.ScalarImage(subj_path)
#print(img.spacing)

subj_path_actiglia = '/media/demenzbild/Studiendaten3/Actiglia/actiglia/sub-ACTIGLIA001BL/ses-BL/anat/sub-ACTIGLIA001BL_ses-BL_T1w_bet.nii.gz'
#img = tio.ScalarImage(subj_path_actiglia)
#print(img.spacing)

subj_path_dzne = '/media/demenzbild/Studiendaten3/DZNE_PSP/MPRAGE/1f468969a-FUP1_01/SCANS/4-dzne_MPRAGE_1iso_PAT2/resources/DICOM/files/o20200818_134324dzneMPRAGE1isoPAT2s004a1001_bet.nii.gz'
img = tio.ScalarImage(subj_path_dzne)
#print(img.spacing)

subj_path_4rtni = '/media/demenzbild/Studiendaten3/4RTNI/4RTNI/1_S_5000/T1_mprage/2012-06-19_16_57_06.0/S155562/4RTNI_1_S_5000_MR_T1_mprage__br_raw_20120626134958288_71_S155562_I312824_bet.nii.gz'
img = tio.ScalarImage(subj_path_4rtni)
#print(img.spacing)

#print(img.get_center())
#print(img.spatial_shape)
#print(img.memory)
#print(img.numpy())
#img.plot()
def _bbox_mask(mask_volume: np.ndarray):
    """Return 6 coordinates of a 3D bounding box from a given mask.

    Taken from `this SO question <https://stackoverflow.com/questions/31400769/bounding-box-of-numpy-array>`_.

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

print(img.numpy().shape)

transform_crop_first = tio.Crop(_bbox_mask(img.numpy().squeeze()))

transforms = tio.Compose([
            tio.ToCanonical(),
            tio.RescaleIntensity(out_min_max=(0, 1)),
            #tio.Resample(1.5),
            #tio.CropOrPad((105,120,120))
            tio.Resample(2),
            tio.CropOrPad((70,80,80))
            ])

print(img.memory)
img = transform_crop_first(img)
print(img.memory)
img = transforms(img)
print(img.spatial_shape)
print(img.memory)

#print(subj)
img.plot()

#t1_img = nib.load(subj_path)#.get_fdata()
#print(t1_img.header)