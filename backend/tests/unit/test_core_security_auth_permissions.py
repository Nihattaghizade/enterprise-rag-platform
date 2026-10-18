import uuid
from datetime import timedelta

import pytest

from app.core.auth import create_access_token, create_refresh_token, decode_token
from app.core.errors import ForbiddenError, NotFoundError, UnauthorizedError, ValidationError
from app.core.permissions import assert_tenant_access, require_role, validate_role
from app.core.rate_limit import (
    build_concurrent_jobs_quota_key,
    build_tenant_ratelimit_key,
    build_upload_ratelimit_key,
    build_user_ratelimit_key,
)
from app.core.security import hash_password, verify_password
from app.db.models import Membership


def test_password_hashing_and_verification() -> None:
    hashed = hash_password("StrongPass123!")
    assert hashed != "StrongPass123!"
    assert verify_password("StrongPass123!", hashed) is True
    assert verify_password("WrongPass123!", hashed) is False

    with pytest.raises(ValidationError):
        hash_password("short")


def test_jwt_access_and_refresh_tokens() -> None:
    user_id = uuid.uuid4()
    tenant_id = uuid.uuid4()

    access = create_access_token(user_id=user_id, tenant_id=tenant_id, role="admin")
    decoded_access = decode_token(access, expected_type="access")
    assert decoded_access["sub"] == str(user_id)
    assert decoded_access["tenant_id"] == str(tenant_id)
    assert decoded_access["role"] == "admin"

    refresh = create_refresh_token(user_id=user_id, tenant_id=tenant_id)
    decoded_refresh = decode_token(refresh, expected_type="refresh")
    assert decoded_refresh["sub"] == str(user_id)

    with pytest.raises(UnauthorizedError):
        decode_token(access, expected_type="refresh")

    expired = create_access_token(user_id=user_id, expires_delta=timedelta(seconds=-5))
    with pytest.raises(UnauthorizedError):
        decode_token(expired)


def test_rbac_and_tenant_isolation_checks() -> None:
    user_id = uuid.uuid4()
    tenant_a = uuid.uuid4()
    tenant_b = uuid.uuid4()

    membership = Membership(id=uuid.uuid4(), user_id=user_id, tenant_id=tenant_a, role="editor")

    assert validate_role("ADMIN") == "admin"
    with pytest.raises(ValidationError):
        validate_role("superadmin")

    require_role(membership, ["admin", "editor"])
    with pytest.raises(ForbiddenError):
        require_role(membership, ["admin"])

    assert assert_tenant_access(membership, tenant_a) == tenant_a
    with pytest.raises(ForbiddenError):
        assert_tenant_access(membership, tenant_b)


def test_error_response_contract() -> None:
    err = NotFoundError("Document not found", details={"doc_id": "123"})
    payload = err.to_response_dict(request_id="req-uuid-1")
    assert payload == {
        "code": "not_found",
        "message": "Document not found",
        "details": {"doc_id": "123"},
        "request_id": "req-uuid-1",
    }


def test_redis_ratelimit_key_patterns() -> None:
    uid = uuid.uuid4()
    tid = uuid.uuid4()
    assert f":ratelimit:user:{uid}:100" in build_user_ratelimit_key(uid, 100)
    assert f":ratelimit:tenant:{tid}:100" in build_tenant_ratelimit_key(tid, 100)
    assert f":ratelimit:upload:{tid}:100" in build_upload_ratelimit_key(tid, 100)
    assert f":quota:concurrent_jobs:{tid}" in build_concurrent_jobs_quota_key(tid)