"""Langflow REST API client."""

from __future__ import annotations

import json
import os
from typing import Any

import requests


class LangflowClient:
    def __init__(
        self,
        base_url: str | None = None,
        api_key: str | None = None,
        timeout: int = 300,
    ) -> None:
        self.base_url = (base_url or os.getenv("LANGFLOW_URL") or "http://localhost:7860").rstrip("/")
        self.api_key = (api_key or os.getenv("LANGFLOW_API_KEY") or "").strip()
        self.timeout = timeout

    def health_check(self) -> bool:
        try:
            resp = requests.get(f"{self.base_url}/health", timeout=5)
            return resp.status_code == 200
        except requests.RequestException:
            return False

    def require_ready(self) -> None:
        if not self.api_key:
            raise ValueError(
                "LANGFLOW_API_KEY is required. Generate one in Langflow UI → Settings → API Keys "
                "and add it to .env"
            )
        if not self.health_check():
            raise ValueError(
                f"Langflow server not reachable at {self.base_url}. "
                "Start it with: ./run.sh server"
            )

    def run_flow(
        self,
        flow_id: str,
        input_value: str,
        *,
        tweaks: dict[str, Any] | None = None,
        session_id: str | None = None,
    ) -> str:
        """Run a flow and return the assistant text response."""
        self.require_ready()
        url = f"{self.base_url}/api/v1/run/{flow_id}"
        headers = {
            "Content-Type": "application/json",
            "x-api-key": self.api_key,
        }
        payload: dict[str, Any] = {
            "input_value": input_value,
            "output_type": "chat",
            "input_type": "chat",
        }
        if tweaks:
            payload["tweaks"] = tweaks
        if session_id:
            payload["session_id"] = session_id

        resp = requests.post(url, headers=headers, json=payload, timeout=self.timeout)
        if resp.status_code >= 400:
            raise RuntimeError(
                f"Langflow API error {resp.status_code} for flow {flow_id}: {resp.text[:500]}"
            )
        return extract_response_text(resp.json())

    def _headers(self) -> dict[str, str]:
        return {
            "accept": "application/json",
            "Content-Type": "application/json",
            "x-api-key": self.api_key,
        }

    def list_flows(self) -> list[dict[str, Any]]:
        self.require_ready()
        resp = requests.get(
            f"{self.base_url}/api/v1/flows/",
            headers=self._headers(),
            timeout=self.timeout,
        )
        self._raise_with_body(resp, "list flows")
        data = resp.json()
        return data if isinstance(data, list) else []

    def _flow_payload(self, flow_data: dict[str, Any]) -> dict[str, Any]:
        return {
            "name": flow_data["name"],
            "description": flow_data.get("description", ""),
            "data": flow_data["data"],
        }

    def upload_flow(self, flow_data: dict[str, Any], *, replace: bool = True) -> str:
        """Create or update a flow from template JSON and return its id."""
        self.require_ready()
        payload = self._flow_payload(flow_data)
        name = payload["name"]

        existing_id: str | None = None
        if replace:
            for flow in self.list_flows():
                if flow.get("name") == name:
                    existing_id = str(flow["id"])
                    break

        if existing_id:
            resp = requests.patch(
                f"{self.base_url}/api/v1/flows/{existing_id}",
                headers=self._headers(),
                json=payload,
                timeout=self.timeout,
            )
            self._raise_with_body(resp, f"update flow {name!r}")
            data = resp.json()
            return str(data.get("id") or existing_id)

        resp = requests.post(
            f"{self.base_url}/api/v1/flows/",
            headers=self._headers(),
            json=payload,
            timeout=self.timeout,
        )
        self._raise_with_body(resp, f"create flow {name!r}")
        data = resp.json()
        if isinstance(data, dict) and data.get("id"):
            return str(data["id"])
        raise RuntimeError(f"Unexpected create response: {json.dumps(data)[:300]}")

    @staticmethod
    def _raise_with_body(resp: requests.Response, action: str) -> None:
        if resp.status_code < 400:
            return
        body = resp.text[:800]
        raise RuntimeError(
            f"Langflow failed to {action} ({resp.status_code}): {body}"
        )


def extract_response_text(data: Any) -> str:
    """Best-effort extraction of assistant text from Langflow run response."""
    if isinstance(data, str):
        return data
    if isinstance(data, dict):
        for key in ("message", "text", "output", "result"):
            val = data.get(key)
            if isinstance(val, str) and val.strip():
                return val
        outputs = data.get("outputs")
        if isinstance(outputs, list):
            texts: list[str] = []
            for item in outputs:
                texts.append(extract_response_text(item))
            joined = "\n".join(t for t in texts if t.strip())
            if joined.strip():
                return joined
        inner = data.get("outputs") or data.get("data") or data.get("results")
        if inner is not None:
            return extract_response_text(inner)
        artifacts = data.get("artifacts")
        if isinstance(artifacts, dict):
            message = artifacts.get("message")
            if isinstance(message, str):
                return message
    if isinstance(data, list):
        texts = [extract_response_text(item) for item in data]
        joined = "\n".join(t for t in texts if t.strip())
        return joined
    return str(data)
