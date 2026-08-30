import fs from "node:fs";
import path from "node:path";

export type RunResult = {
  run_id: string;
  output_dir: string;
  request: string;
  plan: string;
  design: string;
  review: string;
  research: string;
  files: string[];
  diagrams: string[];
  assets: string[];
  provider: string;
  model: string;
};

export function writeSummary(result: RunResult): string {
  const target = path.join(result.output_dir, "summary.json");
  fs.writeFileSync(target, JSON.stringify(result, null, 2), "utf8");
  return target;
}

export function formatLocationReport(result: RunResult): string {
  const out = path.resolve(result.output_dir);
  const diagrams =
    result.diagrams.length > 0
      ? result.diagrams
      : result.files.filter((f) => f.startsWith("diagrams/") || f.endsWith(".mmd"));
  const assets =
    result.assets.length > 0
      ? result.assets
      : result.files.filter((f) => f.startsWith("assets/"));

  const lines = [
    "",
    "═".repeat(40),
    "Results saved to:",
    `  ${out}`,
    `run_id: ${result.run_id}`,
  ];
  if (diagrams.length) {
    lines.push("Diagrams:");
    for (const rel of diagrams) lines.push(`  ${path.join(out, rel)}`);
  }
  if (assets.length) {
    lines.push("Assets:");
    for (const rel of assets) lines.push(`  ${path.join(out, rel)}`);
  }
  if (result.files.length) {
    lines.push(`Files (${result.files.length}):`);
    for (const rel of result.files.slice(0, 25)) lines.push(`  ${rel}`);
    if (result.files.length > 25) {
      lines.push(`  … and ${result.files.length - 25} more`);
    }
  }
  lines.push("═".repeat(40), "");
  return lines.join("\n");
}

export function announceResults(result: RunResult): void {
  process.stderr.write(formatLocationReport(result));
}
