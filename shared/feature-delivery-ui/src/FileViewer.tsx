import type { ReactNode } from "react";
import { MarkdownArtifact } from "./MarkdownArtifact";
import { highlightToPre, langFromPath } from "./highlight";
import { renderMarkdown } from "./markdown";

type Props = {
  path: string;
  text: string;
  rawUrl: string;
};

function isMarkdownPath(filePath: string): boolean {
  return /\.md$/i.test(filePath);
}

function isMermaidPath(filePath: string): boolean {
  return /\.mmd$/i.test(filePath);
}

/** Preview a fetched run file: markdown, mermaid, or highlighted source. */
export function FileViewer({ path, text, rawUrl }: Props) {
  let body: ReactNode;
  if (isMermaidPath(path)) {
    body = (
      <MarkdownArtifact html={renderMarkdown("```mermaid\n" + text + "\n```")} />
    );
  } else if (isMarkdownPath(path)) {
    body = <MarkdownArtifact html={renderMarkdown(text)} />;
  } else {
    const html = highlightToPre(text, langFromPath(path));
    body = (
      <div
        className="file-code"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  return (
    <div className="file-viewer">
      <div className="file-viewer-head">
        <span className="mono">{path}</span>
        <a className="file-raw-link" href={rawUrl} target="_blank" rel="noreferrer">
          abrir raw
        </a>
      </div>
      <div className="file-viewer-body">{body}</div>
    </div>
  );
}
