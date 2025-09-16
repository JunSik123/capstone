"""Minimal HTTP server exposing the travel planner as a REST-style API."""
from __future__ import annotations

import json
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import Tuple

from .models import PlanRequest, serialize_plan_response
from .planner import TravelPlanner

planner = TravelPlanner()


class PlannerRequestHandler(BaseHTTPRequestHandler):
    """Handles incoming HTTP requests for the travel planner."""

    server_version = "TravelPlanner/0.1"

    def _write_json(self, payload: dict, status: HTTPStatus = HTTPStatus.OK) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status.value)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802 (BaseHTTPRequestHandler signature)
        if self.path in {"/", "/healthz"}:
            self._write_json({"status": "ok"})
            return
        self.send_error(HTTPStatus.NOT_FOUND, "Endpoint not found")

    def do_POST(self) -> None:  # noqa: N802
        if self.path != "/plan":
            self.send_error(HTTPStatus.NOT_FOUND, "Endpoint not found")
            return

        content_length = int(self.headers.get("Content-Length", "0"))
        raw_body = self.rfile.read(content_length)

        try:
            payload = json.loads(raw_body.decode("utf-8")) if raw_body else {}
        except json.JSONDecodeError:
            self.send_error(HTTPStatus.BAD_REQUEST, "Request body must be valid JSON")
            return

        try:
            request = PlanRequest.from_dict(payload)
        except ValueError as exc:
            self.send_error(HTTPStatus.BAD_REQUEST, str(exc))
            return

        response = planner.generate_plan(request)
        self._write_json(serialize_plan_response(response))

    def log_message(self, format: str, *args: Tuple[object, ...]) -> None:  # noqa: A003
        """Silence default logging; users can instrument as needed."""
        return


def create_server(host: str = "127.0.0.1", port: int = 8000) -> HTTPServer:
    """Build an HTTP server instance for the planner."""

    return HTTPServer((host, port), PlannerRequestHandler)


def run(host: str = "127.0.0.1", port: int = 8000) -> None:
    """Entrypoint for running the development server."""

    server = create_server(host, port)
    print(f"Serving travel planner on http://{host}:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server")
    finally:
        server.server_close()


__all__ = ["create_server", "run", "planner", "PlannerRequestHandler"]
