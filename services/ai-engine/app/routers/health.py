"""
TransLogistics AI Engine - Health Check Router

Provides health and readiness endpoints for container orchestration.
"""

import time
from typing import Literal

from fastapi import APIRouter, Response
from pydantic import BaseModel

from app.config import get_settings
from app.utils.logger import logger


router = APIRouter(prefix="/health", tags=["Health"])

# Track start time for uptime calculation
START_TIME = time.time()


class HealthResponse(BaseModel):
    """Health check response model."""
    
    status: Literal["ok", "degraded", "unhealthy"]
    service: str
    version: str
    uptime_seconds: float
    model_version: str


class LivenessResponse(BaseModel):
    """Liveness probe response."""
    
    status: Literal["ok"]


class ReadinessResponse(BaseModel):
    """Readiness probe response."""
    
    status: Literal["ready", "not_ready"]
    checks: dict[str, bool]


@router.get("", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    """
    Health Check Endpoint
    
    Returns comprehensive health status including:
    - Service status
    - Version information
    - Uptime
    - Model version
    """
    settings = get_settings()
    
    return HealthResponse(
        status="ok",
        service=settings.APP_NAME,
        version=settings.APP_VERSION,
        uptime_seconds=round(time.time() - START_TIME, 2),
        model_version=settings.VOLUMESCAN_MODEL_VERSION,
    )


@router.get("/live", response_model=LivenessResponse)
async def liveness_probe() -> LivenessResponse:
    """
    Liveness Probe
    
    Simple check that the service is running.
    Used by Kubernetes liveness probes.
    """
    return LivenessResponse(status="ok")


@router.get("/ready", response_model=ReadinessResponse)
async def readiness_probe(response: Response) -> ReadinessResponse:
    """
    Readiness Probe
    
    Checks if the service is ready to accept traffic.
    Used by Kubernetes readiness probes.
    
    For AI Engine, we check:
    - Model availability (placeholder for now)
    """
    # Placeholder checks - will be expanded when model is integrated
    checks = {
        "model_loaded": True,  # Placeholder
    }
    
    all_ready = all(checks.values())
    
    if not all_ready:
        response.status_code = 503
        logger.warning("Readiness check failed", checks=checks)
    
    return ReadinessResponse(
        status="ready" if all_ready else "not_ready",
        checks=checks,
    )
