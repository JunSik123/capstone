import httpx
from typing import List
from app.config import settings
from app.models import Product

BASE = "http://apis.data.go.kr/1471000/DrugPrdtPrmsnInfoService05"

async def list_products_by_ingredient(ingredient_kor: str, rows: int = 20) -> List[Product]:
    if not settings.MFDS_SERVICE_KEY_URLENC:
        return []
    params = {
        "serviceKey": settings.MFDS_SERVICE_KEY_URLENC,
        "returnType": "json",
        "numOfRows": rows,
        "pageNo": 1,
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
