"""
TransLogistics AI Engine - FastAPI Entry Point

This is the main entry point for the VolumeScan AI service.
"""

from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.routers import health
from app.utils.logger import logger


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """
    Application lifespan manager.
    
    Handles startup and shutdown events.
    """
    settings = get_settings()
    
    # Startup
    logger.info(
        "Starting TransLogistics AI Engine",
        service=settings.APP_NAME,
        version=settings.APP_VERSION,
        model_version=settings.VOLUMESCAN_MODEL_VERSION,
    )
    
    # Here we would load ML models, initialize connections, etc.
    # For now, just log that we're ready
    logger.info("AI Engine ready to accept requests")
    
    yield
    
    # Shutdown
    logger.info("Shutting down AI Engine")


# ==================================================
# APPLICATION FACTORY
# ==================================================

def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    settings = get_settings()
    
    app = FastAPI(
        title="TransLogistics AI Engine",
        description="VolumeScan AI - Dimension estimation from single photos",
        version=settings.APP_VERSION,
        lifespan=lifespan,
        docs_url="/docs" if settings.DEBUG else None,
        redoc_url="/redoc" if settings.DEBUG else None,
    )
    
    # ==================================================
    # MIDDLEWARE
    # ==================================================
    
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],  # Restrict in production
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    
    # ==================================================
    # EXCEPTION HANDLERS
    # ==================================================
    
    @app.exception_handler(Exception)
    async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        """Global exception handler for unhandled errors."""
        logger.error(
            "Unhandled exception",
            error=str(exc),
            error_type=type(exc).__name__,
            path=request.url.path,
            method=request.method,
        )
        
        return JSONResponse(
            status_code=500,
            content={
                "error": {
                    "code": "INTERNAL_ERROR",
                    "message": "An internal error occurred",
                },
                "meta": {
                    "service": settings.APP_NAME,
                },
            },
        )
    
    # ==================================================
    # ROUTERS
    # ==================================================
    
    app.include_router(health.router)
    
    # Future routers:
    # app.include_router(volumescan.router, prefix="/api/v1")
    
    # ==================================================
    # ROOT ENDPOINT
    # ==================================================
    
    @app.get("/")
    async def root() -> dict[str, str]:
        """Root endpoint with service info."""
        return {
            "service": settings.APP_NAME,
            "version": settings.APP_VERSION,
            "status": "running",
        }
    
    return app


# Create the application instance
app = create_app()


if __name__ == "__main__":
    import uvicorn
    
    settings = get_settings()
    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
        log_level=settings.LOG_LEVEL.lower(),
    )
