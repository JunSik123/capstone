import httpx
from app.config import settings

VWORLD_URL = "https://api.vworld.kr/req/address"

async def geocode_address(address: str):
    if not settings.VWORLD_API_KEY:
        raise RuntimeError("VWORLD_API_KEY not set")
    params = {
        "service": "address",
        "request": "getcoord",
        "version": "2.0",
        "crs": "epsg:4326",
        "type": "road",
        "address": address,
        "key": settings.VWORLD_API_KEY,
    }
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.get(VWORLD_URL, params=params)
        data = r.json()
        try:
            item = data["response"]["result"]["point"]
            x, y = float(item["x"]), float(item["y"])
            return y, x
        except Exception:
            params["type"] = "parcel"
            r2 = await client.get(VWORLD_URL, params=params)
            data2 = r2.json()
            item = data2["response"]["result"]["point"]
            x, y = float(item["x"]), float(item["y"])
            return y, x
