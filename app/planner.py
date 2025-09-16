"""Core planning logic for the travel medicine planner API."""
from __future__ import annotations

from collections import OrderedDict
from datetime import date
from math import ceil
from typing import Dict, Iterable, List, Set

from . import data
from .models import (
    DestinationAlert,
    PackItem,
    PlanRequest,
    PlanResponse,
    RxCounsel,
    SafetyFlag,
    VaccineFlag,
)


def _days_between(start: date, end: date) -> int:
    return (end - start).days + 1


def _normalize_list(items: Iterable[str]) -> List[str]:
    return [item.strip().lower() for item in items if item]


def _contains_match(needles: Iterable[str], haystack: Iterable[str]) -> bool:
    needles_norm = [needle.lower() for needle in needles if needle]
    for entry in haystack:
        lowered = entry.lower()
        for needle in needles_norm:
            if needle and needle in lowered:
                return True
    return False


def _calc_quantity(per_day: float, days: int, min_qty: int, blister: int) -> int:
    qty = ceil(per_day * days * data.SAFETY_MARGIN)
    if min_qty:
        qty = max(qty, min_qty)
    if blister:
        qty = int(ceil(qty / blister) * blister)
    return qty


def _estimate_elevation(place_name: str) -> int:
    lowered = place_name.lower()
    for key, elevation in data.ELEVATION_LOOKUP.items():
        if key in lowered:
            return elevation
    return 0


def _infer_country(place_name: str) -> str:
    parts = [p.strip() for p in place_name.split(",") if p.strip()]
    if not parts:
        return place_name.strip().lower()
    return parts[-1].lower()


class TravelPlanner:
    """Encapsulates the deterministic planning logic."""

    def __init__(self) -> None:
        self._rx_counsel_lookup = data.RX_COUNSEL_LIBRARY

    def generate_plan(self, request: PlanRequest) -> PlanResponse:
        profile = request.profile
        normalized_conditions = _normalize_list(profile.conditions)
        normalized_allergies = _normalize_list(profile.allergies)

        days = _days_between(request.dates.start, request.dates.end)

        pack_items: "OrderedDict[str, PackItem]" = OrderedDict()
        safety_flags: List[SafetyFlag] = []
        rx_counsel: Dict[str, RxCounsel] = {}
        vaccine_flags: Dict[str, VaccineFlag] = {}
        destination_alerts: List[DestinationAlert] = []
        sources: Set[str] = set()
        summary_parts: List[str] = []

        def add_pack_item(code: str, name: str, qty: int, tags: Iterable[str], cautions: Iterable[str]) -> None:
            if code in pack_items:
                existing = pack_items[code]
                existing.qty += qty
                existing.tags = sorted(set(existing.tags).union({t for t in tags if t}))
                existing.cautions = sorted(set(existing.cautions).union({c for c in cautions if c}))
            else:
                pack_items[code] = PackItem(
                    code=code,
                    name=name,
                    qty=qty,
                    tags=[t for t in tags if t],
                    cautions=[c for c in cautions if c],
                )

        def add_rx_counsel(key: str, note_override: str | None = None) -> None:
            if key not in self._rx_counsel_lookup:
                return
            entry = self._rx_counsel_lookup[key]
            rx_counsel[key] = RxCounsel(
                topic=entry["topic"],
                note=note_override or entry["note"],
                source=entry.get("source"),
            )

        # Baseline OTC packlist
        for spec in data.OTC_ITEMS:
            exclude = False
            dynamic_cautions: List[str] = []

            for contraind in spec.contraindications:
                matches = False
                if contraind.pregnancy and profile.pregnancy:
                    matches = True
                if not matches and contraind.conditions and _contains_match(contraind.conditions, normalized_conditions):
                    matches = True
                if not matches and contraind.allergies and _contains_match(contraind.allergies, normalized_allergies):
                    matches = True
                if matches:
                    safety_flags.append(
                        SafetyFlag(
                            item=spec.name,
                            issue=contraind.reason,
                            severity="avoid",
                        )
                    )
                    exclude = True
                    break

            if exclude:
                continue

            for caution in spec.cautions:
                applies = False
                if caution.pregnancy and profile.pregnancy:
                    applies = True
                if not applies and caution.conditions and _contains_match(caution.conditions, normalized_conditions):
                    applies = True
                if not applies and caution.allergies and _contains_match(caution.allergies, normalized_allergies):
                    applies = True
                if applies:
                    dynamic_cautions.append(caution.message)

            qty = _calc_quantity(spec.per_day, days, spec.min_qty, spec.blister)
            add_pack_item(spec.code, spec.name, qty, spec.tags, dynamic_cautions)

        # Activity-based adjustments
        for activity in request.activities:
            activity_key = activity.lower()
            rule = data.ACTIVITY_RULES.get(activity_key)
            if not rule:
                continue
            for item_code in rule.get("additional_items", []):
                if item_code in data.SUPPLEMENTAL_ITEMS:
                    supplemental = data.SUPPLEMENTAL_ITEMS[item_code]
                    add_pack_item(
                        code=item_code,
                        name=supplemental["name"],
                        qty=1,
                        tags=[supplemental.get("tags", "")],
                        cautions=[],
                    )
            for message in rule.get("counsel", []):
                key = f"activity:{activity_key}:{message[:20]}"
                rx_counsel[key] = RxCounsel(topic=f"활동 - {activity.title()}", note=message)
            if rule.get("advice"):
                destination_alerts.append(
                    DestinationAlert(
                        title=f"활동 주의 - {activity.title()}",
                        detail="; ".join(rule["advice"]),
                    )
                )

        # Destination risk aggregation
        max_elevation = 0
        malaria_detected = False

        for stop in request.itinerary:
            max_elevation = max(max_elevation, _estimate_elevation(stop.place))
            country_key = _infer_country(stop.place)
            if not country_key:
                continue
            risk = data.DESTINATION_RISKS.get(country_key)
            if not risk:
                continue

            sources.update(risk.sources)

            if risk.alerts:
                for alert in risk.alerts:
                    destination_alerts.append(
                        DestinationAlert(
                            title=f"{risk.country} 위험 정보",
                            detail=alert,
                            source=risk.sources[0] if risk.sources else None,
                        )
                    )

            if risk.malaria != "none":
                malaria_detected = True
                detail_suffix = " (특정 지역)" if risk.malaria == "limited" else ""
                add_rx_counsel("malaria")
                destination_alerts.append(
                    DestinationAlert(
                        title=f"{risk.country} 말라리아",
                        detail=f"말라리아 위험이 있습니다{detail_suffix}. 모기 회피와 예방약 상담이 필요합니다.",
                        source=risk.sources[0] if risk.sources else None,
                    )
                )
                add_pack_item(
                    code="deet_repellent",
                    name=data.SUPPLEMENTAL_ITEMS["deet_repellent"]["name"],
                    qty=1,
                    tags=["mosquito"],
                    cautions=[],
                )
                add_pack_item(
                    code="bed_net",
                    name=data.SUPPLEMENTAL_ITEMS["bed_net"]["name"],
                    qty=1,
                    tags=["mosquito"],
                    cautions=[],
                )

            if risk.yellow_fever != "none":
                note = f"{self._rx_counsel_lookup['yellow_fever']['note']} {risk.yellow_fever_note}".strip()
                add_rx_counsel("yellow_fever", note_override=note)
                status = "입국요건" if risk.yellow_fever == "required" else "권장"
                vaccine_flags["Yellow fever"] = VaccineFlag(
                    vaccine="Yellow fever",
                    status=status,
                    source=risk.sources[0] if risk.sources else None,
                )
                summary_parts.append(f"황열 백신 {status}")

            for vaccine in risk.vaccines:
                if vaccine.lower() == "yellow fever":
                    continue
                existing = vaccine_flags.get(vaccine)
                if not existing:
                    vaccine_flags[vaccine] = VaccineFlag(
                        vaccine=vaccine,
                        status="확인 필요",
                        source=risk.sources[0] if risk.sources else None,
                    )

            if risk.country not in {"United States"}:
                add_rx_counsel("traveler_diarrhea")

        if malaria_detected:
            summary_parts.append("말라리아 예방 상담 필요")

        if max_elevation >= 2500:
            add_rx_counsel("high_altitude")
            summary_parts.append("고산병 예방 대비")
            destination_alerts.append(
                DestinationAlert(
                    title="고산 위험",
                    detail=f"최대 예상 고도 약 {max_elevation:,}m로 고산병 예방이 필요합니다.",
                    source="elevation://lookup",
                )
            )
            sources.add("elevation://lookup")

        # Safety flags derived from allergies for included items
        for item in pack_items.values():
            if item.code == "cetirizine" and profile.pregnancy:
                msg = "임신 중에는 전문의와 상담 후 복용하세요."
                if msg not in item.cautions:
                    item.cautions.append(msg)

        packlist = sorted(pack_items.values(), key=lambda p: p.name)

        summary = ", ".join(dict.fromkeys(summary_parts)) if summary_parts else "일반 여행 건강 준비 사항을 확인하세요."

        return PlanResponse(
            days=days,
            summary=summary,
            packlist_otc=packlist,
            safety_flags=safety_flags,
            rx_counsel=list(rx_counsel.values()),
            vaccine_flags=list(vaccine_flags.values()),
            destination_alerts=destination_alerts,
            sources=sorted(sources),
        )


__all__ = ["TravelPlanner"]
