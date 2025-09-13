# K-HealthWeather-MVP

한국 사용자를 위한 날짜·주소 기반 위험/상비의약품 **카테고리 + 성분명 기반 제품 목록** 추천 백엔드 MVP.

## 1) 준비
- Python 3.11+
- `pip install -r requirements.txt`
- `.env` 생성 → VWorld 필수 + (선택) AirKorea/KMA 보건지수 + MFDS 서비스키(인코딩)

## 2) 실행
```bash
uvicorn app.main:app --reload
```
* 브라우저 `http://localhost:8000/docs` → `/api/risk` 호출 (address, date_str)

## 3) 신기능
* 위험 스코어에 따라 **성분(일반명)** 후보를 선택 → **MFDS 허가정보 API**로 해당 성분의 **제품 목록** 조회 후 함께 제공.
* 브랜드 편향 방지: **검색 키는 성분명** (예: 로라타딘, 플루티카손, 아세트아미노펜 등).

## 4) 데이터 출처
* VWorld Geocoder 2.0 — 주소→좌표. 일 4만건.
* Open-Meteo KMA API — KMA GDPS/LDPS 기반 일/시간별 예보.
* AirKorea OpenAPI — 대기질 예보 통보(선택).
* KMA 보건기상지수(꽃가루 위험지수) — 선택.
* OpenStreetMap Overpass API — landuse/forest/wetland/urban, coastline 근접 추정.

## 5) 주의
* Overpass 파서는 간단화 되어 있습니다. 실제 면적 비율 산출이 필요하면 멀티폴리곤 조립 및 투영 후 면적 계산으로 개선하세요.
* 본 서비스는 **진단/치료가 아닌 정보 제공** 용도입니다.
* MFDS OpenAPI 파라미터명(`mainIngr` 등)은 공식 문서 확인 후 `providers/mfds_products.py`의 주석 위치에 실제 키로 교체하세요.
* 개인별 금기/상호작용 가능성 때문에 **전문가 상담을 권장**합니다.
