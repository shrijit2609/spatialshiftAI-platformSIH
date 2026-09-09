from __future__ import annotations

import asyncio
import json
from typing import AsyncGenerator

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app.exceptions import SpatialShiftError
from app.store import store

router = APIRouter(prefix="/api/events", tags=["events"])


@router.get("/jobs/{job_id}")
async def stream_job_events(job_id: str):
    job = store.require_job(job_id)

    async def event_generator() -> AsyncGenerator[str, None]:
        queue = job.subscribe()
        try:
            # Yield initial state
            yield f"data: {json.dumps(job.payload())}\n\n"
            if job.status in ("complete", "failed"):
                return

            while True:
                try:
                    payload = await asyncio.wait_for(queue.get(), timeout=30.0)
                    yield f"data: {json.dumps(payload)}\n\n"
                    if payload.get("status") in ("complete", "failed"):
                        break
                except asyncio.TimeoutError:
                    # Heartbeat / keep-alive comment
                    yield ": ping\n\n"
        finally:
            job.unsubscribe(queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
