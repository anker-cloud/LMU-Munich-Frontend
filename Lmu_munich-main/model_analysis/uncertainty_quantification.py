import os
import torch.cuda
os.environ["CUDA_VISIBLE_DEVICES"]="0"

from models.dataloader import *
from torch.utils.data import DataLoader, WeightedRandomSampler
from models.fusion_models.all_modalities_fusion import AllModalitiesFusionModel
from models.mri_models.pretrained_resnet import PretrainedResNet
import pytorch_lightning as pl
from aim.pytorch_lightning import AimLogger
import json
from medcam import medcam
from IPython.display import Image
import matplotlib.pyplot as plt
import cv2
import imutils
import itertools
import cmapy
from torch.nn.functional import softmax
from scipy.stats import multivariate_normal


def main(cfg):
    model = AllModalitiesFusionModel.load_from_checkpoint(cfg['weights']['weights_path_all_mod'] +
                                                          cfg['weights']['weights_file_all_mod'])
    model = model.cuda()
    model.eval()

    latent_model = AllModalitiesFusionModel.load_from_checkpoint(cfg['weights']['weights_path_all_mod'] +
                                                          cfg['weights']['weights_file_all_mod'])
    latent_model = latent_model.cuda()
    latent_model.eval()
    latent_model.fuse_model = latent_model.fuse_model[:-4]

    batch_size = 16
    train_dataset = get_train_val_dataset(cfg)
    dataloader = DataLoader(dataset=train_dataset,
                              num_workers=cfg['device']['num_workers'],
                              batch_size=batch_size,
                              shuffle=False,
                              drop_last=True)

    #test_dataset = get_test_dataset(cfg)#modalities=['T1w', 'FLAIR', 'TABULAR'])
    #test_dataloader = DataLoader(dataset=test_dataset,
    #                        num_workers=cfg['device']['num_workers'],
    #                        batch_size=batch_size,
    #                        shuffle=False,
    #                        drop_last=False)
    y_hats = []
    pred_ids = []
    true_ys = []
    latent_vectors = []
    for iter, data in enumerate(dataloader):
        y_hat = model.predict(data)
        y_hat = softmax(y_hat).squeeze().detach().cpu().numpy()
        #print(y_hat.shape)
        pred_idx = (np.argmax(y_hat, axis=1))
        true_y = data['DIAGNOSIS'].numpy()
        latent_vector = latent_model.predict(data)
        latent_vector = latent_vector.squeeze().detach().cpu().numpy()
        #print(latent_vector.shape)

        y_hats.extend(y_hat)
        pred_ids.extend(pred_idx)
        true_ys.extend(true_y)
        latent_vectors.extend(latent_vector)

    y_hats = np.array(y_hats)
    pred_ids = np.array(pred_ids)
    true_ys = np.array(true_ys)
    latent_vectors = np.array(latent_vectors)
    #print(pred_ids)
    #print(true_ys)
    correct_preds = np.where(pred_ids == true_ys)[0]
    wrong_preds = np.where(pred_ids != true_ys)[0]
    print(correct_preds.shape)
    print(wrong_preds.shape)
    print(correct_preds.shape[0] / (correct_preds.shape[0] + wrong_preds.shape[0]))
    max_y_hats = y_hats.max(axis=1)
    #print(max_y_hats.mean())
    print(max_y_hats[correct_preds].mean())
    print(max_y_hats[wrong_preds].mean())

    CN_ids = np.where(true_ys == 0)[0]
    correct_CN_ids = np.intersect1d(CN_ids, correct_preds)
    plt.hist(latent_vectors[:,0][np.intersect1d(CN_ids, wrong_preds)], bins=20)
    plt.show()

    plt.hist(latent_vectors[:, 0][correct_CN_ids], bins=20)
    plt.show()

    print(latent_vectors[correct_CN_ids].shape)
    #scipy.stats.cov(latent_vectors[correct_CN_ids])
    print(np.mean(latent_vectors[correct_CN_ids], axis=0).shape)
    print(np.cov(latent_vectors[correct_CN_ids].T).shape)

    mu = np.mean(latent_vectors[correct_CN_ids], axis=0)
    cov = np.cov(latent_vectors[correct_CN_ids].T)
    print(y_hats[0])
    print(pred_ids[0])
    print(true_ys[0])
    print(latent_vectors[0])
    #print(multivariate_normal.logpdf(latent_vectors, mu, cov))
    logpdf = multivariate_normal(mu, cov).logpdf(latent_vectors)
    print(logpdf.shape)
    plt.hist(logpdf, bins=20)
    plt.show()






if __name__ == '__main__':
    with open("./configs/config_all.json", 'r') as j:
        cfg = json.loads(j.read())

    main(cfg)