# Frontend-to-Backend API Endpoint Coverage Matrix

Every single endpoint exposed by the FastAPI backend (`backend/app/api/*.py`) is implemented in `frontend/lib/api.ts` and wired to real UI views with zero mock data.

## Summary
- **Total Backend Endpoints:** 15 REST JSON + 1 SSE Streaming + 2 Public Health Probes = **18 / 18 (100% Coverage)**
- **Mock Data Remaining:** **0**

## Complete Endpoint Mapping Table

| # | Backend Method & Final Path | Backend Handler (`file:line`) | Frontend API Function (`frontend/lib/api.ts`) | UI Location(s) (`frontend/`) | Status |
|---|---|---|---|---|---|
| 1 | `POST /api/v1/auth/login` | `backend/app/api/auth.py:45` | `login()` (`lib/api.ts:171`) | `app/login/page.tsx`, `lib/auth.ts` | **Implemented** |
| 2 | `POST /api/v1/auth/refresh` | `backend/app/api/auth.py:78` | `refreshToken()` (`lib/api.ts:192`) | Automatic 401 interceptor in `lib/api.ts:95-118` & `lib/auth.ts` | **Implemented** |
| 3 | `POST /api/v1/auth/logout` | `backend/app/api/auth.py:119` | `logout()` (`lib/api.ts:211`) | `components/layout/navbar.tsx`, `components/ui/command-palette.tsx` | **Implemented** |
| 4 | `POST /api/v1/documents` | `backend/app/api/documents.py:21` | `upload_document()` (`lib/api.ts:227`) | `components/documents/document-upload.tsx`, `app/documents/page.tsx` | **Implemented** |
| 5 | `GET /api/v1/documents` | `backend/app/api/documents.py:62` | `list_documents()` (`lib/api.ts:260`) | `app/page.tsx`, `app/documents/page.tsx`, `app/chat/page.tsx` | **Implemented** |
| 6 | `GET /api/v1/documents/{document_id}` | `backend/app/api/documents.py:78` | `get_document()` (`lib/api.ts:275`) | `app/documents/[id]/page.tsx` (with `?include_download_url=true`) | **Implemented** |
| 7 | `GET /api/v1/documents/{document_id}/status` | `backend/app/api/documents.py:96` | `get_document_status()` (`lib/api.ts:291`) | `components/documents/document-status.tsx` (auto-polling), `app/documents/[id]/page.tsx` | **Implemented** |
| 8 | `POST /api/v1/documents/{document_id}/reindex` | `backend/app/api/documents.py:118` | `reindex_document()` (`lib/api.ts:301`) | `components/documents/document-list.tsx` (single + bulk), `app/documents/[id]/page.tsx` | **Implemented** |
| 9 | `DELETE /api/v1/documents/{document_id}` | `backend/app/api/documents.py:140` | `delete_document()` (`lib/api.ts:311`) | `components/documents/document-list.tsx` (single + bulk), `app/documents/[id]/page.tsx` | **Implemented** |
| 10 | `POST /api/v1/chat/stream` | `backend/app/api/chat.py:13` | `stream_chat_query()` (`lib/api.ts:325`) | `app/chat/page.tsx`, `lib/sse.ts` (`event: citation`, `event: token`, `event: done`) | **Implemented** |
| 11 | `GET /api/v1/tenants` | `backend/app/api/tenants.py:21` | `list_tenants()` (`lib/api.ts:392`) | `app/admin/tenants/page.tsx` | **Implemented** |
| 12 | `POST /api/v1/tenants` | `backend/app/api/tenants.py:30` | `create_tenant()` (`lib/api.ts:397`) | `app/admin/tenants/page.tsx` | **Implemented** |
| 13 | `GET /api/v1/tenants/{tenant_id}/members` | `backend/app/api/tenants.py:46` | `list_tenant_members()` (`lib/api.ts:408`) | `app/admin/tenants/page.tsx` | **Implemented** |
| 14 | `POST /api/v1/tenants/{tenant_id}/members` | `backend/app/api/tenants.py:57` | `add_tenant_member()` (`lib/api.ts:418`) | `app/admin/tenants/page.tsx` | **Implemented** |
| 15 | `PATCH /api/v1/tenants/{tenant_id}/members/{user_id}` | `backend/app/api/tenants.py:79` | `update_tenant_member_role()` (`lib/api.ts:440`) | `app/admin/tenants/page.tsx` | **Implemented** |
| 16 | `GET /health` | `backend/app/api/health.py:14` | `get_health_liveness()` (`lib/api.ts:460`) | `components/layout/navbar.tsx`, `app/page.tsx` | **Implemented** |
| 17 | `GET /ready` | `backend/app/api/health.py:20` | `get_health_readiness()` (`lib/api.ts:468`) | `components/layout/navbar.tsx`, `app/page.tsx` | **Implemented** |
| 18 | `GET /metrics` | `backend/app/api/health.py:42` | `get_prometheus_metrics()` (`lib/api.ts:476`) | `app/admin/tenants/page.tsx` | **Implemented** |
