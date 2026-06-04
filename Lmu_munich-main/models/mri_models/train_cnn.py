import os
os.environ["CUDA_VISIBLE_DEVICES"]="0"

import torch
from models.dataloader import *
from torch.utils.data import DataLoader, WeightedRandomSampler
from models.mri_models.pretrained_resnet import PretrainedResNet
import optuna
from optuna.samplers import TPESampler, RandomSampler
from optuna.integration import PyTorchLightningPruningCallback
import pytorch_lightning as pl
from pytorch_lightning.callbacks.early_stopping import EarlyStopping
from pytorch_lightning.callbacks import LearningRateMonitor, ModelCheckpoint
from aim.pytorch_lightning import AimLogger
import json
from medcam import medcam


def objective(trial: optuna.trial.Trial, cfg, modality) -> float:
    gpu_id = os.getenv('CUDA_VISIBLE_DEVICES')
    device_count = torch.cuda.device_count()
    if not gpu_id or not device_count:
        raise ValueError('No gpu specified! Please select "export CUDA_VISIBLE_DEVICES=<device_id>')
    # Define fixed parameters
    hparams = {
        'early_stopping_patience': 20,
        'max_epochs': 100,
        'gpu_id': gpu_id,
        'modality': modality
    }

    # changed hparams
    hparams['batch_size'] = 32 #trial.suggest_categorical('batch_size', [32])

    #hparams['n_linear_out_const'] = trial.suggest_int('n_linear_out_const', 0, 3)
    #hparams['n_linear_out_decr'] = 3#trial.suggest_int('n_linear_out_decr', 0, 3)

    linear_layer_options = [(64),
                            (512, 64),
                            (256, 64),
                            (512, 256, 64),
                            (256, 128, 64)]
    linear_layer_option = trial.suggest_categorical('linear_layer_option', [0, 1, 2, 3, 4])
    hparams['linear_layer_option'] = linear_layer_options[linear_layer_option]
    hparams['dropout_prob'] = trial.suggest_categorical('dropout_prob', [0, 0.5])

    hparams['optimizer'] = 'rmsprop' #trial.suggest_categorical('optimizer', ['adam', 'rmsprop']) #'sgd',
    hparams['lr'] = trial.suggest_float('lr', 1e-5, 1e-3, log=True)
    freeze = False #trial.suggest_categorical('freeze', (True, False))
    if not freeze:
        # Only set lr_pretrained if optuna selected freeze=False
        hparams['lr_pretrained'] = trial.suggest_float('lr_pretrained', 1e-7, 1e-4, log=True)
    else:
        hparams['lr_pretrained'] = None

    if hparams['optimizer']=='adam':
        hparams['l2_reg'] = trial.suggest_categorical('l2_reg', [0, 1e-1, 1e-2, 1e-3])
    else:
        hparams['momentum'] = trial.suggest_float('momentum', 0.5, 0.95)
    hparams['reduce_factor_lr_schedule'] = trial.suggest_float('reduce_factor_lr_schedule', 0.01, 0.5, log=True)

    hparams['loss'] = trial.suggest_categorical('loss', ('cross_entropy', 'focal_loss'))
    if hparams['loss'] == 'focal_loss':
        hparams['fl_gamma'] = trial.suggest_categorical('fl_gamma', [None, 1, 2, 5])
    #else:
    #    hparams['fl_gamma'] = None

    # data augmentation
    hparams['randommotion_prob'] = trial.suggest_float('randommotion_prob',0,0.8)
    hparams['randombiasfield_prob'] = trial.suggest_float('randombiasfield_prob',0,0.8)
    hparams['randomblur_prob'] = trial.suggest_float('randomblur_prob',0,0.8)
    hparams['randomnoise_prob'] = trial.suggest_float('randomnoise_prob',0,0.8)
    hparams['randomelasticdef_prob'] = trial.suggest_float('randomelasticdef_prob',0,0.8)
    hparams['randomaffine_prob'] = trial.suggest_float('randomaffine_prob',0,0.8)

    hparams['weighted_sampler'] = trial.suggest_categorical('weighted_sampler', [True, False])

    # currently no cross validation
    train_dataset = get_train_dataset(cfg, hparams, val_fold=0, modalities=[modality])
    val_dataset = get_val_dataset(cfg, hparams, val_fold=0, modalities=[modality])

    shuffle = True
    class_weights = train_dataset.get_class_weights()
    sampler = None
    if hparams['weighted_sampler']==True:
        sample_weights = train_dataset.get_sample_weights()
        sampler = WeightedRandomSampler(sample_weights, len(sample_weights), replacement=True)
        class_weights = torch.ones_like(class_weights)
        shuffle = False

    # drop last if only one element left in last batch, otherwise wrong data shape
    drop_last_train = False
    if (len(train_dataset) % hparams['batch_size']) == 1:
        drop_last_train = True
    drop_last_val = False
    if (len(val_dataset) % hparams['batch_size']) == 1:
        drop_last_val = True

    train_loader = DataLoader(dataset=train_dataset,
                              num_workers=cfg['device']['num_workers'],
                              batch_size=hparams['batch_size'],
                              shuffle=shuffle,
                              drop_last=drop_last_train,
                              sampler=sampler)
    val_loader = DataLoader(dataset=val_dataset,
                            num_workers=cfg['device']['num_workers'],
                            batch_size=hparams['batch_size'],
                            shuffle=False,
                            drop_last=drop_last_val)


    # fixed hparams
    hparams['class_weights'] = class_weights
    hparams['n_classes'] = len(class_weights)
    hparams['class_mapping'] = train_dataset.get_class_mapping()

    model = PretrainedResNet(hparams=hparams)
    #model = medcam.inject(model, output_dir='attention_maps', backend='gcam', label=None,
    #                      save_maps=True)

    lr_monitor = LearningRateMonitor(logging_interval='epoch')

    aim_logger = AimLogger(
        experiment='resnet18_cnn_'+modality,
        train_metric_prefix='train_',
        val_metric_prefix='val_',
    )
    aim_logger.log_hyperparams(hparams)

    trainer = pl.Trainer(
        max_epochs=hparams['max_epochs'],
        logger=aim_logger,
        log_every_n_steps=5,
        accelerator='gpu',
        devices=1,
        callbacks=[#metric_tracker,
                   lr_monitor,
                   EarlyStopping(monitor='val_loss', mode='min', patience=hparams['early_stopping_patience']),
                   PyTorchLightningPruningCallback(trial, monitor='val_loss'),
                   ModelCheckpoint(monitor='val_loss',
                                   dirpath=cfg["weights"]["weights_path_"+modality],
                                   filename='epoch={epoch}-val_loss={val_loss_epoch:.3f}'),
                   ModelCheckpoint(monitor='val_f1_score',
                                   mode='max',
                                   dirpath=cfg["weights"]["weights_path_"+modality],
                                   filename='epoch={epoch}-val_f1={val_f1_epoch:.3f}')]
    )


    trainer.fit(model, train_loader, val_loader)
    return trainer.callback_metrics["val_loss"]


def force_cudnn_initialization():
    s = 32
    dev = torch.device('cuda')
    torch.nn.functional.conv2d(torch.zeros(s, s, s, s, device=dev), torch.zeros(s, s, s, s, device=dev))


if __name__ == '__main__':
    #torch.cuda.empty_cache()
    #force_cudnn_initialization()

    pl.seed_everything(0) # for reproducibility of random transforms
    with open("./configs/config_all.json", 'r') as j:
        cfg = json.loads(j.read())
    modality = 'FLAIR' # T1w or FLAIR
    objective_func = lambda trial: objective(trial, cfg, modality)

    study = optuna.create_study(direction="minimize", sampler=RandomSampler())
    study.optimize(objective_func, n_trials=500, timeout=60*60*20) #timeout in seconds

    # https://github.com/optuna/optuna-examples/blob/main/pytorch/pytorch_lightning_simple.py
    print("Number of finished trials: {}".format(len(study.trials)))

    print("Best trial:")
    trial = study.best_trial

    print("  Value: {}".format(trial.value))

    print("  Params: ")
    for key, value in trial.params.items():
        print("    {}: {}".format(key, value))


