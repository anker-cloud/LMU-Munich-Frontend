import torch, sys

path = sys.argv[1] if len(sys.argv) > 1 else 'model_checkpoints/TAB_FLAIR/TAB_FLAIR/epoch=epoch=99-val_loss=val_loss_epoch=0.000.ckpt'
ckpt = torch.load(path, map_location='cpu')

print("=== HPARAMS ===")
hp = ckpt.get('hyper_parameters', {})
for k, v in hp.items():
    print(f"  {k}: {v}")

print("\n=== STATE DICT ===")
for k, v in ckpt['state_dict'].items():
    print(k, list(v.shape))
