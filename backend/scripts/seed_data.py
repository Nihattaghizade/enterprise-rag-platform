import asyncio
import uuid
from sqlalchemy import text
from app.core.security import hash_password
from app.db.models import Membership, Tenant, User
from app.db.session import create_engine, get_session_factory

DEFAULT_PASSWORD = "Password123!"

TENANTS_DATA = [
    # 1. Platform Root Workspace (Exclusively for Superadmins)
    {
        "id": uuid.UUID("00000000-0000-0000-0000-000000000001"),
        "name": "Platform Administration",
        "slug": "platform",
        "status": "active",
        "settings": {"is_platform": True, "tier": "root"},
    },
    # 2. Evaluation Sandbox
    {
        "id": uuid.UUID("00000000-0000-0000-0000-000000000002"),
        "name": "Trial Sandbox (Test)",
        "slug": "sandbox-trial",
        "status": "active",
        "settings": {"is_sandbox": True, "max_documents": 2, "max_questions": 10},
    },
    # 3. Active Enterprise Tenants
    {
        "id": uuid.UUID("11111111-1111-1111-1111-111111111111"),
        "name": "Acme Global Technologies",
        "slug": "acme-global",
        "status": "active",
        "settings": {"industry": "Software & AI", "storage_quota_mb": 10240},
    },
    {
        "id": uuid.UUID("22222222-2222-2222-2222-222222222222"),
        "name": "Apex Financial & Capital",
        "slug": "apex-finance",
        "status": "active",
        "settings": {"industry": "Investment Banking", "storage_quota_mb": 20480},
    },
    {
        "id": uuid.UUID("33333333-3333-3333-3333-333333333333"),
        "name": "BioHealth Life Sciences",
        "slug": "biohealth-labs",
        "status": "active",
        "settings": {"industry": "Biotechnology", "storage_quota_mb": 15360},
    },
    {
        "id": uuid.UUID("44444444-4444-4444-4444-444444444444"),
        "name": "CyberShield Defense Tech",
        "slug": "cybershield-tech",
        "status": "active",
        "settings": {"industry": "Cybersecurity & Defense", "storage_quota_mb": 30720},
    },
    {
        "id": uuid.UUID("55555555-5555-5555-5555-555555555555"),
        "name": "Nova Legal Partners LLP",
        "slug": "nova-legal",
        "status": "active",
        "settings": {"industry": "Legal Compliance", "storage_quota_mb": 10240},
    },
    {
        "id": uuid.UUID("66666666-6666-6666-6666-666666666666"),
        "name": "AeroSpace Dynamics Corp",
        "slug": "aerospace-dynamics",
        "status": "active",
        "settings": {"industry": "Aviation & Space", "storage_quota_mb": 25600},
    },
    {
        "id": uuid.UUID("77777777-7777-7777-7777-777777777777"),
        "name": "GreenGrid Clean Energy",
        "slug": "greengrid-energy",
        "status": "active",
        "settings": {"industry": "Renewable Power", "storage_quota_mb": 10240},
    },
    {
        "id": uuid.UUID("88888888-8888-8888-8888-888888888888"),
        "name": "OmniRetail Group",
        "slug": "omni-retail",
        "status": "active",
        "settings": {"industry": "Global Supply & Retail", "storage_quota_mb": 15360},
    },
    # 4. Pending Approval Proposals (Populates Superadmin Workspace Approval Queue)
    {
        "id": uuid.UUID("99999999-9999-9999-9999-999999999991"),
        "name": "Vanguard Global Logistics",
        "slug": "vanguard-logistics",
        "status": "pending",
        "settings": {"industry": "Maritime Shipping", "requested_plan": "enterprise"},
    },
    {
        "id": uuid.UUID("99999999-9999-9999-9999-999999999992"),
        "name": "Nexus Quantum Computing",
        "slug": "nexus-quantum",
        "status": "pending",
        "settings": {"industry": "Quantum Research", "requested_plan": "enterprise"},
    },
]

USERS_MEMBERSHIPS_DATA = [
    # --- 1. PLATFORM ADMINISTRATION ---
    {
        "email": "superadmin@enterprise.internal",
        "password": "SuperAdmin123!",
        "full_name": "Root Platform Superadmin",
        "tenant_id": uuid.UUID("00000000-0000-0000-0000-000000000001"),
        "role": "superadmin",
        "status": "active",
    },
    {
        "email": "sec-officer@enterprise.internal",
        "password": DEFAULT_PASSWORD,
        "full_name": "Security Compliance Officer",
        "tenant_id": uuid.UUID("00000000-0000-0000-0000-000000000001"),
        "role": "admin",
        "status": "active",
    },
    {
        "email": "infra.monitor@enterprise.internal",
        "password": DEFAULT_PASSWORD,
        "full_name": "Infrastructure Engineer",
        "tenant_id": uuid.UUID("00000000-0000-0000-0000-000000000001"),
        "role": "viewer",
        "status": "active",
    },

    # --- 2. TRIAL EVALUATION SANDBOX ---
    {
        "email": "eval.tester1@sample.org",
        "password": DEFAULT_PASSWORD,
        "full_name": "Alex Evaluation Tester",
        "tenant_id": uuid.UUID("00000000-0000-0000-0000-000000000002"),
        "role": "trial_viewer",
        "status": "active",
    },
    {
        "email": "eval.tester2@sample.org",
        "password": DEFAULT_PASSWORD,
        "full_name": "Jordan Trial User",
        "tenant_id": uuid.UUID("00000000-0000-0000-0000-000000000002"),
        "role": "trial_viewer",
        "status": "active",
    },

    # --- 3. ACME GLOBAL TECHNOLOGIES ---
    {
        "email": "acme.admin@acme.com",
        "password": DEFAULT_PASSWORD,
        "full_name": "Marcus Vance (Acme Lead Admin)",
        "tenant_id": uuid.UUID("11111111-1111-1111-1111-111111111111"),
        "role": "admin",
        "status": "active",
    },
    {
        "email": "alice.editor@acme.com",
        "password": DEFAULT_PASSWORD,
        "full_name": "Alice Chen (Senior ML Engineer)",
        "tenant_id": uuid.UUID("11111111-1111-1111-1111-111111111111"),
        "role": "editor",
        "status": "active",
    },
    {
        "email": "bob.viewer@acme.com",
        "password": DEFAULT_PASSWORD,
        "full_name": "Bob Miller (Product Manager)",
        "tenant_id": uuid.UUID("11111111-1111-1111-1111-111111111111"),
        "role": "viewer",
        "status": "active",
    },
    {
        "email": "applicant.acme@acme.com",
        "password": DEFAULT_PASSWORD,
        "full_name": "David Candidate (Pending Applicant)",
        "tenant_id": uuid.UUID("11111111-1111-1111-1111-111111111111"),
        "role": "editor",
        "status": "pending_approval",
    },

    # --- 4. APEX FINANCIAL & CAPITAL ---
    {
        "email": "apex.lead@apexfinance.io",
        "password": DEFAULT_PASSWORD,
        "full_name": "Elena Rostova (VP Risk Management)",
        "tenant_id": uuid.UUID("22222222-2222-2222-2222-222222222222"),
        "role": "admin",
        "status": "active",
    },
    {
        "email": "senior.analyst@apexfinance.io",
        "password": DEFAULT_PASSWORD,
        "full_name": "Liam Thorne (Quantitative Analyst)",
        "tenant_id": uuid.UUID("22222222-2222-2222-2222-222222222222"),
        "role": "editor",
        "status": "active",
    },
    {
        "email": "auditor@apexfinance.io",
        "password": DEFAULT_PASSWORD,
        "full_name": "Claire Novak (Internal Auditor)",
        "tenant_id": uuid.UUID("22222222-2222-2222-2222-222222222222"),
        "role": "viewer",
        "status": "active",
    },
    {
        "email": "trainee.analyst@apexfinance.io",
        "password": DEFAULT_PASSWORD,
        "full_name": "Ethan Ward (Analyst Applicant)",
        "tenant_id": uuid.UUID("22222222-2222-2222-2222-222222222222"),
        "role": "viewer",
        "status": "pending_approval",
    },

    # --- 5. BIOHEALTH LIFE SCIENCES ---
    {
        "email": "dr.admin@biohealth.org",
        "password": DEFAULT_PASSWORD,
        "full_name": "Dr. Sarah Admin (Chief Medical Officer)",
        "tenant_id": uuid.UUID("33333333-3333-3333-3333-333333333333"),
        "role": "admin",
        "status": "active",
    },
    {
        "email": "lead.scientist@biohealth.org",
        "password": DEFAULT_PASSWORD,
        "full_name": "Dr. Gregory House (Principal Investigator)",
        "tenant_id": uuid.UUID("33333333-3333-3333-3333-333333333333"),
        "role": "editor",
        "status": "active",
    },
    {
        "email": "clinical.reader@biohealth.org",
        "password": DEFAULT_PASSWORD,
        "full_name": "Maria Garcia (Clinical Trials Monitor)",
        "tenant_id": uuid.UUID("33333333-3333-3333-3333-333333333333"),
        "role": "viewer",
        "status": "active",
    },
    {
        "email": "fellow.researcher@biohealth.org",
        "password": DEFAULT_PASSWORD,
        "full_name": "Julian Bell (Postdoc Applicant)",
        "tenant_id": uuid.UUID("33333333-3333-3333-3333-333333333333"),
        "role": "editor",
        "status": "pending_approval",
    },

    # --- 6. CYBERSHIELD DEFENSE TECH ---
    {
        "email": "director@cybershield.mil",
        "password": DEFAULT_PASSWORD,
        "full_name": "Col. James Rhodes (Security Director)",
        "tenant_id": uuid.UUID("44444444-4444-4444-4444-444444444444"),
        "role": "admin",
        "status": "active",
    },
    {
        "email": "threat.intel@cybershield.mil",
        "password": DEFAULT_PASSWORD,
        "full_name": "Natasha Roman (Threat Intelligence)",
        "tenant_id": uuid.UUID("44444444-4444-4444-4444-444444444444"),
        "role": "editor",
        "status": "active",
    },
    {
        "email": "soc.analyst@cybershield.mil",
        "password": DEFAULT_PASSWORD,
        "full_name": "Peter Parker (SOC Analyst Tier 1)",
        "tenant_id": uuid.UUID("44444444-4444-4444-4444-444444444444"),
        "role": "viewer",
        "status": "active",
    },

    # --- 7. NOVA LEGAL PARTNERS LLP ---
    {
        "email": "managing.partner@novalegal.com",
        "password": DEFAULT_PASSWORD,
        "full_name": "Harvey Specter (Managing Partner)",
        "tenant_id": uuid.UUID("55555555-5555-5555-5555-555555555555"),
        "role": "admin",
        "status": "active",
    },
    {
        "email": "senior.associate@novalegal.com",
        "password": DEFAULT_PASSWORD,
        "full_name": "Mike Ross (Senior Associate)",
        "tenant_id": uuid.UUID("55555555-5555-5555-5555-555555555555"),
        "role": "editor",
        "status": "active",
    },
    {
        "email": "paralegal@novalegal.com",
        "password": DEFAULT_PASSWORD,
        "full_name": "Rachel Zane (Head Paralegal)",
        "tenant_id": uuid.UUID("55555555-5555-5555-5555-555555555555"),
        "role": "viewer",
        "status": "active",
    },

    # --- 8. AEROSPACE DYNAMICS CORP ---
    {
        "email": "flight.director@aerospace.io",
        "password": DEFAULT_PASSWORD,
        "full_name": "Gene Kranz (Flight Operations Director)",
        "tenant_id": uuid.UUID("66666666-6666-6666-6666-666666666666"),
        "role": "admin",
        "status": "active",
    },
    {
        "email": "propulsion.lead@aerospace.io",
        "password": DEFAULT_PASSWORD,
        "full_name": "Margaret Hamilton (Propulsion Software Lead)",
        "tenant_id": uuid.UUID("66666666-6666-6666-6666-666666666666"),
        "role": "editor",
        "status": "active",
    },

    # --- 9. GREENGRID CLEAN ENERGY ---
    {
        "email": "grid.admin@greengrid.energy",
        "password": DEFAULT_PASSWORD,
        "full_name": "Klaus Weber (Grid Operations Admin)",
        "tenant_id": uuid.UUID("77777777-7777-7777-7777-777777777777"),
        "role": "admin",
        "status": "active",
    },
    {
        "email": "field.inspector@greengrid.energy",
        "password": DEFAULT_PASSWORD,
        "full_name": "Sophia Martinez (Renewables Inspector)",
        "tenant_id": uuid.UUID("77777777-7777-7777-7777-777777777777"),
        "role": "viewer",
        "status": "active",
    },

    # --- 10. OMNIRETAIL GROUP ---
    {
        "email": "retail.admin@omniretail.com",
        "password": DEFAULT_PASSWORD,
        "full_name": "Arthur Pendelton (Supply Chain Admin)",
        "tenant_id": uuid.UUID("88888888-8888-8888-8888-888888888888"),
        "role": "admin",
        "status": "active",
    },
    {
        "email": "inventory.lead@omniretail.com",
        "password": DEFAULT_PASSWORD,
        "full_name": "Linda Gomez (Inventory Lead)",
        "tenant_id": uuid.UUID("88888888-8888-8888-8888-888888888888"),
        "role": "editor",
        "status": "active",
    },

    # --- 11 & 12. PENDING WORKSPACE FOUNDERS (Awaiting Superadmin Workspace Approval) ---
    {
        "email": "vanguard.founder@vanguardlog.com",
        "password": DEFAULT_PASSWORD,
        "full_name": "Captain Frank Woods (Maritime Founder)",
        "tenant_id": uuid.UUID("99999999-9999-9999-9999-999999999991"),
        "role": "admin",
        "status": "pending_approval",
    },
    {
        "email": "nexus.lead@nexusquantum.tech",
        "password": DEFAULT_PASSWORD,
        "full_name": "Dr. Raymond Shaw (Quantum Lab Founder)",
        "tenant_id": uuid.UUID("99999999-9999-9999-9999-999999999992"),
        "role": "admin",
        "status": "pending_approval",
    },
]


async def seed_database():
    create_engine()
    session_factory = get_session_factory()
    print("Connecting to PostgreSQL...")

    async with session_factory() as session:
        print("Truncating existing data (CASCADE)...")
        await session.execute(
            text(
                "TRUNCATE TABLE parent_contexts, documents, query_logs, usage_records, audit_logs, memberships, users, tenants CASCADE;"
            )
        )
        await session.commit()

        print(f"Creating {len(TENANTS_DATA)} enterprise workspaces & sandboxes...")
        for t_info in TENANTS_DATA:
            tenant = Tenant(
                id=t_info["id"],
                name=t_info["name"],
                slug=t_info["slug"],
                status=t_info["status"],
                is_active=True,
                settings=t_info["settings"],
            )
            session.add(tenant)
        await session.flush()

        print(f"Creating {len(USERS_MEMBERSHIPS_DATA)} users and workspace memberships...")
        for u_info in USERS_MEMBERSHIPS_DATA:
            user = User(
                id=uuid.uuid4(),
                email=u_info["email"],
                password_hash=hash_password(u_info["password"]),
                is_active=True,
                metadata_={"full_name": u_info["full_name"]},
            )
            session.add(user)
            await session.flush()

            membership = Membership(
                id=uuid.uuid4(),
                user_id=user.id,
                tenant_id=u_info["tenant_id"],
                role=u_info["role"],
                status=u_info["status"],
            )
            session.add(membership)

        await session.commit()

        print("\n" + "=" * 70)
        print("DATABASE SEED COMPLETED SUCCESSFULLY")
        print("=" * 70)
        print(f"Total Workspaces Inserted: {len(TENANTS_DATA)} (10 Active, 2 Pending Approval)")
        print(f"Total Accounts Created:    {len(USERS_MEMBERSHIPS_DATA)} (Active & Pending Members)")
        print("-" * 70)
        print("ROOT PLATFORM SUPERADMIN:")
        print("  Email:    superadmin@enterprise.internal")
        print("  Password: SuperAdmin123!")
        print("  Tenant:   Platform Administration")
        print("-" * 70)
        print("SAMPLE WORKSPACE ADMIN ACCOUNTS (Password: Password123!):")
        print("  - Acme Global Tech:       acme.admin@acme.com")
        print("  - Apex Financial:         apex.lead@apexfinance.io")
        print("  - BioHealth Sciences:     dr.admin@biohealth.org")
        print("  - CyberShield Defense:    director@cybershield.mil")
        print("  - Nova Legal Partners:    managing.partner@novalegal.com")
        print("  - AeroSpace Dynamics:     flight.director@aerospace.io")
        print("  - GreenGrid Clean Energy: grid.admin@greengrid.energy")
        print("  - OmniRetail Group:       retail.admin@omniretail.com")
        print("  - Trial Sandbox User:     eval.tester1@sample.org")
        print("-" * 70)
        print("PENDING QUEUES FOR TESTING SUPERADMIN APPROVALS:")
        print("  - Workspace Proposals:   Vanguard Logistics, Nexus Quantum Computing")
        print("  - Member Applications:   David Candidate (Acme), Ethan Ward (Apex), etc.")
        print("=" * 70)


if __name__ == "__main__":
    asyncio.run(seed_database())