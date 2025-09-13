from typing import Optional

import httpx
from fastapi import HTTPException

BASE = "https://api.open-meteo.com/v1/forecast"


async def get_daily_summary(latitude: float, longitude: float) -> Optional[dict]:
    """Fetch a daily weather summary from the Open-Meteo KMA model."""
    params = {
        "latitude": latitude,
        "longitude": longitude,
        "daily": "weathercode,temperature_2m_max,temperature_2m_min",
        "timezone": "Asia/Seoul",
        "models": "kma",
    }
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(BASE, params=params)
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            raise HTTPException(status_code=502) from exc
    return response.json().get("daily")
