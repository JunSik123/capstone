# 여행용 상비약·처방약 플래너 설계 청사진

이 문서는 약학대학 캡스톤 디자인 과제를 위해 "여행용 상비약/처방약 플래너" 서비스를 **API·AI·코딩** 중심으로 빠르게 구축할 수 있도록 문제 정의부터 MVP 프로토타입까지 한 번에 정리한 청사진이다.

## 1. 문제 정의와 목표

### 입력 파라미터
- 여행지: 국가/도시 좌표(다중 구간 지원)
- 여행 기간: 시작일과 종료일
- 계절 및 기후
- 활동 유형: 트레킹, 스쿠버, 비즈니스 등 복수 선택
- 개인 프로필: 연령대, 임신/수유 여부, 기저질환, 알레르기, 현재 복용약, 예방접종력

### 출력 산출물
1. **상비약 추천 리스트**: 한국 판매 의약품명을 기본으로 성분명을 병기하며, 여행일수 기반 수량 계산 포함
2. **의료진 상담/처방 필요 항목**: 고산병 예방약, 말라리아 예방약, 여행자 설사 항생제 등
3. **예방접종 및 보건 권고**: 황열, 말라리아, MMR 등 최신 권고 반영
4. **목적지 리스크 카드**: 말라리아·뎅기·기후·대기질·고도 등 위험 요약
5. **포장 체크리스트 및 복용 스케줄러**: PDF 또는 캘린더 파일로 출력

## 2. 근거 데이터와 외부 API

최신 권고와 위험 정보를 자동으로 반영하기 위해 아래 데이터를 정기 수집한다.

| 범주 | 데이터/서비스 | 용도 |
| ---- | -------------- | ---- |
| 여행의학 권고 | CDC Yellow Book, 국가별 페이지 | 황열·말라리아·필수/권장 백신 |
| 여행 보건 공지 | CDC Travel Health Notices (웹/RSS) | 유행성 감염병 및 공지 모니터링 |
| WHO 자료 | 황열 위험국가 리스트, Disease Outbreak News | 입국요건/발병 정보 |
| 기상/기후 | OpenWeatherMap API | 기온·강수 예보 → 대비품 추천 |
| 대기질 | OpenAQ | 미세먼지/오존 지표 |
| 지오코딩 | OSM Nominatim | 여행지 좌표 파악 |
| 고도 | Open-Elevation 또는 Open-Meteo | 고산병 위험 판단 |
| 국내 의약품 | MFDS 의약품 허가정보 OpenAPI | 국내 판매품과 성분 매핑 |
| 약물 표준 | RxNorm | 성분 표준화, 동의어 처리 |
| 약물 라벨 | openFDA Drug Labels | 경고/주의/용법 텍스트 RAG |

> 한국형 DUR 공개 API가 부재하므로, OTC 중심의 안전성 규칙 세트를 직접 구축하고 MFDS 라벨과 학술 근거를 출처로 표기한다.

## 3. 제안 아키텍처

- **프런트엔드**: Next.js(React) + TypeScript, PWA 기능, 다국어(i18n)
- **백엔드 API**: FastAPI(Python) 또는 NestJS(Node.js)
- **데이터베이스**: PostgreSQL + PostGIS, 벡터 검색을 위해 `pgvector` 또는 별도 Weaviate/FAISS
- **AI 계층**
  - 문헌 RAG 파이프라인: CDC/WHO/openFDA 문서 임베딩 및 벡터 인덱싱
  - 룰 엔진: YAML/결정 테이블 정의 후 파이썬 실행기에서 판단
  - LLM 역할 분리: planner(초안 생성) / explainer(근거 문장) / guard(안전 고지)
- **잡 스케줄러**: CDC/WHO/날씨/대기질 동기화(일 1회 + RSS 이벤트)
- **배포**: Docker 기반, 프런트 Vercel·백엔드 Render, GitHub Actions CI/CD
- **개인정보 보호**: 민감 데이터 최소화(연령대·질환 카테고리 수준), 기본적으로 클라이언트 저장, 동의 시에만 서버 보관

## 4. 임상 로직 설계 개요

```
입력 → 위험 판단 → 추천/경고 생성 → 수량 계산 → 출력 정리
```

1. **기본 상비약 세트**: 진통·해열(아세트아미노펜), NSAID(금기 시 제외), 제산제, 로페라미드, ORS, 2세대 항히스타민, 벌레 물림 연고, 소독제, 밴드, 멀미약, 체온계 등. 임신/수유, 소아, 특정 질환(고혈압·녹내장 등) 주의 태그 표기.
2. **행선지 특이 위험**: 말라리아 존재 여부, 황열 백신 요건, 글로벌 뎅기/홍역 공지 등. 말라리아 예방약은 상담 필요 항목으로 분류.
3. **환경 요인**: 고도 2,500m 이상 → 고산병 예방 교육 및 처방상담. 고온·우기·대기오염 나쁨 → 전해질 보충, 모기장, N95 등 추가 권고.
4. **개인 프로필 기반 금기**: 알레르기, 임신/수유, 녹내장, 전립선 비대, 항응고제 복용 등은 경고 태그 및 대체안 제시.
5. **수량 계산 공식**: `예상 1일 최대 복용량 × 여행일수 × 1.3(안전 마진)` 후 제형 단위 반올림. 소아는 체중 기반 용량을 별도 처리.

## 5. AI 설계 세부

- **RAG 소스 구축**: CDC 국가 페이지, Yellow Book, WHO 문서(PDF), openFDA 라벨을 파싱해 `Contraindications`, `Warnings`, `Dosage`, `Travel` 키워드 중심으로 인덱싱.
- **LLM 역할 분리**
  - `planner`: 구조화 입력(JSON) → 추천 카테고리 및 수량 초안 생성
  - `explainer`: 각 추천 항목의 근거 문장을 인용과 함께 생성
  - `guard`: 금지어 및 위험 응답 필터링, "의료 상담을 대체하지 않음" 고지 자동 삽입
- **룰 엔진**이 최종 승인 권한을 가지며, LLM은 설명과 요약을 담당하도록 설계한다.

## 6. 데이터 모델 초안

| 테이블 | 주요 필드 | 설명 |
| ------- | --------- | ---- |
| `destinations` | `id`, `country_code`, `malaria_risk`, `yellow_fever_req`, `seasonality`, `notes_source_url` | 여행지별 보건 위험 메타데이터 |
| `otc_items` | `id`, `ingredient`, `strength`, `form`, `adult_dose_json`, `pediatric_rules_json`, `mfds_code` | 국내 OTC 품목 및 용량 규칙 |
| `rx_flags` | `id`, `scenario`, `counseling_msg`, `source_ref` | 처방 상담 필요 상황 정의 |
| `user_profile` | `id`, `age_band`, `pregnancy`, `conditions[]`, `allergies[]`, `current_meds[]` | 사용자 프로필(익명화) |
| `trip` | `id`, `user_id`, `start`, `end`, `places[]`, `activities[]` | 여행 일정 |
| `recommendations` | `trip_id`, `item_id`, `qty`, `reason`, `tags[]` | 최종 추천 항목 및 근거 |

## 7. 백엔드 API 예시

`POST /plan`

요청 예시
```json
{
  "itinerary": [{"place":"Cusco, Peru","lat":-13.53,"lon":-71.97}],
  "dates": {"start":"2025-10-03","end":"2025-10-12"},
  "activities": ["trekking"],
  "profile": {
    "age_band": "adult",
    "pregnancy": false,
    "conditions": ["hypertension"],
    "allergies": ["aspirin"],
    "current_meds": ["amlodipine 5 mg qd"]
  }
}
```

응답 개요
```json
{
  "summary": "고산·뎅기 위험. 처방상담: acetazolamide, traveler's diarrhea 항생제.",
  "packlist_otc": [
    {"name":"Acetaminophen 500 mg","qty":20,"tags":["fever","pain"]},
    {"name":"Loperamide 2 mg","qty":12,"tags":["diarrhea"],"cautions":["not for dysentery"]},
    {"name":"Oral Rehydration Salts","qty":6,"tags":["rehydration"]},
    {"name":"Cetirizine 10 mg","qty":10,"tags":["allergy"]},
    {"name":"DEET repellent","qty":1,"tags":["mosquito"]}
  ],
  "rx_counsel": [
    {"topic":"High altitude","note":"고도 2,500m 이상. acetazolamide 예방 고려.","source":"CDC/Yellow Book"},
    {"topic":"Traveler's diarrhea","note":"증상 심하면 azithromycin 1g 1회 등 의사 상담.","source":"CDC"}
  ],
  "vaccine_flags": [
    {"vaccine":"MMR","status":"확인 필요"},
    {"vaccine":"Yellow fever","status":"해당없음(페루 일부만 권고)","source":"CDC/WHO"}
  ],
  "sources": ["cdc://peru","who://yellowfever-list","openaq://latlon"]
}
```

## 8. 임상 룰 YAML 스니펫

```yaml
- id: high_altitude_rule
  if: "max_elevation_m >= 2500"
  then:
    - add_counsel: "고산병 예방 교육 및 처방상담"
    - add_rx_flag: "Acetazolamide prophylaxis"
    - add_otc: [{"ingredient":"ORS","qty_formula":"days*0.6"}]

- id: malaria_rule
  if: "destination.malaria_risk == 'present'"
  then:
    - add_rx_flag: "Malaria chemoprophylaxis options"
    - add_pack_advice: "permethrin-treated clothing, bed net"
```

## 9. 안전·규제·품질 고려사항

- **의료 면책 고지**: 모든 UI와 PDF에 "의사의 진단을 대체하지 않음" 명시
- **출처 투명성**: 각 추천 항목에 근거 문장과 링크 제공 (LLM explainer가 생성, 룰 엔진 검증)
- **품질 평가 지표**
  1. 공식 권고와의 정합률
  2. 안전 태그(알레르기/금기) 정확도
  3. 사용자 및 전문가(약사) 블라인드 리뷰 점수
- **데이터 최신화**: CDC 국가 페이지, WHO DONs/황열 리스트를 정기 동기화(스케줄러 기반)

## 10. 개발 로드맵

1. **MVP**
   - 기본 상비약 추천과 여행지 리스크 카드 생성
   - 처방 상담 플래그 노출
   - PDF 체크리스트/캘린더 내보내기
2. **확장 단계**
   - 국내 브랜드/성분 양방향 검색
   - 다국어 지원
   - 복용 알림 및 약국 위치 정보 연동
   - 국가별 통관 유의품(향정·에페드린계 등) 데이터 구축

## 11. 빠른 FastAPI 프로토타입 코드

```python
from fastapi import FastAPI
from pydantic import BaseModel
from datetime import date
from math import ceil

app = FastAPI()

class Place(BaseModel):
    place: str
    lat: float
    lon: float

class Dates(BaseModel):
    start: date
    end: date

class Profile(BaseModel):
    age_band: str
    pregnancy: bool
    conditions: list[str]
    allergies: list[str]
    current_meds: list[str]

class PlanReq(BaseModel):
    itinerary: list[Place]
    dates: Dates
    activities: list[str]
    profile: Profile

@app.post("/plan")
def plan(req: PlanReq):
    days = (req.dates.end - req.dates.start).days + 1
    packlist = [
        {"name": "Acetaminophen 500 mg", "qty": ceil(days * 1.5), "tags": ["fever", "pain"]},
        {"name": "Loperamide 2 mg", "qty": ceil(days * 1.2), "tags": ["diarrhea"]},
        {"name": "ORS", "qty": max(3, ceil(days * 0.6)), "tags": ["rehydration"]},
        {"name": "Cetirizine 10 mg", "qty": days, "tags": ["allergy"]},
    ]
    flags = []
    if "aspirin" in (a.lower() for a in req.profile.allergies):
        flags.append({"item": "Bismuth subsalicylate", "avoid": "살리실레이트 알레르기"})
    counsel = []
    return {"days": days, "packlist_otc": packlist, "safety_flags": flags, "rx_counsel": counsel}
```

---

필요 시 이 청사진을 기반으로 GitHub 템플릿(프런트엔드, 백엔드, 룰셋, 스크래퍼 포함)을 확장하거나, 특정 여행 시나리오에 대한 데모 응답을 생성하는 작업으로 이어갈 수 있다.
