"""Lightweight data models for the travel medicine planner."""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import List


@dataclass
class Place:
    place: str
    lat: float | None = None
    lon: float | None = None

    @classmethod
    def from_dict(cls, data: dict) -> "Place":
        if "place" not in data:
            raise ValueError("each itinerary entry requires a 'place' field")
        place = str(data["place"]).strip()
        if not place:
            raise ValueError("place must be a non-empty string")
        lat = data.get("lat")
        lon = data.get("lon")
        return cls(place=place, lat=lat, lon=lon)


@dataclass
class Dates:
    start: date
    end: date

    @classmethod
    def from_dict(cls, data: dict) -> "Dates":
        try:
            start = date.fromisoformat(data["start"])
            end = date.fromisoformat(data["end"])
        except KeyError as exc:  # noqa: PERF203
            raise ValueError("dates.start and dates.end are required") from exc
        except Exception as exc:  # noqa: BLE001
            raise ValueError("dates must be ISO formatted (YYYY-MM-DD)") from exc

        if end < start:
            raise ValueError("end date must be on or after the start date")
        return cls(start=start, end=end)


@dataclass
class Profile:
    age_band: str
    pregnancy: bool = False
    conditions: List[str] = field(default_factory=list)
    allergies: List[str] = field(default_factory=list)
    current_meds: List[str] = field(default_factory=list)

    @classmethod
    def from_dict(cls, data: dict) -> "Profile":
        try:
            age_band = str(data["age_band"]).strip()
        except KeyError as exc:  # noqa: PERF203
            raise ValueError("profile.age_band is required") from exc
        pregnancy = bool(data.get("pregnancy", False))
        conditions = [str(value).strip() for value in data.get("conditions", [])]
        allergies = [str(value).strip() for value in data.get("allergies", [])]
        current_meds = [str(value).strip() for value in data.get("current_meds", [])]
        return cls(
            age_band=age_band,
            pregnancy=pregnancy,
            conditions=conditions,
            allergies=allergies,
            current_meds=current_meds,
        )


@dataclass
class PlanRequest:
    itinerary: List[Place]
    dates: Dates
    activities: List[str]
    profile: Profile

    @classmethod
    def from_dict(cls, data: dict) -> "PlanRequest":
        itinerary_raw = data.get("itinerary")
        if not isinstance(itinerary_raw, list) or not itinerary_raw:
            raise ValueError("request.itinerary must be a non-empty list")
        itinerary = [Place.from_dict(item) for item in itinerary_raw]
        dates = Dates.from_dict(data.get("dates", {}))
        activities = [str(value).strip() for value in data.get("activities", [])]
        profile = Profile.from_dict(data.get("profile", {}))
        return cls(itinerary=itinerary, dates=dates, activities=activities, profile=profile)


@dataclass
class PackItem:
    code: str
    name: str
    qty: int
    tags: List[str] = field(default_factory=list)
    cautions: List[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "code": self.code,
            "name": self.name,
            "qty": self.qty,
            "tags": list(self.tags),
            "cautions": list(self.cautions),
        }


@dataclass
class SafetyFlag:
    item: str
    issue: str
    severity: str = "info"

    def to_dict(self) -> dict:
        return {
            "item": self.item,
            "issue": self.issue,
            "severity": self.severity,
        }


@dataclass
class RxCounsel:
    topic: str
    note: str
    source: str | None = None

    def to_dict(self) -> dict:
        return {
            "topic": self.topic,
            "note": self.note,
            "source": self.source,
        }


@dataclass
class VaccineFlag:
    vaccine: str
    status: str
    source: str | None = None

    def to_dict(self) -> dict:
        return {
            "vaccine": self.vaccine,
            "status": self.status,
            "source": self.source,
        }


@dataclass
class DestinationAlert:
    title: str
    detail: str
    source: str | None = None

    def to_dict(self) -> dict:
        return {
            "title": self.title,
            "detail": self.detail,
            "source": self.source,
        }


@dataclass
class PlanResponse:
    days: int
    summary: str
    packlist_otc: List[PackItem]
    safety_flags: List[SafetyFlag]
    rx_counsel: List[RxCounsel]
    vaccine_flags: List[VaccineFlag]
    destination_alerts: List[DestinationAlert]
    sources: List[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "days": self.days,
            "summary": self.summary,
            "packlist_otc": [item.to_dict() for item in self.packlist_otc],
            "safety_flags": [flag.to_dict() for flag in self.safety_flags],
            "rx_counsel": [entry.to_dict() for entry in self.rx_counsel],
            "vaccine_flags": [flag.to_dict() for flag in self.vaccine_flags],
            "destination_alerts": [alert.to_dict() for alert in self.destination_alerts],
            "sources": list(self.sources),
        }


def serialize_plan_response(response: PlanResponse) -> dict:
    """Helper used by HTTP handlers to serialise plan responses."""

    return response.to_dict()


__all__ = [
    "Place",
    "Dates",
    "Profile",
    "PlanRequest",
    "PackItem",
    "SafetyFlag",
    "RxCounsel",
    "VaccineFlag",
    "DestinationAlert",
    "PlanResponse",
    "serialize_plan_response",
]
