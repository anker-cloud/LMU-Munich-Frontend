import os
import torch.cuda

#os.chdir('../..')
os.environ["CUDA_VISIBLE_DEVICES"]="0"

from models.dataloader import *
from torch.utils.data import DataLoader, WeightedRandomSampler
from models.tab_models.tabular_nn import TabularNN
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
    #print(torch.cuda.is_available())
    device_count = torch.cuda.device_count()
    #print(torch.cuda.current_device())
    #print(gpu_id)
    if not gpu_id or not device_count:
        raise ValueError('No gpu specified! Please select "export CUDA_VISIBLE_DEVICES=<device_id>')
    hparams = {
        'early_stopping_patience': 20,
        'max_epochs': 100,
        'gpu_id': gpu_id,
    }
    hparams['batch_size'] = trial.suggest_categorical('batch_size', [32,64,128,256,512])
    hparams['lr'] = trial.suggest_float('lr', 1e-5, 1e-2, log=True)
    hparams['l2_reg'] = trial.suggest_categorical('l2_reg', [0, 1e-1, 1e-2, 1e-3])
    hparams['weighted_sampler'] = trial.suggest_categorical('weighted_sampler', [True, False])
    hparams['dropout_prob'] = trial.suggest_categorical('dropout_prob', [0, 0.2, 0.5])
    linear_layer_options = [(512, 64),
                            (256, 64),
                            (128, 64),
                            (512, 512, 64),
                            (512, 256, 64),
                            (256, 256, 64),
                            (256, 128, 64),
                            (128, 128, 64)]
    linear_layer_option = trial.suggest_categorical('linear_layer_option', [0, 1, 2, 3, 4, 5, 6, 7])
    hparams['linear_layer_option'] = linear_layer_options[linear_layer_option]
    hparams['loss'] = trial.suggest_categorical('loss', ('cross_entropy', 'focal_loss'))

    train_dataset = get_train_dataset(cfg, hparams, val_fold=0, modalities=['TABULAR'])
    val_dataset = get_val_dataset(cfg, hparams, val_fold=0, modalities=['TABULAR'])

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
    hparams['n_in_features'] = train_dataset.get_number_tab_features()

    model = TabularNN(hparams)
    lr_monitor = LearningRateMonitor(logging_interval='epoch')

    aim_logger = AimLogger(
        experiment='tab_nn',
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
        callbacks=[  # metric_tracker,
            lr_monitor,
            EarlyStopping(monitor='val_loss', mode='min', patience=hparams['early_stopping_patience']),
            PyTorchLightningPruningCallback(trial, monitor='val_loss'),
            ModelCheckpoint(monitor='val_loss',
                            dirpath=cfg["weights"]["weights_path_TABULAR"],
                            filename='epoch={epoch}-val_loss={val_loss_epoch:.3f}'),
            ModelCheckpoint(monitor='val_f1_score',
                            mode='max',
                            dirpath=cfg["weights"]["weights_path_TABULAR"],
                            filename='epoch={epoch}-val_f1={val_f1_epoch:.3f}')]
    )
    print(trainer)

    trainer.fit(model, train_loader, val_loader)
    return trainer.callback_metrics["val_loss"]



if __name__ == '__main__':
    torch.multiprocessing.set_start_method('spawn')

    with open("./configs/config_all.json", 'r') as j:
        cfg = json.loads(j.read())
    objective_func = lambda trial: objective(trial, cfg)

    study = optuna.create_study(direction="minimize", sampler=RandomSampler())
    study.optimize(objective_func, n_trials=50, timeout=60 * 20)  # timeout in seconds

    # https://github.com/optuna/optuna-examples/blob/main/pytorch/pytorch_lightning_simple.py
    print("Number of finished trials: {}".format(len(study.trials)))

    print("Best trial:")
    trial = study.best_trial

    print("  Value: {}".format(trial.value))

    print("  Params: ")
    for key, value in trial.params.items():
        print("    {}: {}".format(key, value))

