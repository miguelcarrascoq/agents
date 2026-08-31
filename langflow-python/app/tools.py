"""Sandbox filesystem tools + local knowledge search + external capabilities."""

from __future__ import annotations

import base64
import os
import re
from pathlib import Path

from feature_delivery_api.mermaid import sanitize_mermaid_in_markdown, sanitize_mermaid_source


class Sandbox:
    def __init__(self, root: Path, knowledge_dir: Path) -> None:
        self.root = root
        self.knowledge_dir = knowledge_dir
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
        if "```mermaid" in content:
            content = sanitize_mermaid_in_markdown(content)
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
        files: list[str] = []
        for p in sorted(base.rglob("*")):
            if p.is_file():
                files.append(str(p.relative_to(self.root)))
        return "\n".join(files) if files else "(empty)"

    def search_knowledge(self, query: str, limit: int = 3) -> str:
        tokens = [t for t in re.split(r"\W+", query.lower()) if len(t) > 2]
        scored: list[tuple[int, Path, str]] = []
        for path in self.knowledge_dir.glob("*.md"):
            text = path.read_text(encoding="utf-8")
            lower = text.lower()
            score = sum(lower.count(tok) for tok in tokens) if tokens else 1
            if score > 0:
                scored.append((score, path, text))
        scored.sort(key=lambda x: x[0], reverse=True)
        if not scored:
            return "No knowledge matches."
        chunks: list[str] = []
        for score, path, text in scored[:limit]:
            chunks.append(f"### {path.name} (score={score})\n{text[:2500]}")
        return "\n\n".join(chunks)

    def web_search(self, query: str, limit: int = 5) -> str:
        try:
            try:
                from ddgs import DDGS
            except ImportError:
                from duckduckgo_search import DDGS  # noqa: F401 — legacy fallback

            with DDGS() as ddgs:
                results = list(ddgs.text(query, max_results=limit))
            if not results:
                return "No web results found."
            chunks: list[str] = []
            for item in results:
                title = item.get("title", "No title")
                href = item.get("href", "")
                body = (item.get("body") or "")[:500]
                chunks.append(f"- **{title}**\n  {href}\n  {body}")
            return "\n\n".join(chunks)
        except Exception as exc:
            return (
                f"Web search unavailable: {exc}. "
                "Use search_knowledge as fallback."
            )

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
        cleaned = sanitize_mermaid_source(cleaned)
        return self.write_file(rel, cleaned + "\n")

    def generate_image(self, prompt: str, path: str) -> str:
        api_key = os.environ.get("OPENAI_API_KEY", "").strip()
        if not api_key:
            return (
                "ERROR: OPENAI_API_KEY required for generate_image "
                "(illustrator needs OpenAI even when LLM uses DeepSeek)."
            )
        rel = path.lstrip("/").replace("\\", "/")
        if not rel.startswith("assets/"):
            rel = f"assets/{rel.lstrip('/')}"
        if not rel.lower().endswith(".png"):
            rel = f"{rel}.png"
        try:
            from openai import OpenAI

            client = OpenAI(api_key=api_key)
            response = client.images.generate(
                model="gpt-image-1",
                prompt=prompt,
                size="1024x1024",
                n=1,
            )
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

    def list_written_files(self) -> list[str]:
        files: list[str] = []
        for p in sorted(self.root.rglob("*")):
            if p.is_file() and p.name != "summary.json":
                files.append(str(p.relative_to(self.root)))
        return files
