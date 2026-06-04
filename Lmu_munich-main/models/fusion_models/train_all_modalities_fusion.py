import os
import torch.cuda

os.environ["CUDA_VISIBLE_DEVICES"]="0"

from models.dataloader import *
from torch.utils.data import DataLoader, WeightedRandomSampler
from models.fusion_models.all_modalities_fusion import AllModalitiesFusionModel
import optuna
from optuna.samplers import TPESampler, RandomSampler
from optuna.integration import PyTorchLightningPruningCallback
import pytorch_lightning as pl
from pytorch_lightning.callbacks.early_stopping import EarlyStopping
from pytorch_lightning.callbacks import LearningRateMonitor, ModelCheckpoint
from aim.pytorch_lightning import AimLogger
import json


def objective(trial: optuna.trial.Trial, cfg) -> float:
    gpu_id = os.getenv('CUDA_VISIBLE_DEVICES')
    device_count = torch.cuda.device_count()
    if not gpu_id or not device_count:
        raise ValueError('No gpu specified! Please select "export CUDA_VISIBLE_DEVICES=<device_id>')
    hparams = {
        'early_stopping_patience': 10,
        'max_epochs': 60,
        'gpu_id': gpu_id,
        'weights_path_tab_t1w': cfg['weights']['weights_path_TABULAR_T1w'] +
                            cfg['weights']['weights_file_TABULAR_T1w'],
        'weights_path_tab_flair': cfg['weights']['weights_path_TABULAR_FLAIR'] +
                            cfg['weights']['weights_file_TABULAR_FLAIR'],
        'weights_path_t1w_flair': cfg['weights']['weights_path_T1w_FLAIR'] +
                                  cfg['weights']['weights_file_T1w_FLAIR'],
    }

    hparams['batch_size'] = 8  # trial.suggest_categorical('batch_size', [2])
    hparams['method'] = 'attention' # or 'linear'
    if hparams['method']=='linear':
        hparams['linear_cutoff'] = trial.suggest_int('nn_cutoff', 1, 3)  # number of linear layers to cut off
    elif hparams['method']=='attention':
        hparams['linear_cutoff'] = trial.suggest_int('nn_cutoff', 1, 2)

    hparams['dropout'] = trial.suggest_categorical('dropout', [True, False])
    hparams['optimizer'] = trial.suggest_categorical('optimizer', ['adam', 'rmsprop'])  # 'sgd',
    hparams['lr'] = trial.suggest_float('lr', 1e-6, 1e-3, log=True)
    hparams['lr_pretrained'] = trial.suggest_float('lr_pretrained', 1e-8, 1e-4, log=True)
    if hparams['optimizer'] == 'adam':
        hparams['l2_reg'] = trial.suggest_categorical('l2_reg', [0, 1e-1, 1e-2, 1e-3])
    else:
        hparams['momentum'] = trial.suggest_float('momentum', 0.5, 0.95)
    hparams['reduce_factor_lr_schedule'] = trial.suggest_float('reduce_factor_lr_schedule', 0.01, 0.5, log=True)
    hparams['loss'] = 'cross_entropy'  # trial.suggest_categorical('loss', ('cross_entropy', 'focal_loss'))
    if hparams['loss'] == 'focal_loss':
        hparams['fl_gamma'] = trial.suggest_categorical('fl_gamma', [None, 1, 2, 5])
    else:
        hparams['fl_gamma'] = None

    # data augmentation
    hparams['randommotion_prob'] = trial.suggest_float('randommotion_prob', 0, 0.8)
    hparams['randombiasfield_prob'] = trial.suggest_float('randombiasfield_prob', 0, 0.8)
    hparams['randomblur_prob'] = trial.suggest_float('randomblur_prob', 0, 0.8)
    hparams['randomnoise_prob'] = trial.suggest_float('randomnoise_prob', 0, 0.8)
    hparams['randomelasticdef_prob'] = trial.suggest_float('randomelasticdef_prob', 0, 0.8)
    hparams['randomaffine_prob'] = trial.suggest_float('randomaffine_prob', 0, 0.8)

    hparams['weighted_sampler'] = trial.suggest_categorical('weighted_sampler', [True, False])

    # currently no cross validation
    train_dataset = get_train_dataset(cfg, hparams, val_fold=0, modalities=['T1w', 'FLAIR', 'TABULAR'])
    val_dataset = get_val_dataset(cfg, hparams, val_fold=0, modalities=['T1w', 'FLAIR', 'TABULAR'])

    shuffle = True
    class_weights = train_dataset.get_class_weights()
    sampler = None
    if hparams['weighted_sampler'] == True:
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

    hparams['class_weights'] = class_weights
    hparams['n_classes'] = len(class_weights)
    hparams['class_mapping'] = train_dataset.get_class_mapping()

    model = AllModalitiesFusionModel(hparams=hparams)
    # model = medcam.inject(model, output_dir='attention_maps', backend='gcam', label=None,
    #                      save_maps=True)

    lr_monitor = LearningRateMonitor(logging_interval='epoch')

    aim_logger = AimLogger(
            experiment='fusion_model_ALL',
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
            callbacks=[
                lr_monitor,
                EarlyStopping(monitor='val_loss', mode='min', patience=hparams['early_stopping_patience']),
                PyTorchLightningPruningCallback(trial, monitor='val_loss'),
                ModelCheckpoint(monitor='val_loss',
                                dirpath=cfg["weights"]["weights_path_all_mod"],
                                filename='epoch={epoch}-val_loss={val_loss_epoch:.3f}'),
                ModelCheckpoint(monitor='val_f1_score',
                                mode='max',
                                dirpath=cfg["weights"]["weights_path_all_mod"],
                                filename='epoch={epoch}-val_f1={val_f1_epoch:.3f}')]
    )

    trainer.fit(model, train_loader, val_loader)
    return trainer.callback_metrics["val_loss"]


if __name__ == '__main__':
    pl.seed_everything(0) # for reproducibility of random transforms
    with open("./configs/config_all.json", 'r') as j:
        cfg = json.loads(j.read())
    objective_func = lambda trial: objective(trial, cfg)

    study = optuna.create_study(direction="minimize", sampler=RandomSampler())
    study.optimize(objective_func, n_trials=200, timeout=60*60*24) #timeout in seconds

    # https://github.com/optuna/optuna-examples/blob/main/pytorch/pytorch_lightning_simple.py
    print("Number of finished trials: {}".format(len(study.trials)))

    print("Best trial:")
    trial = study.best_trial

    print("  Value: {}".format(trial.value))

    print("  Params: ")
    for key, value in trial.params.items():
        print("    {}: {}".format(key, value))
