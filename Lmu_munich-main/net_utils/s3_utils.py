"""
S3 Utility Helpers
------------------
Handles downloading checkpoints from S3 and uploading output images.

Buckets:
  lmu-checkpoints   — model checkpoint files (.ckpt, .p)
  lmu-shap-output   — inference output images (SHAP chart, Grad-CAM heatmap)
"""

import os
import boto3
from botocore.exceptions import ClientError

CHECKPOINTS_BUCKET = "lmu-checkpoints"
OUTPUTS_BUCKET     = "lmu-shap-output"

_s3 = None


def _client():
    global _s3
    if _s3 is None:
        _s3 = boto3.client("s3")
    return _s3


# ---------------------------------------------------------------------------
# Checkpoint download
# ---------------------------------------------------------------------------

def download_checkpoint_if_missing(local_path: str) -> None:
    """
    If `local_path` doesn't exist, download it from S3.
    The S3 key mirrors the local path relative to the project root.

    e.g. local:  model_checkpoints/T1W_FLAIR/T1W_FLAIR/epoch=...ckpt
         s3 key: model_checkpoints/T1W_FLAIR/T1W_FLAIR/epoch=...ckpt
    """
    if os.path.exists(local_path):
        return

    # Build S3 key from local path (strip leading separators)
    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    s3_key = os.path.relpath(local_path, project_root).replace("\\", "/")

    print(f"[S3] Downloading checkpoint: {s3_key}")
    os.makedirs(os.path.dirname(local_path), exist_ok=True)

    try:
        _client().download_file(CHECKPOINTS_BUCKET, s3_key, local_path)
        print(f"[S3] Saved to: {local_path}")
    except ClientError as e:
        raise FileNotFoundError(
            f"Checkpoint not found locally or in S3 ({CHECKPOINTS_BUCKET}/{s3_key}).\n"
            f"Upload it with: aws s3 cp model_checkpoints/ s3://{CHECKPOINTS_BUCKET}/model_checkpoints/ --recursive\n"
            f"Original error: {e}"
        )


# ---------------------------------------------------------------------------
# Output upload
# ---------------------------------------------------------------------------

def upload_output(local_path: str, s3_key: str = None) -> str:
    """
    Upload a local file to the outputs S3 bucket.
    If s3_key is not given, uses the filename.

    Returns the S3 URI: s3://lmu-shap-output/<s3_key>
    """
    if not os.path.exists(local_path):
        return None

    if s3_key is None:
        s3_key = os.path.basename(local_path)

    try:
        _client().upload_file(local_path, OUTPUTS_BUCKET, s3_key)
        uri = f"s3://{OUTPUTS_BUCKET}/{s3_key}"
        print(f"[S3] Uploaded: {local_path} → {uri}")
        return uri
    except ClientError as e:
        print(f"[S3] Upload failed for {local_path}: {e}")
        return None


def get_presigned_url(s3_key: str, expires_in: int = 3600) -> str:
    """
    Generate a pre-signed URL so the frontend can download the file directly.
    Valid for `expires_in` seconds (default 1 hour).
    """
    try:
        url = _client().generate_presigned_url(
            "get_object",
            Params={"Bucket": OUTPUTS_BUCKET, "Key": s3_key},
            ExpiresIn=expires_in,
        )
        return url
    except ClientError as e:
        print(f"[S3] Could not generate presigned URL: {e}")
        return None


def upload_to_patient_folder(local_path: str, patient_id: str, filename: str) -> str:
    """
    Upload a file into s3://{OUTPUTS_BUCKET}/{patient_id}/{filename}.
    Returns a presigned URL (1 hour), or None on failure.
    """
    s3_key = f"{patient_id}/{filename}"
    uri    = upload_output(local_path, s3_key)
    if uri:
        return get_presigned_url(s3_key)
    return None


# ---------------------------------------------------------------------------
# Patient folder listing & result persistence
# ---------------------------------------------------------------------------

def list_patient_folders() -> list:
    """
    List all patient IDs from top-level folders in the outputs bucket.
    Each folder name is a patient ID (e.g. AAA038).
    """
    try:
        paginator   = _client().get_paginator('list_objects_v2')
        patient_ids = []
        for page in paginator.paginate(Bucket=OUTPUTS_BUCKET, Delimiter='/'):
            for prefix in page.get('CommonPrefixes', []):
                folder = prefix['Prefix'].rstrip('/')
                if folder:
                    patient_ids.append(folder)
        return sorted(patient_ids)
    except ClientError as e:
        print(f"[S3] Error listing patient folders: {e}")
        return []


def list_patient_files(patient_id: str) -> list:
    """
    List all files inside s3://{OUTPUTS_BUCKET}/{patient_id}/.
    Returns list of dicts: {filename, s3_key, size_bytes, last_modified, url}
    """
    try:
        paginator = _client().get_paginator('list_objects_v2')
        files     = []
        for page in paginator.paginate(Bucket=OUTPUTS_BUCKET, Prefix=f"{patient_id}/"):
            for obj in page.get('Contents', []):
                key      = obj['Key']
                filename = key.split('/', 1)[-1]
                if not filename:
                    continue
                files.append({
                    'filename':      filename,
                    's3_key':        key,
                    'size_bytes':    obj['Size'],
                    'last_modified': obj['LastModified'].isoformat(),
                    'url':           get_presigned_url(key),
                })
        return files
    except ClientError as e:
        print(f"[S3] Error listing files for {patient_id}: {e}")
        return []


def get_patient_result_json(patient_id: str) -> dict:
    """
    Download and parse {patient_id}/{patient_id}.json from S3.
    Returns None if the file does not exist.
    """
    import json as _json
    key = f"{patient_id}/{patient_id}.json"
    try:
        resp = _client().get_object(Bucket=OUTPUTS_BUCKET, Key=key)
        return _json.loads(resp['Body'].read().decode('utf-8'))
    except ClientError as e:
        if e.response['Error']['Code'] in ('NoSuchKey', '404'):
            return None
        print(f"[S3] Error fetching result JSON for {patient_id}: {e}")
        return None


def upload_result_json(patient_id: str, result: dict) -> None:
    """
    Save the prediction result dict as {patient_id}/{patient_id}.json in S3.
    This is the persistent record of the diagnosis for this patient.
    """
    import json as _json
    key  = f"{patient_id}/{patient_id}.json"
    body = _json.dumps(result, indent=2, default=str).encode('utf-8')
    try:
        _client().put_object(
            Bucket=OUTPUTS_BUCKET,
            Key=key,
            Body=body,
            ContentType='application/json',
        )
        print(f"[S3] Saved result JSON: s3://{OUTPUTS_BUCKET}/{key}")
    except ClientError as e:
        print(f"[S3] Failed to upload result JSON for {patient_id}: {e}")