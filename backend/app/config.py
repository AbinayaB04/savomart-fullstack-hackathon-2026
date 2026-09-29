from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql://savomart:savomart_secret@localhost:5438/savomart_sitescout"
    ENVIRONMENT: str = "development"

    # External APIs
    STORES_API_URL: str = "https://internal-service.savomart.in/bridge/api/store/list?is_operational=True"
    STORES_API_TOKEN: str = "mock_token_for_dev"

    # LLM Settings
    LLM_PROVIDER: str = "none"  # gemini | openai | anthropic | none
    GEMINI_API_KEY: Optional[str] = None
    OPENAI_API_KEY: Optional[str] = None
    ANTHROPIC_API_KEY: Optional[str] = None

    # Chennai Focus Region Bounding Box
    CHENNAI_MIN_LAT: float = 12.80
    CHENNAI_MAX_LAT: float = 13.25
    CHENNAI_MIN_LON: float = 80.05
    CHENNAI_MAX_LON: float = 80.35

    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore"
    )

    def is_within_chennai(self, lat: float, lon: float) -> bool:
        """Reject any location outside Chennai's bounding box."""
        return (
            self.CHENNAI_MIN_LAT <= lat <= self.CHENNAI_MAX_LAT and
            self.CHENNAI_MIN_LON <= lon <= self.CHENNAI_MAX_LON
        )


settings = Settings()
