# 여행용 상비약·처방약 플래너 캡스톤 청사진

이 저장소는 약학대학 캡스톤 디자인 프로젝트 "여행용 상비약/처방약 플래너"를 빠르게 설계하고 구현해 볼 수 있도록 정리한 자료 모음입니다. 표준 라이브러리만으로 구동되는 간단한 백엔드 프로토타입과 임상 룰 샘플이 포함되어 있어 추가 패키지 없이 바로 실행해 볼 수 있습니다.

## 구성
- [`docs/travel-medicine-planner.md`](docs/travel-medicine-planner.md): 문제 정의부터 데이터 소스, 아키텍처, 임상 룰, AI 설계, API 예시, 규제 및 품질 고려사항, FastAPI 기반 MVP 예제까지 한 번에 정리한 청사진입니다.

## 빠른 시작

```bash
python -m app.main
```

서버가 실행되면 `http://127.0.0.1:8000/plan` 으로 POST 요청을 보내 여행 계획을 생성할 수 있습니다. `/healthz` 는 상태 확인 엔드포인트입니다.

## API 사용 예시

```bash
curl -X POST http://127.0.0.1:8000/plan \
  -H "Content-Type: application/json" \
  -d '{
        "itinerary": [{"place": "Cusco, Peru"}],
        "dates": {"start": "2025-10-03", "end": "2025-10-12"},
        "activities": ["trekking"],
        "profile": {
          "age_band": "adult",
          "pregnancy": false,
          "conditions": ["hypertension"],
          "allergies": ["aspirin"],
          "current_meds": ["amlodipine 5 mg qd"]
        }
      }'
```

응답에는 추천 상비약 목록, 처방 상담이 필요한 주제, 예방접종 플래그, 목적지 위험 카드가 구조화되어 포함됩니다.

## 자동 테스트

프로토타입 로직은 표준 `unittest` 기반 단위 테스트로 검증할 수 있습니다.

```bash
python -m unittest
```

## 다음 단계 아이디어
1. 청사진을 기반으로 프런트엔드/백엔드 템플릿 리포지토리를 파생 생성합니다.
2. CDC, WHO, MFDS 등 외부 데이터 동기화 스크립트를 작성해 정기 업데이트 파이프라인을 구축합니다.
3. 임상 룰(YAML)과 RAG 인덱싱 파이프라인을 구현하고, 안전성 검증을 위한 테스트 케이스를 추가합니다.

필요 시 특정 여행 시나리오 입력에 대한 데모 응답 생성이나 GitHub Actions 워크플로 설정 등으로 확장할 수 있습니다.
