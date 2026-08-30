export type TreeNode =
  | { kind: "dir"; name: string; path: string; children: TreeNode[] }
  | { kind: "file"; name: string; path: string };

type MutableDir = {
  kind: "dir";
  name: string;
  path: string;
  childrenMap: Map<string, MutableDir | { kind: "file"; name: string; path: string }>;
};

function sortChildren(nodes: TreeNode[]): TreeNode[] {
  return [...nodes].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

function freezeDir(dir: MutableDir): Extract<TreeNode, { kind: "dir" }> {
  const children: TreeNode[] = [];
  for (const child of dir.childrenMap.values()) {
    if (child.kind === "dir") {
      children.push(freezeDir(child));
    } else {
      children.push(child);
    }
  }
  return {
    kind: "dir",
    name: dir.name,
    path: dir.path,
    children: sortChildren(children),
  };
}

/** Collect every directory path present in the tree (for default-expanded state). */
export function collectDirPaths(nodes: TreeNode[]): string[] {
  const out: string[] = [];
  function walk(list: TreeNode[]) {
    for (const n of list) {
      if (n.kind === "dir") {
        out.push(n.path);
        walk(n.children);
      }
    }
  }
  walk(nodes);
  return out;
}

/** Build a sorted directory tree from flat relative paths. */
export function buildPathTree(paths: string[]): TreeNode[] {
  const root: MutableDir = {
    kind: "dir",
    name: "",
    path: "",
    childrenMap: new Map(),
  };

  for (const raw of paths) {
    const parts = raw.split("/").filter(Boolean);
    if (!parts.length) continue;
    let cursor = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      const nodePath = parts.slice(0, i + 1).join("/");
      if (isLast) {
        cursor.childrenMap.set(part, {
          kind: "file",
          name: part,
          path: nodePath,
        });
      } else {
        let next = cursor.childrenMap.get(part);
        if (!next || next.kind !== "dir") {
          next = {
            kind: "dir",
            name: part,
            path: nodePath,
            childrenMap: new Map(),
          };
          cursor.childrenMap.set(part, next);
        }
        cursor = next;
      }
    }
  }

  return freezeDir(root).children;
}
