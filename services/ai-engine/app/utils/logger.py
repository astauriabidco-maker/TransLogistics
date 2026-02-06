"""
TransLogistics AI Engine - Structured Logging

Provides consistent JSON logging for production
and human-readable output for development.
"""

import logging
import sys
from typing import Any, Optional

import structlog
from structlog.types import Processor

from app.config import get_settings


def setup_logging() -> None:
    """Configure structured logging based on environment."""
    settings = get_settings()
    
    # Shared processors
    shared_processors: list[Processor] = [
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.StackInfoRenderer(),
        structlog.processors.TimeStamper(fmt="iso"),
    ]
    
    if settings.LOG_FORMAT == "console":
        # Human-readable for development
        shared_processors.extend([
            structlog.dev.ConsoleRenderer(colors=True),
        ])
    else:
        # JSON for production
        shared_processors.extend([
            structlog.processors.format_exc_info,
            structlog.processors.JSONRenderer(),
        ])
    
    structlog.configure(
        processors=shared_processors,
        wrapper_class=structlog.make_filtering_bound_logger(
            getattr(logging, settings.LOG_LEVEL.upper())
        ),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )


def get_logger(name: Optional[str] = None) -> structlog.BoundLogger:
    """Get a structured logger instance."""
    return structlog.get_logger(name)


# Initialize logging on import
setup_logging()

# Default logger
logger = get_logger("ai-engine")
