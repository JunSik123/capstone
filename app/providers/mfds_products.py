import httpx
from typing import List
from app.config import settings
from app.models import Product

# 참고: 식약처 공지에 따라 05 버전 서비스 사용
BASE = "http://apis.data.go.kr/1471000/DrugPrdtPrmsnInfoService05"

async def list_products_by_ingredient(ingredient_kor: str, rows: int = 20) -> List[Product]:
    """주어진 성분명(한글)과 일치하는 의약품 제품 목록을 반환합니다.

    MFDS OpenAPI의 "주성분" 파라미터 이름은 `mainIngr` 등이 될 수 있으므로,
    실제 공개 문서에서 확인 후 아래 키를 필요에 맞게 변경하세요.
    """
    if not settings.MFDS_SERVICE_KEY_URLENC:
        return []
    params = {
        "serviceKey": settings.MFDS_SERVICE_KEY_URLENC,
        "returnType": "json",
        "numOfRows": rows,
        "pageNo": 1,
        # TODO: API 문서에 따라 실제 파라미터 이름을 확인하세요.
        "mainIngr": ingredient_kor,
    }
    url = f"{BASE}/getDrugPrdtPrmsnInq05"
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.get(url, params=params)
            js = r.json()
        items = js.get("response", {}).get("body", {}).get("items", [])
        out: List[Product] = []
        for it in items:
            out.append(Product(
                item_name=it.get("ITEM_NAME") or it.get("item_name") or "",
                entp_name=it.get("ENTP_NAME") or it.get("entp_name"),
                dosage_form=it.get("FORM_CODE_NAME") or it.get("DOSAGE_FORM"),
                strength=it.get("ETC_OTC_CODE") or it.get("STRENGTH"),
                permit_date=it.get("PRMSN_YMD") or it.get("PERMIT_DATE"),
            ))
        return out
    except Exception:
        return []
