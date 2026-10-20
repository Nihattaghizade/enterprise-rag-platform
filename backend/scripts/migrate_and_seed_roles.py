import asyncio
import uuid
import sys
import os

# Add parent directory to path to import app modules
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy import text
from app.db.session import get_session_factory
from app.core.security import hash_password


async def run_migration_and_seed():
    print("=" * 60)
    print("RUNNING ROLE & STATUS MIGRATION AND SEEDING")
    print("=" * 60)

    session_factory = get_session_factory()
    async with session_factory() as session:
        # 1. Add status columns if they do not already exist
        print("[1/4] Ensuring 'status' column on 'tenants' table...")
        await session.execute(
            text("ALTER TABLE tenants ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';")
        )

        print("[2/4] Ensuring 'status' column on 'memberships' table...")
        await session.execute(
            text("ALTER TABLE memberships ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';")
        )

        await session.execute(
            text("CREATE INDEX IF NOT EXISTS idx_memberships_status ON memberships(status);")
        )
        await session.commit()
        print("  -> Columns and indexes verified.")

        # 3. Create or get Platform Management Workspace
        print("[3/4] Ensuring Platform Workspace exists...")
        res = await session.execute(
            text("SELECT id, name FROM tenants WHERE slug = 'platform';")
        )
        platform_tenant = res.fetchone()
        if not platform_tenant:
            platform_id = uuid.uuid4()
            await session.execute(
                text(
                    "INSERT INTO tenants (id, name, slug, status, settings, is_active, created_at, updated_at) "
                    "VALUES (:id, :name, :slug, :status, '{}'::jsonb, true, NOW(), NOW());"
                ),
                {
                    "id": platform_id,
                    "name": "Enterprise Platform",
                    "slug": "platform",
                    "status": "active",
                },
            )
            print(f"  -> Created platform tenant: {platform_id}")
        else:
            platform_id = platform_tenant[0]
            print(f"  -> Existing platform tenant found: {platform_id}")

        # 4. Create or update Superadmin user
        print("[4/4] Ensuring default superadmin user exists...")
        superadmin_email = "superadmin@enterprise.internal"
        res = await session.execute(
            text("SELECT id FROM users WHERE email = :email;"),
            {"email": superadmin_email},
        )
        user_row = res.fetchone()
        pw_hash = hash_password("SuperAdminPass123!")

        if not user_row:
            user_id = uuid.uuid4()
            await session.execute(
                text(
                    "INSERT INTO users (id, email, password_hash, is_active, metadata, created_at, updated_at) "
                    "VALUES (:id, :email, :password_hash, true, '{}'::jsonb, NOW(), NOW());"
                ),
                {
                    "id": user_id,
                    "email": superadmin_email,
                    "password_hash": pw_hash,
                },
            )
            print(f"  -> Created superadmin user: {user_id}")
        else:
            user_id = user_row[0]
            await session.execute(
                text("UPDATE users SET password_hash = :password_hash, is_active = true WHERE id = :id;"),
                {"password_hash": pw_hash, "id": user_id},
            )
            print(f"  -> Updated superadmin credentials for user: {user_id}")

        # Ensure superadmin membership in platform workspace
        res = await session.execute(
            text(
                "SELECT id, role, status FROM memberships WHERE user_id = :user_id AND tenant_id = :tenant_id;"
            ),
            {"user_id": user_id, "tenant_id": platform_id},
        )
        membership_row = res.fetchone()
        if not membership_row:
            await session.execute(
                text(
                    "INSERT INTO memberships (id, user_id, tenant_id, role, status, created_at, updated_at) "
                    "VALUES (:id, :user_id, :tenant_id, :role, :status, NOW(), NOW());"
                ),
                {
                    "id": uuid.uuid4(),
                    "user_id": user_id,
                    "tenant_id": platform_id,
                    "role": "superadmin",
                    "status": "active",
                },
            )
            print("  -> Assigned 'superadmin' active membership.")
        else:
            await session.execute(
                text(
                    "UPDATE memberships SET role = 'superadmin', status = 'active' "
                    "WHERE id = :id;"
                ),
                {"id": membership_row[0]},
            )
            print("  -> Updated existing membership to 'superadmin' (active).")

        await session.commit()

    print("=" * 60)
    print("MIGRATION & SEEDING COMPLETED SUCCESSFULLY!")
    print(f"Superadmin Email:    {superadmin_email}")
    print("Superadmin Password: SuperAdminPass123!")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(run_migration_and_seed())
