from pydantic import BaseModel
import os

class Settings(BaseModel):
    VWORLD_API_KEY: str | None = os.getenv("VWORLD_API_KEY")
    AIRKOREA_SERVICE_KEY_URLENC: str | None = os.getenv("AIRKOREA_SERVICE_KEY_URLENC")
    KMA_HEALTH_INDEX_KEY_URLENC: str | None = os.getenv("KMA_HEALTH_INDEX_KEY_URLENC")
    OVERPASS_URL: str = os.getenv("OVERPASS_URL", "https://overpass-api.de/api/interpreter")
    DEFAULT_TIMEZONE: str = os.getenv("DEFAULT_TIMEZONE", "Asia/Seoul")
    MFDS_SERVICE_KEY_URLENC: str | None = os.getenv("MFDS_SERVICE_KEY_URLENC")

settings = Settings()
