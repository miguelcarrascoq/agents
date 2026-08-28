#!/usr/bin/env python3
"""Generate self-contained Langflow component files (one Component per file)."""

from __future__ import annotations

from pathlib import Path

SANDBOX_CORE = Path(__file__).resolve().parent.parent / "components" / "_sandbox.py"

COMPONENTS = [
    ("search_knowledge_tool.py", "SearchKnowledgeTool", "Search Knowledge", "book-open",
     'MessageTextInput(name="query", display_name="Query", tool_mode=True),\n        IntInput(name="limit", display_name="Limit", value=3, tool_mode=True),',
     "limit = int(self.limit or 3)\n        text = SandboxCore(self.run_id).search_knowledge(self.query, limit=limit)"),
    ("web_search_tool.py", "WebSearchTool", "Web Search", "globe",
     'MessageTextInput(name="query", display_name="Query", tool_mode=True),\n        IntInput(name="limit", display_name="Limit", value=5, tool_mode=True),',
     "limit = int(self.limit or 5)\n        text = SandboxCore(self.run_id).web_search(self.query, limit=limit)"),
    ("write_file_tool.py", "WriteFileTool", "Write File", "file-pen",
     'StrInput(name="path", display_name="Path", tool_mode=True),\n        MessageTextInput(name="content", display_name="Content", tool_mode=True),',
     "text = SandboxCore(self.run_id).write_file(self.path, self.content)"),
    ("read_file_tool.py", "ReadFileTool", "Read File", "file-text",
     'StrInput(name="path", display_name="Path", tool_mode=True),',
     "text = SandboxCore(self.run_id).read_file(self.path)"),
    ("list_files_tool.py", "ListFilesTool", "List Files", "folder-open",
     'StrInput(name="prefix", display_name="Prefix", value="", tool_mode=True),',
     'text = SandboxCore(self.run_id).list_files(self.prefix or "")'),
    ("write_mermaid_tool.py", "WriteMermaidTool", "Write Mermaid", "git-branch",
     'StrInput(name="path", display_name="Path", tool_mode=True),\n        MessageTextInput(name="content", display_name="Mermaid Content", tool_mode=True),',
     "text = SandboxCore(self.run_id).write_mermaid(self.path, self.content)"),
    ("generate_image_tool.py", "GenerateImageTool", "Generate Image", "image",
     'MessageTextInput(name="prompt", display_name="Prompt", tool_mode=True),\n        StrInput(name="path", display_name="Path", tool_mode=True),',
     "text = SandboxCore(self.run_id).generate_image(self.prompt, self.path)"),
]

TEMPLATE = '''"""Langflow custom component: {display_name}."""

from lfx.custom import Component
from lfx.io import IntInput, MessageTextInput, Output, StrInput
from lfx.schema.message import Message

{sandbox_core}


class {class_name}(Component):
    display_name = "{display_name}"
    description = "Feature-delivery sandbox tool."
    icon = "{icon}"
    name = "{class_name}"

    inputs = [
        StrInput(name="run_id", display_name="Run ID", info="Sandbox run identifier."),
        {extra_inputs}
    ]
    outputs = [
        Output(display_name="Tool", name="component_as_tool", method="to_toolkit"),
        Output(display_name="Result", name="result", method="run"),
    ]

    def run(self) -> Message:
        {run_body}
        return Message(text=text)
'''


def main() -> None:
    out = Path(__file__).resolve().parent.parent / "components"
    sandbox_core = SANDBOX_CORE.read_text(encoding="utf-8")
    # Drop module docstring from inlined helper block.
    sandbox_core = sandbox_core.split("\n", 1)[1].strip()
    for filename, class_name, display_name, icon, extra_inputs, run_body in COMPONENTS:
        content = TEMPLATE.format(
            sandbox_core=sandbox_core,
            class_name=class_name,
            display_name=display_name,
            icon=icon,
            extra_inputs=extra_inputs,
            run_body=run_body,
        )
        (out / filename).write_text(content, encoding="utf-8")
    print(f"Wrote {len(COMPONENTS)} self-contained component files to {out}")


if __name__ == "__main__":
    main()
