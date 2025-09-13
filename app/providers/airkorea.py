import httpx
from app.config import settings

FORECAST_URL = "http://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getMinuDustFrcstDspth"

async def get_forecast_pm25(region_name: str):
    if not settings.AIRKOREA_SERVICE_KEY_URLENC:
        return None
    params = {
        "serviceKey": settings.AIRKOREA_SERVICE_KEY_URLENC,
        "returnType": "json",
        "numOfRows": 100,
        "pageNo": 1,
        "searchDate": None,
        "informCode": "PM25",
    }
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.get(FORECAST_URL, params={k: v for k, v in params.items() if v is not None})
        try:
            js = r.json()
        except Exception:
            return None
        items = js.get("response", {}).get("body", {}).get("items", [])
        if not items:
            return None
        latest = items[0]
        informGrade = latest.get("informGrade", "")
        grade = None
        for token in informGrade.split(","):
            token = token.strip()
            if token.startswith(region_name):
                grade = token.split(":")[-1].strip()
                break
        return {"category": grade}
