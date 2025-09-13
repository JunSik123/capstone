from pydantic import BaseModel, Field
from typing import List, Optional, Dict

class GeoContext(BaseModel):
    coast_dist_km: float | None = None
    forest_frac: float = 0.0
    urban_frac: float = 0.0
    wetland_frac: float = 0.0

class ForecastDaily(BaseModel):
    date: str
    tmax: Optional[float] = None
    tmin: Optional[float] = None
    uv_max: Optional[float] = None
    precip_mm: Optional[float] = None
    wind_max: Optional[float] = None
    rh_mean: Optional[float] = None
    rh_min: Optional[float] = None
    hi_max: Optional[float] = None
    wind_chill_min: Optional[float] = None

class AirQuality(BaseModel):
    pm25: Optional[float] = None
    o3: Optional[float] = None
    category: Optional[str] = None

class PollenRisk(BaseModel):
    oak: Optional[int] = None
    pine: Optional[int] = None
    weed: Optional[int] = None

class HazardScore(BaseModel):
    type: str
    score: float = 0.0
    why: List[str] = []

class Advice(BaseModel):
    category: str
    reason: str

class Product(BaseModel):
    item_name: str
    entp_name: Optional[str] = None
    dosage_form: Optional[str] = None
    strength: Optional[str] = None
    permit_date: Optional[str] = None

class IngredientRec(BaseModel):
    ingredient_kor: str
    ingredient_eng: Optional[str] = None
    reason: str
    products: List[Product] = []

class RiskResponse(BaseModel):
    date: str
    address: str
    lat: float
    lon: float
    geo: GeoContext
    forecast: ForecastDaily
    air: AirQuality | None = None
    pollen: PollenRisk | None = None
    hazards: List[HazardScore]
    otc_suggestions: List[Advice]
    ingredient_recs: List[IngredientRec] = []
    safety_flags: List[str] = []
