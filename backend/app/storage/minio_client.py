from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from typing import Any

import aioboto3
from botocore.config import Config
from botocore.exceptions import ClientError

from app.config import get_settings


def _resolve_endpoint_url(endpoint: str, secure: bool) -> str:
    if endpoint.startswith("http://") or endpoint.startswith("https://"):
        return endpoint
    scheme = "https" if secure else "http"
    return f"{scheme}://{endpoint}"


def _resolve_credentials() -> tuple[str, str]:
    """Use MINIO_ROOT_USER/MINIO_ROOT_PASSWORD when MINIO_ACCESS_KEY is placeholder or mismatched."""
    settings = get_settings()
    access_key = settings.MINIO_ACCESS_KEY
    secret_key = settings.MINIO_SECRET_KEY
    if (
        not access_key
        or access_key.startswith("replace-with-")
        or access_key != settings.MINIO_ROOT_USER
    ):
        access_key = settings.MINIO_ROOT_USER
    if (
        not secret_key
        or secret_key.startswith("replace-with-")
        or secret_key != settings.MINIO_ROOT_PASSWORD
    ):
        secret_key = settings.MINIO_ROOT_PASSWORD
    return access_key, secret_key


@asynccontextmanager
async def get_s3_client() -> AsyncGenerator[Any, None]:
    """Yield an async S3-compatible client configured for MinIO."""
    settings = get_settings()
    access_key, secret_key = _resolve_credentials()
    endpoint_url = _resolve_endpoint_url(settings.MINIO_ENDPOINT, settings.MINIO_SECURE)

    session = aioboto3.Session()
    s3_config = Config(
        signature_version="s3v4",
        s3={"addressing_style": "path"},
    )
    async with session.client(
        "s3",
        endpoint_url=endpoint_url,
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        region_name="us-east-1",
        config=s3_config,
    ) as client:
        yield client


async def ensure_bucket() -> str:
    """Ensure the private rag-documents bucket exists and enable versioning."""
    settings = get_settings()
    bucket_name = settings.MINIO_BUCKET_NAME

    async with get_s3_client() as client:
        try:
            await client.head_bucket(Bucket=bucket_name)
        except ClientError as exc:
            error_code = str(exc.response.get("Error", {}).get("Code", ""))
            if error_code in ("404", "NoSuchBucket", "NotFound"):
                await client.create_bucket(Bucket=bucket_name)
            else:
                raise

        try:
            await client.put_bucket_versioning(
                Bucket=bucket_name,
                VersioningConfiguration={"Status": "Enabled"},
            )
        except ClientError:
            pass

    return bucket_name