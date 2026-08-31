import fs from "node:fs";
import path from "node:path";
import { search } from "duck-duck-scrape";
import { sanitizeMermaidInMarkdown, sanitizeMermaidSource } from "../../shared/mermaid-sanitize.js";

export class Sandbox {
  constructor(
    public readonly root: string,
    public readonly knowledgeDir: string,
  ) {
    fs.mkdirSync(path.join(root, "src"), { recursive: true });
    fs.mkdirSync(path.join(root, "diagrams"), { recursive: true });
    fs.mkdirSync(path.join(root, "assets"), { recursive: true });
  }

  private safePath(relative: string): string {
    const cleaned = relative.replace(/\\/g, "/").replace(/^\/+/, "");
    if (cleaned.split("/").includes("..")) {
      throw new Error("Path traversal is not allowed");
    }
    const full = path.resolve(this.root, cleaned);
    if (!full.startsWith(path.resolve(this.root))) {
      throw new Error("Path escapes sandbox");
    }
    return full;
  }

  writeFile(rel: string, content: string): string {
    if (content.includes("```mermaid")) {
      content = sanitizeMermaidInMarkdown(content);
    }
    const target = this.safePath(rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content, "utf8");
    return `Wrote ${rel} (${content.length} chars)`;
  }

  readFile(rel: string): string {
    const target = this.safePath(rel);
    if (!fs.existsSync(target)) return `ERROR: file not found: ${rel}`;
    return fs.readFileSync(target, "utf8");
  }

  listFiles(prefix = ""): string {
    const base = prefix ? this.safePath(prefix) : this.root;
    if (!fs.existsSync(base)) return "(empty)";
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else files.push(path.relative(this.root, full));
      }
    };
    walk(base);
    files.sort();
    return files.length ? files.join("\n") : "(empty)";
  }

  searchKnowledge(query: string, limit = 3): string {
    const tokens = query
      .toLowerCase()
      .split(/\W+/)
      .filter((t) => t.length > 2);
    const scored: { score: number; name: string; text: string }[] = [];
    for (const name of fs.readdirSync(this.knowledgeDir)) {
      if (!name.endsWith(".md")) continue;
      const text = fs.readFileSync(path.join(this.knowledgeDir, name), "utf8");
      const lower = text.toLowerCase();
      const score = tokens.length
        ? tokens.reduce((acc, tok) => acc + (lower.split(tok).length - 1), 0)
        : 1;
      if (score > 0) scored.push({ score, name, text });
    }
    scored.sort((a, b) => b.score - a.score);
    if (!scored.length) return "No knowledge matches.";
    return scored
      .slice(0, limit)
      .map((s) => `### ${s.name} (score=${s.score})\n${s.text.slice(0, 2500)}`)
      .join("\n\n");
  }

  async webSearch(query: string, limit = 5): Promise<string> {
    try {
      const results = await search(query, { safeSearch: 0 });
      const items = (results.results ?? []).slice(0, limit);
      if (!items.length) return "No web results found.";
      return items
        .map((item) => {
          const title = item.title ?? "No title";
          const href = item.url ?? "";
          const body = (item.description ?? "").slice(0, 500);
          return `- **${title}**\n  ${href}\n  ${body}`;
        })
        .join("\n\n");
    } catch (err) {
      return `Web search unavailable: ${err}. Use search_knowledge as fallback.`;
    }
  }

  writeMermaid(rel: string, content: string): string {
    if (!content.trim()) throw new Error("Mermaid content cannot be empty");
    let cleaned = rel.replace(/\\/g, "/").replace(/^\/+/, "");
    if (!cleaned.endsWith(".mmd")) cleaned = `${cleaned}.mmd`;
    if (!cleaned.startsWith("diagrams/")) cleaned = `diagrams/${cleaned.replace(/^\//, "")}`;
    let body = content.trim();
    if (body.startsWith("```")) {
      body = body.replace(/^```(?:mermaid)?\s*/, "").replace(/\s*```$/, "");
    }
    body = sanitizeMermaidSource(body);
    return this.writeFile(cleaned, body + "\n");
  }

  async generateImage(prompt: string, rel: string): Promise<string> {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      return (
        "ERROR: OPENAI_API_KEY required for generate_image " +
        "(illustrator needs OpenAI even when LLM uses DeepSeek)."
      );
    }
    let target = rel.replace(/\\/g, "/").replace(/^\/+/, "");
    if (!target.startsWith("assets/")) target = `assets/${target.replace(/^\//, "")}`;
    if (!target.toLowerCase().endsWith(".png")) target = `${target}.png`;
    try {
      const response = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        // gpt-image models reject response_format; they return b64_json by default.
        body: JSON.stringify({
          model: "gpt-image-1",
          prompt,
          size: "1024x1024",
          n: 1,
        }),
      });
      if (!response.ok) {
        const text = await response.text();
        return `ERROR generating image: ${response.status} ${text}`;
      }
      const data = (await response.json()) as {
        data?: { b64_json?: string; url?: string }[];
      };
      const item = data.data?.[0];
      let bytes: Buffer | undefined;
      if (item?.b64_json) {
        bytes = Buffer.from(item.b64_json, "base64");
      } else if (item?.url) {
        const imgRes = await fetch(item.url);
        if (!imgRes.ok) {
          return `ERROR generating image: failed to download url (${imgRes.status})`;
        }
        bytes = Buffer.from(await imgRes.arrayBuffer());
      }
      if (!bytes) return "ERROR generating image: empty response";
      const full = this.safePath(target);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, bytes);
      return `Generated image at ${target}`;
    } catch (err) {
      return `ERROR generating image: ${err}`;
    }
  }

  listWrittenFiles(): string[] {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name !== "summary.json") {
          files.push(path.relative(this.root, full));
        }
      }
    };
    walk(this.root);
    return files.sort();
  }
}
