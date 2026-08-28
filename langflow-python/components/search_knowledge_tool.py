"""Langflow custom component: Search Knowledge."""

from lfx.custom import Component
from lfx.io import IntInput, MessageTextInput, Output, StrInput
from lfx.schema.message import Message

from __future__ import annotations

import base64
import os
import re
from pathlib import Path


def output_root() -> Path:
    return Path(os.getenv("SANDBOX_OUTPUT_ROOT", "/app/output"))


def knowledge_dir() -> Path:
    return Path(os.getenv("SANDBOX_KNOWLEDGE_DIR", "/app/knowledge"))


class SandboxCore:
    def __init__(self, run_id: str) -> None:
        self.run_id = run_id.strip()
        if not self.run_id:
            raise ValueError("run_id is required")
        self.root = (output_root() / self.run_id).resolve()
        self.knowledge = knowledge_dir()
        self.root.mkdir(parents=True, exist_ok=True)
        (self.root / "src").mkdir(exist_ok=True)
        (self.root / "diagrams").mkdir(exist_ok=True)
        (self.root / "assets").mkdir(exist_ok=True)

    def _safe_path(self, relative: str) -> Path:
        relative = relative.lstrip("/").replace("\\", "/")
        if ".." in Path(relative).parts:
            raise ValueError("Path traversal is not allowed")
        path = (self.root / relative).resolve()
        if not str(path).startswith(str(self.root.resolve())):
            raise ValueError("Path escapes sandbox")
        return path

    def write_file(self, path: str, content: str) -> str:
        target = self._safe_path(path)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
        return f"Wrote {path} ({len(content)} chars)"

    def read_file(self, path: str) -> str:
        target = self._safe_path(path)
        if not target.exists():
            return f"ERROR: file not found: {path}"
        return target.read_text(encoding="utf-8")

    def list_files(self, prefix: str = "") -> str:
        base = self._safe_path(prefix) if prefix else self.root
        if not base.exists():
            return "(empty)"
        files = [str(p.relative_to(self.root)) for p in sorted(base.rglob("*")) if p.is_file()]
        return "\n".join(files) if files else "(empty)"

    def search_knowledge(self, query: str, limit: int = 3) -> str:
        tokens = [t for t in re.split(r"\W+", query.lower()) if len(t) > 2]
        scored: list[tuple[int, Path, str]] = []
        for path in self.knowledge.glob("*.md"):
            text = path.read_text(encoding="utf-8")
            lower = text.lower()
            score = sum(lower.count(tok) for tok in tokens) if tokens else 1
            if score > 0:
                scored.append((score, path, text))
        scored.sort(key=lambda x: x[0], reverse=True)
        if not scored:
            return "No knowledge matches."
        chunks = [f"### {path.name} (score={score})\n{text[:2500]}" for score, path, text in scored[:limit]]
        return "\n\n".join(chunks)

    def web_search(self, query: str, limit: int = 5) -> str:
        try:
            try:
                from ddgs import DDGS
            except ImportError:
                from duckduckgo_search import DDGS  # noqa: F401

            with DDGS() as ddgs:
                results = list(ddgs.text(query, max_results=limit))
            if not results:
                return "No web results found."
            chunks = []
            for item in results:
                title = item.get("title", "No title")
                href = item.get("href", "")
                body = (item.get("body") or "")[:500]
                chunks.append(f"- **{title}**\n  {href}\n  {body}")
            return "\n\n".join(chunks)
        except Exception as exc:
            return f"Web search unavailable: {exc}. Use search_knowledge as fallback."

    def write_mermaid(self, path: str, content: str) -> str:
        if not content.strip():
            raise ValueError("Mermaid content cannot be empty")
        rel = path.lstrip("/").replace("\\", "/")
        if not rel.endswith(".mmd"):
            rel = f"{rel}.mmd"
        if not rel.startswith("diagrams/"):
            rel = f"diagrams/{rel.lstrip('/')}"
        cleaned = content.strip()
        if cleaned.startswith("```"):
            cleaned = re.sub(r"^```(?:mermaid)?\s*", "", cleaned)
            cleaned = re.sub(r"\s*```$", "", cleaned)
        return self.write_file(rel, cleaned + "\n")

    def generate_image(self, prompt: str, path: str) -> str:
        api_key = os.environ.get("OPENAI_API_KEY", "").strip()
        if not api_key:
            return "ERROR: OPENAI_API_KEY required for generate_image."
        rel = path.lstrip("/").replace("\\", "/")
        if not rel.startswith("assets/"):
            rel = f"assets/{rel.lstrip('/')}"
        if not rel.lower().endswith(".png"):
            rel = f"{rel}.png"
        try:
            from openai import OpenAI

            client = OpenAI(api_key=api_key)
            response = client.images.generate(model="gpt-image-1", prompt=prompt, size="1024x1024", n=1)
            item = response.data[0]
            if getattr(item, "b64_json", None):
                image_data = base64.b64decode(item.b64_json)
            elif getattr(item, "url", None):
                import urllib.request

                with urllib.request.urlopen(item.url) as resp:
                    image_data = resp.read()
            else:
                return "ERROR generating image: empty response"
            target = self._safe_path(rel)
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(image_data)
            return f"Generated image at {rel}"
        except Exception as exc:
            return f"ERROR generating image: {exc}"


class SearchKnowledgeTool(Component):
    display_name = "Search Knowledge"
    description = "Feature-delivery sandbox tool."
    icon = "book-open"
    name = "SearchKnowledgeTool"

    inputs = [
        StrInput(name="run_id", display_name="Run ID", info="Sandbox run identifier."),
        MessageTextInput(name="query", display_name="Query", tool_mode=True),
        IntInput(name="limit", display_name="Limit", value=3, tool_mode=True),
    ]
    outputs = [
        Output(display_name="Tool", name="component_as_tool", method="to_toolkit"),
        Output(display_name="Result", name="result", method="run"),
    ]

    def run(self) -> Message:
        limit = int(self.limit or 3)
        text = SandboxCore(self.run_id).search_knowledge(self.query, limit=limit)
        return Message(text=text)
