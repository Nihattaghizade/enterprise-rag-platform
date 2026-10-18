import hashlib
import secrets

from pwdlib import PasswordHash

from app.core.errors import ValidationError

_password_hasher = PasswordHash.recommended()


def validate_password_strength(password: str) -> None:
    """Validate minimum password complexity rules."""
    if len(password) < 8:
        raise ValidationError(
            "Password must be at least 8 characters long.",
            code="weak_password",
        )


def hash_password(password: str) -> str:
    """Hash a plaintext password using Argon2id."""
    validate_password_strength(password)
    return _password_hasher.hash(password)


def verify_password(plain_password: str, password_hash: str) -> bool:
    """Verify a plaintext password against a stored Argon2/bcrypt hash."""
    if not plain_password or not password_hash:
        return False
    return _password_hasher.verify(plain_password, password_hash)


def generate_token_id() -> str:
    """Generate a cryptographically random token identifier (jti)."""
    return secrets.token_urlsafe(24)


def sha256_hexdigest(value: str) -> str:
    """Compute SHA-256 hex digest for cache and integrity keys."""
    return hashlib.sha256(value.encode("utf-8")).hexdigest()