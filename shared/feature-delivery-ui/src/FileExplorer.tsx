import { assetUrl } from "./api";
import { FileViewer } from "./FileViewer";
import { PathTree } from "./PathTree";

type Props = {
  runId: string;
  files: string[];
  diagrams: string[];
  selected: string | null;
  fileText: string | null;
  loading: boolean;
  error: string | null;
  onOpen: (path: string) => void;
};

/** Split explorer: compact path trees on the left, file preview on the right. */
export function FileExplorer({
  runId,
  files,
  diagrams,
  selected,
  fileText,
  loading,
  error,
  onOpen,
}: Props) {
  return (
    <div className="file-explorer">
      <aside className="file-explorer-tree">
        {files.length > 0 && (
          <div className="file-explorer-section">
            <h3>files</h3>
            <PathTree paths={files} selected={selected} onOpen={onOpen} />
          </div>
        )}
        {diagrams.length > 0 && (
          <div className="file-explorer-section">
            <h3>diagrams</h3>
            <PathTree paths={diagrams} selected={selected} onOpen={onOpen} />
          </div>
        )}
      </aside>

      <div className="file-explorer-pane">
        {loading && (
          <p className="file-preview-status">Cargando archivo…</p>
        )}
        {error && !loading && (
          <p className="file-preview-error">{error}</p>
        )}
        {!loading && !error && selected && fileText !== null && (
          <FileViewer
            path={selected}
            text={fileText}
            rawUrl={assetUrl(runId, selected)}
          />
        )}
        {!loading && !error && !selected && (
          <p className="file-preview-status">Selecciona un archivo</p>
        )}
      </div>
    </div>
  );
}
