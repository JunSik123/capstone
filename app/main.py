from fastapi import FastAPI, HTTPException, Query
from datetime import datetime
from app.providers.geocode_vworld import geocode_address
from app.providers.weather_openmeteo_kma import get_daily_summary
from app.providers.airkorea import get_forecast_pm25
from app.risk.geo_context import build_geo_context
from app.risk.engine import calc_hazards, map_advice, pick_ingredients
from app.models import RiskResponse, ForecastDaily, AirQuality, PollenRisk
from app.providers.mfds_products import list_products_by_ingredient

app = FastAPI(title="K-HealthWeather-MVP", version="0.2.0")

REGION_MAP = {
    "서울": "서울", "인천": "인천", "경기": "경기", "부산": "부산", "대구": "대구",
    "대전": "대전", "광주": "광주", "울산": "울산", "세종": "세종", "강원": "강원",
    "충북": "충북", "충남": "충남", "전북": "전북", "전남": "전남", "경북": "경북",
    "경남": "경남", "제주": "제주",
}

def _guess_region_from_address(addr: str) -> str:
    for k in REGION_MAP:
        if addr.startswith(k):
            return REGION_MAP[k]
    return next(iter(REGION_MAP.values()))

@app.get("/api/risk", response_model=RiskResponse)
async def get_risk(address: str = Query(..., description="도로명/지번 주소"),
                   date_str: str = Query(None, description="YYYY-MM-DD, default=today")):
    target_date = date_str or datetime.now().strftime("%Y-%m-%d")
    try:
        lat, lon = await geocode_address(address)
    except Exception as e:
        raise HTTPException(400, f"Geocoding failed: {e}")

    fc_dict = await get_daily_summary(lat, lon, target_date)
    fc = ForecastDaily(**fc_dict)

    geo = await build_geo_context(lat, lon)

    region = _guess_region_from_address(address)
    air_raw = await get_forecast_pm25(region)
    air = AirQuality(**air_raw) if air_raw else None

    pollen = None

    hazards = calc_hazards(geo=geo, fc=fc, air=air, pollen=pollen)
    advice = map_advice(hazards)

    ing_picks = pick_ingredients(hazards)
    ingredient_recs = []
    for pick in ing_picks:
        products = await list_products_by_ingredient(pick["ingredient_kor"], rows=20)
        ingredient_recs.append({
            "ingredient_kor": pick["ingredient_kor"],
            "ingredient_eng": pick.get("ingredient_eng"),
            "reason": pick.get("reason"),
            "products": products,
        })

    return RiskResponse(
        date=target_date,
        address=address,
        lat=lat,
        lon=lon,
        geo=geo,
        forecast=fc,
        air=air,
        pollen=pollen,
        hazards=hazards,
        otc_suggestions=advice,
        ingredient_recs=ingredient_recs,
        safety_flags=[
            "This is educational information, not medical advice.",
            "Consult a pharmacist/doctor for suitability, dosing and interactions."
        ]
    )

@app.get("/")
async def root():
    return {"ok": True, "see": "/docs for Swagger UI"}
