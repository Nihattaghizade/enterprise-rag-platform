from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AuthContext, get_auth_context
from app.db.session import get_db_session
from app.schemas.chat import ChatRequest
from app.services.chat_service import run_chat_query

router = APIRouter(prefix="/api/v1/chat", tags=["chat"])


@router.post("/stream")
async def stream_chat_endpoint(
    payload: ChatRequest,
    ctx: AuthContext = Depends(get_auth_context),
    session: AsyncSession = Depends(get_db_session),
) -> StreamingResponse:
    """Section 5.2: Accept a query and stream answer/citation Server-Sent Events (SSE)."""
    event_generator = run_chat_query(
        session=session,
        tenant_id=ctx.tenant_id,
        user_id=ctx.user_id,
        query=payload.query,
        tags=payload.tags,
        doc_ids=payload.doc_ids,
    )
    return StreamingResponse(
        event_generator,
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )