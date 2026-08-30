import { useEffect, useMemo, useState } from "react";
import {
  buildPathTree,
  collectDirPaths,
  type TreeNode,
} from "./buildPathTree";

type Props = {
  paths: string[];
  selected: string | null;
  onOpen: (path: string) => void;
};

function TreeNodes({
  nodes,
  expanded,
  selected,
  onToggle,
  onOpen,
}: {
  nodes: TreeNode[];
  expanded: Set<string>;
  selected: string | null;
  onToggle: (path: string) => void;
  onOpen: (path: string) => void;
}) {
  return (
    <ul className="path-tree">
      {nodes.map((node) => {
        if (node.kind === "dir") {
          const isOpen = expanded.has(node.path);
          return (
            <li key={`d:${node.path}`} className="path-tree-item">
              <button
                type="button"
                className="path-tree-dir"
                aria-expanded={isOpen}
                onClick={() => onToggle(node.path)}
              >
                <span
                  className={
                    isOpen ? "path-tree-chevron open" : "path-tree-chevron"
                  }
                  aria-hidden
                >
                  ▸
                </span>
                <span className="path-tree-name mono">{node.name}</span>
              </button>
              {isOpen && (
                <TreeNodes
                  nodes={node.children}
                  expanded={expanded}
                  selected={selected}
                  onToggle={onToggle}
                  onOpen={onOpen}
                />
              )}
            </li>
          );
        }
        return (
          <li key={`f:${node.path}`} className="path-tree-item">
            <button
              type="button"
              className={
                selected === node.path
                  ? "path-link path-tree-file active"
                  : "path-link path-tree-file"
              }
              onClick={() => onOpen(node.path)}
            >
              <span className="path-tree-file-gap" aria-hidden />
              <span className="mono">{node.name}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** Expandable folder tree built from flat relative paths. */
export function PathTree({ paths, selected, onOpen }: Props) {
  const pathsKey = paths.join("\0");
  const tree = useMemo(() => buildPathTree(paths), [pathsKey]);
  const allDirsKey = useMemo(
    () => collectDirPaths(tree).join("\0"),
    [tree],
  );
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(collectDirPaths(tree)),
  );

  useEffect(() => {
    setExpanded(new Set(allDirsKey ? allDirsKey.split("\0") : []));
  }, [pathsKey, allDirsKey]);

  function toggle(path: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  if (!tree.length) return null;

  return (
    <TreeNodes
      nodes={tree}
      expanded={expanded}
      selected={selected}
      onToggle={toggle}
      onOpen={onOpen}
    />
  );
}
