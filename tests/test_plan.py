import json
import subprocess
import sys
import unittest

from app.models import PlanRequest
from app.planner import TravelPlanner


class TravelPlannerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.planner = TravelPlanner()

    def test_plan_generates_expected_sections(self) -> None:
        payload = {
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

        request = PlanRequest.from_dict(payload)
        response = self.planner.generate_plan(request)
        body = response.to_dict()

        self.assertEqual(body["days"], 10)
        self.assertIn("고산병", body["summary"])

        pack_codes = {item["code"] for item in body["packlist_otc"]}
        self.assertIn("acetaminophen", pack_codes)
        self.assertNotIn("ibuprofen", pack_codes, "ibuprofen should be excluded due to aspirin allergy")

        safety_items = {flag["item"] for flag in body["safety_flags"]}
        self.assertIn("Ibuprofen 200 mg", safety_items)

        topics = {entry["topic"] for entry in body["rx_counsel"]}
        self.assertIn("High altitude illness prevention", topics)
        self.assertIn("Malaria prophylaxis", topics)

        vaccines = {flag["vaccine"]: flag["status"] for flag in body["vaccine_flags"]}
        self.assertIn(vaccines.get("Yellow fever"), {"권장", "입국요건"})

        alerts = {alert["title"] for alert in body["destination_alerts"]}
        self.assertIn("고산 위험", alerts)
        self.assertTrue(any(title.endswith("말라리아") for title in alerts))

    def test_cli_demo_outputs_json(self) -> None:
        result = subprocess.run(
            [sys.executable, "-m", "app", "--demo", "--format", "json"],
            capture_output=True,
            text=True,
            check=True,
        )

        payload = json.loads(result.stdout)
        self.assertEqual(payload["days"], 10)
        self.assertIn("packlist_otc", payload)
        self.assertGreater(len(payload["packlist_otc"]), 0)


if __name__ == "__main__":
    unittest.main()
