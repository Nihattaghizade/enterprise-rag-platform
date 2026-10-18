from functools import lru_cache
from pathlib import Path
from typing import List
from urllib.parse import quote_plus

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Approved chunking defaults required by ARCHITECTURE.md Section 5.1 (lines 226-240)
RECURSIVE_PARENT_TARGET_TOKENS = 1200
RECURSIVE_PARENT_MIN_TOKENS = 1000
RECURSIVE_PARENT_MAX_TOKENS = 1400
RECURSIVE_CHILD_TARGET_TOKENS = 350
RECURSIVE_CHILD_MIN_TOKENS = 300
RECURSIVE_CHILD_MAX_TOKENS = 400
RECURSIVE_CHILD_OVERLAP_TOKENS = 50
SEMANTIC_SECTION_TOKEN_THRESHOLD = 2500
MAX_PARENT_CONTEXTS_PER_ANSWER = 3
HYBRID_CANDIDATE_LIMIT = 60
RERANKED_CHILD_LIMIT = 8


class Settings(BaseSettings):
    """Reads and validates all settings from the .env file. No credentials are stored here."""

    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Application & Environment
    ENVIRONMENT: str
    APP_NAME: str
    APP_VERSION: str
    DEBUG: bool
    LOG_LEVEL: str
    CORS_ORIGINS: str

    # Security & JWT
    JWT_SECRET_KEY: str
    JWT_ALGORITHM: str
    ACCESS_TOKEN_EXPIRE_MINUTES: int
    REFRESH_TOKEN_EXPIRE_DAYS: int

    # PostgreSQL
    POSTGRES_HOST: str
    POSTGRES_PORT: int
    POSTGRES_USER: str
    POSTGRES_PASSWORD: str
    POSTGRES_DB: str
    DATABASE_URL: str

    # Redis
    REDIS_HOST: str
    REDIS_PORT: int
    REDIS_PASSWORD: str = ""
    REDIS_DB: int
    REDIS_URL: str
    REDIS_KEY_PREFIX: str
    QUERY_CACHE_TTL_SECONDS: int
    EMBEDDING_CACHE_TTL_SECONDS: int
    RERANK_CACHE_TTL_SECONDS: int

    # Qdrant
    QDRANT_HOST: str
    QDRANT_PORT: int
    QDRANT_GRPC_PORT: int
    QDRANT_URL: str
    QDRANT_API_KEY: str = ""
    QDRANT_COLLECTION_NAME: str
    QDRANT_HNSW_M: int
    QDRANT_HNSW_EF_CONSTRUCT: int

    # MinIO Object Storage
    MINIO_ENDPOINT: str
    MINIO_ROOT_USER: str
    MINIO_ROOT_PASSWORD: str
    MINIO_ACCESS_KEY: str
    MINIO_SECRET_KEY: str
    MINIO_BUCKET_NAME: str
    MINIO_SECURE: bool
    MINIO_PRESIGNED_URL_EXPIRE_SECONDS: int

    # Embedding & Reranker Models
    EMBEDDING_MODEL_NAME: str
    EMBEDDING_DIMENSIONS: int
    EMBEDDING_SERVICE_URL: str
    RERANKER_MODEL_NAME: str
    RERANKER_SERVICE_URL: str

    # Approved Chunking & Retrieval Defaults (Section 5.1)
    RECURSIVE_PARENT_TARGET_TOKENS: int = Field(default=RECURSIVE_PARENT_TARGET_TOKENS)
    RECURSIVE_PARENT_MIN_TOKENS: int = Field(default=RECURSIVE_PARENT_MIN_TOKENS)
    RECURSIVE_PARENT_MAX_TOKENS: int = Field(default=RECURSIVE_PARENT_MAX_TOKENS)
    RECURSIVE_CHILD_TARGET_TOKENS: int = Field(default=RECURSIVE_CHILD_TARGET_TOKENS)
    RECURSIVE_CHILD_MIN_TOKENS: int = Field(default=RECURSIVE_CHILD_MIN_TOKENS)
    RECURSIVE_CHILD_MAX_TOKENS: int = Field(default=RECURSIVE_CHILD_MAX_TOKENS)
    RECURSIVE_CHILD_OVERLAP_TOKENS: int = Field(default=RECURSIVE_CHILD_OVERLAP_TOKENS)
    SEMANTIC_SECTION_TOKEN_THRESHOLD: int = Field(default=SEMANTIC_SECTION_TOKEN_THRESHOLD)
    MAX_PARENT_CONTEXTS_PER_ANSWER: int = Field(default=MAX_PARENT_CONTEXTS_PER_ANSWER)
    HYBRID_CANDIDATE_LIMIT: int = Field(default=HYBRID_CANDIDATE_LIMIT)
    RERANKED_CHILD_LIMIT: int = Field(default=RERANKED_CHILD_LIMIT)

    # LLM & Generation
    LLM_PROVIDER: str
    LLM_MODEL_NAME: str
    LLM_FALLBACK_MODEL_NAME: str
    LLM_API_KEY: str
    LLM_TEMPERATURE: float
    ENABLE_GROUNDING_CHECK: bool

    # LangSmith Tracing
    LANGCHAIN_TRACING_V2: bool
    LANGCHAIN_ENDPOINT: str
    LANGCHAIN_API_KEY: str
    LANGCHAIN_PROJECT: str

    @model_validator(mode="after")
    def resolve_local_docker_hosts(self) -> "Settings":
        """When running on host OS outside Docker, resolve container hostnames to 127.0.0.1."""
        in_docker = Path("/.dockerenv").exists()
        if not in_docker:
            if self.POSTGRES_HOST == "postgres":
                self.POSTGRES_HOST = "127.0.0.1"
            if self.REDIS_HOST == "redis":
                self.REDIS_HOST = "127.0.0.1"
                self.REDIS_URL = self.REDIS_URL.replace("://redis:", "://127.0.0.1:")
            if self.QDRANT_HOST == "qdrant":
                self.QDRANT_HOST = "127.0.0.1"
                self.QDRANT_URL = self.QDRANT_URL.replace("://qdrant:", "://127.0.0.1:")
            if self.MINIO_ENDPOINT.startswith("minio:"):
                self.MINIO_ENDPOINT = self.MINIO_ENDPOINT.replace("minio:", "127.0.0.1:", 1)

        encoded_user = quote_plus(self.POSTGRES_USER)
        encoded_pass = quote_plus(self.POSTGRES_PASSWORD)
        self.DATABASE_URL = (
            f"postgresql+asyncpg://{encoded_user}:{encoded_pass}"
            f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )
        return self

    @property
    def cors_origin_list(self) -> List[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    """Return cached application Settings instance loaded from .env."""
    return Settings()