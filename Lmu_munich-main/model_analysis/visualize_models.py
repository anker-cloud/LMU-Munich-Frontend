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
from captum.attr import (
    GradientShap,
    DeepLift,
    DeepLiftShap,
    IntegratedGradients,
    LayerConductance,
    NeuronConductance,
    NoiseTunnel,
    KernelShap,
    ShapleyValueSampling
)


def main(cfg):
    #model = PretrainedResNet.load_from_checkpoint(cfg['weights']['weights_path_'+mri_modality] +
    #                              cfg['weights']['weights_file_'+mri_modality])
    # or
    model = AllModalitiesFusionModel.load_from_checkpoint(cfg['weights']['weights_path_all_mod'] +
                                      cfg['weights']['weights_file_all_mod'])
    model = model.cuda()
    model.eval()

    batch_size = 1
    val_dataset = get_val_dataset(cfg, {}, val_fold=0, modalities=['T1w', 'FLAIR', 'TABULAR'])
    val_loader = DataLoader(dataset=val_dataset,
                            num_workers=cfg['device']['num_workers'],
                            batch_size=batch_size,
                            shuffle=False,
                            drop_last=True)
    batch = next(itertools.islice(val_loader, 200, None))
    # 250 CN, 200 PSP, 220+260 FTD
    # T1w only 1000 ftd, 900 psp
    inv_mapping = {v: k for k, v in cfg['class_mapping'].items()}
    true_y = inv_mapping[batch['DIAGNOSIS'].numpy()[0]]
    print('Actual Diagnosis: ', true_y)
    #data =
    y_hat = model.predict(batch)
    #y_hat, attention_map = model.forward(x_tab=batch['TABULAR'].cuda(),
     #                            x_t1w=batch['T1w']['data'].cuda(),
    #                             x_flair=batch['FLAIR']['data'].cuda())
    y_hat = softmax(y_hat).squeeze().detach().cpu().numpy()
    print(y_hat)
    pred_idx = (int)(np.argmax(y_hat))
    visualize_prediction_probs(y_hat, cfg)

    # feature importance
    input_tab = batch['TABULAR'].cuda().requires_grad_()
    # average over both tab models?
    tab_model = model.tab_t1w_model.tab_model
    #ig = IntegratedGradients(tab_model)
    # take approximately the average of each feature as baseline
    baselines = (1.5, 74, 16, 0.4, 26, 3, 3)
    shap = ShapleyValueSampling(tab_model)
    attr = shap.attribute(input_tab, target=pred_idx, baselines=baselines)#, return_convergence_delta=True)
    attr = attr.squeeze().detach().cpu().numpy()
    print(attr)
    visualize_feature_importances(attr, cfg)


    # attention maps
    # TODO attention maps for FLAIR images

    model = model.tab_t1w_model.mri_model
    model = medcam.inject(model, output_dir='attention_maps', backend='gcam', layer='auto', #model.layer4
                          label='best', save_maps=True, return_attention=True)
    y_hat, attention_map = model(batch['T1w']['data'].cuda())

    attention_map = attention_map.squeeze().detach().cpu().numpy()
    image = batch['T1w']['data'].squeeze().numpy()
    visualize_attention_map(image, attention_map)


def visualize_prediction_probs(y_hat, cfg):
    plt.bar(cfg['class_mapping'].keys(), y_hat)
    plt.gca().set_yticklabels([f'{x:.0%}' for x in plt.gca().get_yticks()])
    plt.ylabel('Class Probability')
    plt.xlabel('Diagnosis')
    plt.title('Predicted Class Probabilities')
    plt.show()


def visualize_feature_importances(imp, cfg):
    plt.bar(cfg['tab_columns'], abs(imp))
    plt.ylabel('SHAP Values')
    plt.xlabel('Feature')
    plt.title('SHAP Values for given Input')
    plt.show()



def visualize_attention_map(image_3d, attention_map_3d, alpha=0.7):
    # https://pyimagesearch.com/2020/03/09/grad-cam-visualize-class-activation-maps-with-keras-tensorflow-and-deep-learning/
    for idx in range(0,80,1):
        attention_map = attention_map_3d[:,:,idx]
        image = image_3d[:,:,idx]
        heatmap = cv2.applyColorMap((attention_map * 255).astype(np.uint8),
                                    cv2.COLORMAP_JET)  # cmapy.cmap('afmhot_r')) #cv2.COLORMAP_TWILIGHT_SHIFTED) # or COLORMAP_CIVIDIS
        image = np.stack(((image * 255).astype(np.uint8),) * 3, axis=-1)
        output = cv2.addWeighted(image, alpha, heatmap, 1 - alpha, 0)
        output = np.vstack([image, heatmap, output])
        output = imutils.resize(output, height=700)
        cv2.imwrite('attention_maps/example/attention_t1w_'+str(idx)+'.jpg', output)
        cv2.waitKey(0)



if __name__ == '__main__':
    with open("./configs/config_all.json", 'r') as j:
        cfg = json.loads(j.read())
    main(cfg)