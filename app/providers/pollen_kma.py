import httpx
from app.config import settings

# KMA Life Weather Index service (3.0) pollen risk endpoint (V4)
BASE = "http://apis.data.go.kr/1360000/HealthWthrIdxServiceV4/getPollenRiskIdxV4"

async def get_pollen(area_code: str, target_date: str):
    if not settings.KMA_HEALTH_INDEX_KEY_URLENC:
        return None
    params = {
        "serviceKey": settings.KMA_HEALTH_INDEX_KEY_URLENC,
        "pageNo": 1,
        "numOfRows": 10,
        "areaNo": area_code,
        "time": target_date.replace("-", ""),
        "dataType": "JSON",
    }
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.get(BASE, params=params)
            js = r.json()
        items = js.get("response", {}).get("body", {}).get("items", [])
        if not items:
            return None
        it = items[0]
        return {
            "oak": it.get("oakPollenRisk"),
            "pine": it.get("pinePollenRisk"),
            "weed": it.get("weedPollenRisk"),
        }
    except Exception:
        return None
