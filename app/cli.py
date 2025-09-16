"""Command-line interface for the travel medicine planner prototype."""
from __future__ import annotations

import argparse
import copy
import json
from pathlib import Path
from typing import Any, Sequence

from .models import PlanRequest, PlanResponse
from .planner import TravelPlanner

DEFAULT_SCENARIO: dict[str, Any] = {
    "itinerary": [
        {"place": "Cusco, Peru", "lat": -13.53, "lon": -71.97},
        {"place": "Sacred Valley, Peru"},
    ],
    "dates": {"start": "2025-10-03", "end": "2025-10-12"},
    "activities": ["trekking"],
    "profile": {
        "age_band": "adult",
        "pregnancy": False,
        "conditions": ["hypertension"],
        "allergies": ["aspirin"],
        "current_meds": ["amlodipine 5 mg qd"],
    },
}


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "여행지와 개인 프로필 정보를 JSON으로 입력받아 상비약/처방 상담 리스트를 "
            "생성하는 간단한 CLI 도구입니다. 입력을 제공하지 않으면 내장된 페루 "
            "트레킹 데모 시나리오를 사용합니다."
        ),
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument(
        "-i",
        "--input",
        type=Path,
        help="여행 계획을 JSON으로 정의한 파일 경로",
    )
    parser.add_argument(
        "--demo",
        action="store_true",
        help="내장된 페루 트레킹 데모 시나리오 사용",
    )
    parser.add_argument(
        "-f",
        "--format",
        choices=("text", "json"),
        default="text",
        help="출력 형식",
    )
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        help="결과를 저장할 파일 경로(미지정 시 표준출력)",
    )
    return parser


def _load_payload(args: argparse.Namespace, parser: argparse.ArgumentParser) -> dict[str, Any]:
    if args.input and args.demo:
        parser.error("입력 파일과 --demo 옵션은 동시에 사용할 수 없습니다.")

    if args.input:
        try:
            raw_text = args.input.read_text(encoding="utf-8")
        except OSError as exc:  # pragma: no cover - argparse.error exits
            parser.error(f"입력 파일을 읽을 수 없습니다: {exc}")
        try:
            return json.loads(raw_text)
        except json.JSONDecodeError as exc:  # pragma: no cover - argparse.error exits
            parser.error(f"JSON 형식이 올바르지 않습니다: {exc}")

    return copy.deepcopy(DEFAULT_SCENARIO)


def _format_section(title: str, lines: list[str]) -> list[str]:
    section = [title]
    if lines:
        section.extend(lines)
    else:
        section.append("  - (해당 없음)")
    section.append("")
    return section


def _format_text(response: PlanResponse) -> str:
    lines: list[str] = [
        f"여행일수: {response.days}일",
        f"요약: {response.summary}",
        "",
    ]

    pack_lines = []
    for item in response.packlist_otc:
        tags = f" ({', '.join(item.tags)})" if item.tags else ""
        cautions = f" - 주의: {', '.join(item.cautions)}" if item.cautions else ""
        pack_lines.append(f"  - {item.name} x{item.qty}{tags}{cautions}")
    lines.extend(_format_section("상비약 추천", pack_lines))

    safety_lines = [
        f"  - {flag.item}: {flag.issue}{' [' + flag.severity + ']' if flag.severity != 'info' else ''}"
        for flag in response.safety_flags
    ]
    lines.extend(_format_section("주의/금기 경고", safety_lines))

    counsel_lines = []
    for entry in response.rx_counsel:
        source = f" ({entry.source})" if entry.source else ""
        counsel_lines.append(f"  - {entry.topic}: {entry.note}{source}")
    lines.extend(_format_section("의료 상담 안내", counsel_lines))

    vaccine_lines = []
    for flag in response.vaccine_flags:
        source = f" ({flag.source})" if flag.source else ""
        vaccine_lines.append(f"  - {flag.vaccine}: {flag.status}{source}")
    lines.extend(_format_section("백신 확인 사항", vaccine_lines))

    alert_lines = []
    for alert in response.destination_alerts:
        source = f" ({alert.source})" if alert.source else ""
        alert_lines.append(f"  - {alert.title}: {alert.detail}{source}")
    lines.extend(_format_section("목적지 위험 알림", alert_lines))

    if response.sources:
        lines.append("출처: " + ", ".join(response.sources))
    else:
        lines.append("출처: (내장 데이터)")

    return "\n".join(lines).strip() + "\n"


def main(argv: Sequence[str] | None = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)

    payload = _load_payload(args, parser)

    try:
        request = PlanRequest.from_dict(payload)
    except ValueError as exc:  # pragma: no cover - argparse.error exits
        parser.error(f"입력 데이터가 올바르지 않습니다: {exc}")

    planner = TravelPlanner()
    response = planner.generate_plan(request)

    if args.format == "json":
        output = json.dumps(response.to_dict(), ensure_ascii=False, indent=2) + "\n"
    else:
        output = _format_text(response)

    if args.output:
        output_path: Path = args.output
        try:
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_text(output, encoding="utf-8")
        except OSError as exc:  # pragma: no cover - argparse.error exits
            parser.error(f"출력 파일을 작성할 수 없습니다: {exc}")
    else:
        print(output, end="")

    return 0


__all__ = ["main", "DEFAULT_SCENARIO"]
