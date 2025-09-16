"""Static reference data used by the travel planner."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Literal, Optional


SAFETY_MARGIN = 1.3


@dataclass(frozen=True)
class Contraindication:
    """Represents a hard exclusion for an OTC item."""

    reason: str
    pregnancy: bool = False
    conditions: tuple[str, ...] = ()
    allergies: tuple[str, ...] = ()


@dataclass(frozen=True)
class Caution:
    """Soft warning for an OTC item given a traveller profile attribute."""

    message: str
    conditions: tuple[str, ...] = ()
    allergies: tuple[str, ...] = ()
    pregnancy: bool = False


@dataclass(frozen=True)
class OTCItemSpec:
    """Definition of a baseline OTC item in the travel kit."""

    code: str
    name: str
    per_day: float
    min_qty: int = 0
    blister: int = 2
    tags: tuple[str, ...] = ()
    cautions: tuple[Caution, ...] = field(default_factory=tuple)
    contraindications: tuple[Contraindication, ...] = field(default_factory=tuple)


OTC_ITEMS: tuple[OTCItemSpec, ...] = (
    OTCItemSpec(
        code="acetaminophen",
        name="Acetaminophen 500 mg",
        per_day=1.5,
        min_qty=8,
        blister=10,
        tags=("fever", "pain"),
    ),
    OTCItemSpec(
        code="ibuprofen",
        name="Ibuprofen 200 mg",
        per_day=1.2,
        min_qty=6,
        blister=10,
        tags=("pain", "inflammation"),
        cautions=(
            Caution(
                message="NSAIDs는 고혈압, 신장질환 또는 위장궤양 병력에서 주의가 필요합니다.",
                conditions=("hypertension", "kidney", "ulcer"),
            ),
            Caution(
                message="임신 3분기 이후에는 NSAID 사용을 피하세요.",
                pregnancy=True,
            ),
        ),
        contraindications=(
            Contraindication(
                reason="아스피린 또는 NSAID 과민반응 병력이 있는 경우 대체 진통제를 사용하세요.",
                allergies=("aspirin", "ibuprofen", "nsaid"),
            ),
        ),
    ),
    OTCItemSpec(
        code="loperamide",
        name="Loperamide 2 mg",
        per_day=1.0,
        min_qty=6,
        blister=6,
        tags=("diarrhea",),
        cautions=(
            Caution(
                message="혈변이나 고열이 동반되면 복용하지 말고 의료기관을 방문하세요.",
            ),
        ),
    ),
    OTCItemSpec(
        code="ors",
        name="Oral Rehydration Salts",
        per_day=0.6,
        min_qty=3,
        blister=1,
        tags=("rehydration",),
    ),
    OTCItemSpec(
        code="cetirizine",
        name="Cetirizine 10 mg",
        per_day=1.0,
        min_qty=7,
        blister=10,
        tags=("allergy", "itching"),
        cautions=(
            Caution(
                message="졸림을 유발할 수 있으므로 운전/기계 조작 전 복용을 피하세요.",
            ),
        ),
    ),
    OTCItemSpec(
        code="motion_sickness",
        name="Dimenhydrinate 50 mg",
        per_day=0.5,
        min_qty=4,
        blister=8,
        tags=("motion sickness",),
        cautions=(
            Caution(
                message="1세대 항히스타민으로 졸음과 구강건조가 나타날 수 있습니다.",
            ),
        ),
        contraindications=(
            Contraindication(
                reason="녹내장 또는 전립선비대증 환자는 의사와 상담 후 사용하세요.",
                conditions=("glaucoma", "bph"),
            ),
        ),
    ),
)


ELEVATION_LOOKUP: Dict[str, int] = {
    "cusco": 3399,
    "la paz": 3640,
    "lhasa": 3650,
    "kathmandu": 1400,
    "denver": 1609,
    "quito": 2850,
}


DestinationRiskLevel = Literal["none", "limited", "present"]


@dataclass(frozen=True)
class DestinationRisk:
    country: str
    malaria: DestinationRiskLevel
    yellow_fever: Literal["none", "recommended", "required"]
    yellow_fever_note: str
    vaccines: tuple[str, ...] = ()
    alerts: tuple[str, ...] = ()
    sources: tuple[str, ...] = ()


DESTINATION_RISKS: Dict[str, DestinationRisk] = {
    "peru": DestinationRisk(
        country="Peru",
        malaria="limited",
        yellow_fever="recommended",
        yellow_fever_note="아마존 저지대 방문 시 황열 예방접종 권장",
        vaccines=("MMR", "Hepatitis A"),
        alerts=("뎅기 바이러스가 지속적으로 보고되고 있어 모기 회피 전략이 필요합니다." ,),
        sources=(
            "cdc://peru",
            "who://yellowfever-list",
        ),
    ),
    "mexico": DestinationRisk(
        country="Mexico",
        malaria="limited",
        yellow_fever="none",
        yellow_fever_note="황열 예방접종 요구 사항 없음",
        vaccines=("Hepatitis A", "Typhoid"),
        alerts=("뎅기 및 장티푸스 예방을 위해 식·음료 위생 수칙을 준수하세요.",),
        sources=("cdc://mexico",),
    ),
    "kenya": DestinationRisk(
        country="Kenya",
        malaria="present",
        yellow_fever="required",
        yellow_fever_note="황열 예방접종 증명서 요구 (일부 예외 있음)",
        vaccines=("Yellow fever", "Typhoid", "Hepatitis A"),
        alerts=("뎅기, 말라리아 모기 노출이 높으므로 방충 대책이 필수입니다.",),
        sources=("cdc://kenya", "who://yellowfever-list"),
    ),
    "thailand": DestinationRisk(
        country="Thailand",
        malaria="limited",
        yellow_fever="none",
        yellow_fever_note="황열 예방접종 요구 사항 없음",
        vaccines=("Hepatitis A", "Typhoid"),
        alerts=("우기에는 모기에 의한 질병 위험이 증가합니다.",),
        sources=("cdc://thailand",),
    ),
    "united states": DestinationRisk(
        country="United States",
        malaria="none",
        yellow_fever="none",
        yellow_fever_note="황열 예방접종 요구 사항 없음",
        vaccines=("Routine vaccines up to date",),
        alerts=("지역 독감 시즌 여부를 확인하고 예방접종을 고려하세요.",),
        sources=("cdc://united-states",),
    ),
}


ACTIVITY_RULES: Dict[str, Dict[str, List[str]]] = {
    "trekking": {
        "additional_items": [
            "blister_plasters",
            "electrolyte_packets",
        ],
        "counsel": [
            "장시간 고도 상승 시 점진적 상승과 수분 섭취가 필요합니다.",
        ],
        "advice": [
            "튼튼한 등산화와 햇빛 차단 대책을 준비하세요.",
        ],
    },
    "scuba": {
        "counsel": [
            "감기약(특히 충혈제거제) 복용 후 다이빙은 전문의 상담이 필요합니다.",
        ],
        "advice": [
            "다이빙 자격증, 로그북, 보험 가입 상태를 확인하세요.",
        ],
    },
    "business": {
        "advice": [
            "장시간 비행 대비 압박양말과 수분 섭취를 권장합니다.",
        ],
    },
}


SUPPLEMENTAL_ITEMS: Dict[str, Dict[str, str]] = {
    "blister_plasters": {
        "name": "Hydrocolloid blister plasters",
        "tags": "foot care",
    },
    "electrolyte_packets": {
        "name": "Additional electrolyte packets",
        "tags": "hydration",
    },
    "bed_net": {
        "name": "Permethrin-treated bed net",
        "tags": "mosquito",
    },
    "deet_repellent": {
        "name": "DEET-based insect repellent",
        "tags": "mosquito",
    },
}


RX_COUNSEL_LIBRARY: Dict[str, Dict[str, str]] = {
    "malaria": {
        "topic": "Malaria prophylaxis",
        "note": "말라리아 위험지역입니다. 아토바쿠온/프로구아닐, 독시사이클린 등 예방약 처방 상담이 필요합니다.",
        "source": "CDC Yellow Book",
    },
    "yellow_fever": {
        "topic": "Yellow fever vaccine",
        "note": "황열 위험 또는 입국요건이 있으므로 예방접종 이력을 확인하고 필요 시 예방접종을 받으세요.",
        "source": "WHO / CDC",
    },
    "high_altitude": {
        "topic": "High altitude illness prevention",
        "note": "해발 2,500m 이상 여행이 포함되어 고산병 예방교육 및 아세타졸아미드 처방 상담이 권장됩니다.",
        "source": "CDC Yellow Book",
    },
    "traveler_diarrhea": {
        "topic": "Traveler's diarrhea",
        "note": "중증 설사 시 아지스로마이신 등 항생제 처방을 위해 의료진 상담이 필요합니다.",
        "source": "CDC Yellow Book",
    },
}


__all__ = [
    "SAFETY_MARGIN",
    "OTC_ITEMS",
    "ELEVATION_LOOKUP",
    "DESTINATION_RISKS",
    "ACTIVITY_RULES",
    "SUPPLEMENTAL_ITEMS",
    "RX_COUNSEL_LIBRARY",
    "Contraindication",
    "Caution",
    "OTCItemSpec",
    "DestinationRisk",
]
