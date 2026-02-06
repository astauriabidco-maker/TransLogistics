"""
TransLogistics AI Engine Configuration

Environment-based configuration with validation.
"""

from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    # Application
    APP_NAME: str = "translogistics-ai-engine"
    APP_VERSION: str = "0.1.0"
    DEBUG: bool = False
    
    # Server
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    
    # Logging
    LOG_LEVEL: str = "INFO"
    LOG_FORMAT: str = "json"  # json or console
    
    # Internal API Key (for API -> AI Engine calls)
    INTERNAL_API_KEY: str = "dev-internal-key"
    
    # VolumeScan Configuration
    VOLUMESCAN_MODEL_VERSION: str = "v0.1.0"
    VOLUMESCAN_AUTO_ACCEPT_THRESHOLD: float = 0.85
    VOLUMESCAN_MANUAL_THRESHOLD: float = 0.60
    
    # A4 Reference Dimensions (mm)
    A4_WIDTH_MM: float = 210.0
    A4_HEIGHT_MM: float = 297.0
    
    # Tolerance
    DIMENSION_TOLERANCE_PERCENT: float = 10.0

    class Config:
        env_file = ".env"
        case_sensitive = True


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
