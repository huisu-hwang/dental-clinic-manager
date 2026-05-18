"""Model artifact storage — joblib (sklearn standard) on Supabase private bucket.

Security: only trusted artifacts produced by our own training worker are loaded.
User-uploaded files are never deserialized.
"""
import io
import joblib
from regime.supabase_client import get_supabase

BUCKET = "regime-models"


def upload_model(scope_type: str, scope_id: str, model_type: str,
                 model_version: str, model_obj: dict) -> str:
    """joblib 직렬화 후 Supabase Storage 비공개 버킷에 업로드. Returns object path."""
    buf = io.BytesIO()
    joblib.dump(model_obj, buf)
    buf.seek(0)
    path = f"{scope_type}/{scope_id}/{model_type}_{model_version}.joblib"

    sb = get_supabase()
    sb.storage.from_(BUCKET).upload(
        path,
        buf.getvalue(),
        {"content-type": "application/octet-stream", "x-upsert": "true"},
    )
    return path


def download_model(path: str) -> dict:
    """Trusted internal artifact 만 로드 (우리 워커가 생성한 것)."""
    sb = get_supabase()
    blob = sb.storage.from_(BUCKET).download(path)
    return joblib.load(io.BytesIO(blob))
