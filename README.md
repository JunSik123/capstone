# K-HealthWeather-MVP — Full Codebase (Backend-first, Python/FastAPI)

> 한국 한정: 날짜·주소 입력 → 예보/대기질/계절성 + 지역 지형(해안/산지/도시/습지) 반영 → 상비의약품 **카테고리** 추천. 노코드가 아니라 **직접 실행 가능한 코드**입니다.

---

## 📁 Repository Structure

```
K-HealthWeather-MVP/
├─ app/
│  ├─ main.py
│  ├─ config.py
│  ├─ models.py
│  ├─ risk/
│  │  ├─ engine.py
│  │  ├─ rules.yaml
│  │  └─ geo_context.py
│  ├─ providers/
│  │  ├─ geocode_vworld.py
│  │  ├─ weather_openmeteo_kma.py
│  │  ├─ airkorea.py
│  │  ├─ pollen_kma.py
│  │  └─ overpass_landcover.py
│  └─ utils/
│     ├─ geo.py
│     └─ h3grid.py
├─ requirements.txt
├─ .env.example
└─ README.md
```

---

## 🔧 requirements.txt

```txt
fastapi==0.112.2
uvicorn[standard]==0.30.6
pydantic==2.9.1
python-dotenv==1.0.1
httpx==0.27.2
h3==3.7.7
shapely==2.0.6
pyproj==3.6.1
pandas==2.2.2
PyYAML==6.0.2
```

---

## 🔐 .env.example

```env
# --- Required (get your own keys) ---
VWORLD_API_KEY=YOUR_VWORLD_KEY
AIRKOREA_SERVICE_KEY_URLENC=YOUR_DATA_GO_KR_KEY_URLENCODED
KMA_HEALTH_INDEX_KEY_URLENC=YOUR_DATA_GO_KR_KEY_URLENCODED

# (NEW) MFDS product permission API (의약품 제품 허가정보)
MFDS_SERVICE_KEY_URLENC=YOUR_DATA_GO_KR_KEY_URLENCODED

# Optional: tune
OVERPASS_URL=https://overpass-api.de/api/interpreter
DEFAULT_TIMEZONE=Asia/Seoul
```

> `*_URLENC`는 data.go.kr에서 발급 받은 서비스키를 **URL 인코딩 된 형태**로 넣으세요.

---

## 🧭 app/config.py

```python
from pydantic import BaseModel
from dotenv import load_dotenv
import os

load_dotenv()

class Settings(BaseModel):
    VWORLD_API_KEY: str | None = os.getenv("VWORLD_API_KEY")
    AIRKOREA_SERVICE_KEY_URLENC: str | None = os.getenv("AIRKOREA_SERVICE_KEY_URLENC")
    KMA_HEALTH_INDEX_KEY_URLENC: str | None = os.getenv("KMA_HEALTH_INDEX_KEY_URLENC")
    OVERPASS_URL: str = os.getenv("OVERPASS_URL", "https://overpass-api.de/api/interpreter")
    DEFAULT_TIMEZONE: str = os.getenv("DEFAULT_TIMEZONE", "Asia/Seoul")
    MFDS_SERVICE_KEY_URLENC: str | None = os.getenv("MFDS_SERVICE_KEY_URLENC")

settings = Settings()
```

---

## 🧱 app/models.py

```python
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
    # NEW derived metrics
    rh_mean: Optional[float] = None       # %
    rh_min: Optional[float] = None        # %
    hi_max: Optional[float] = None        # °C (heat index max)
    wind_chill_min: Optional[float] = None # °C (lowest wind chill)

class AirQuality(BaseModel):
    pm25: Optional[float] = None  # µg/m3 (forecast if available)
    o3: Optional[float] = None    # ppb or µg/m3 depending on source
    category: Optional[str] = None  # Good/Moderate/Bad etc.

class PollenRisk(BaseModel):
    oak: Optional[int] = None   # 0-3 (낮음~매우높음) 등급 스케일 가정
    pine: Optional[int] = None
    weed: Optional[int] = None

class HazardScore(BaseModel):
    type: str
    score: float = 0.0  # 0~1
    why: List[str] = []

class Advice(BaseModel):
    category: str
    reason: str

# NEW: 제품/성분 추천 모델
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
```

---

## 🔁 실행 방법

1. **의존성 설치**
   ```bash
   pip install -r requirements.txt
   ```
2. **환경 변수 설정** – `.env.example`을 복사해서 `.env` 작성
3. **서버 실행**
   ```bash
   uvicorn app.main:app --reload
   ```
4. **API 문서 확인** – 브라우저에서 `http://localhost:8000/docs`

---

## 🧪 cURL 예시

```bash
curl -G "http://localhost:8000/api/risk" \
  --data-urlencode "address=서울특별시 중구 세종대로 110" \
  --data-urlencode "date_str=2025-09-08"
```

---

## 📎 참고

* VWorld Geocoder 2.0 — 주소→좌표, 일 4만건
* Open-Meteo KMA API — KMA GDPS/LDPS 기반 일/시간별 예보
* AirKorea OpenAPI — 대기질 예보 통보
* KMA 보건기상지수(꽃가루 위험지수)
* OpenStreetMap Overpass API — landuse/forest/wetland/urban, coastline 근접 추정

---

## ⚠️ 주의

* Overpass 파서는 간단화되어 있습니다. 정확한 면적 비율 산출이 필요하면 멀티폴리곤 조립 및 투영 후 면적 계산으로 개선하세요.
* 본 서비스는 **정보 제공** 용도이며, 개인별 금기/상호작용 가능성이 있으므로 **전문가 상담을 권장**합니다.
