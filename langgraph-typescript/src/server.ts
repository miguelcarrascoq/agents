/**
 * HTTP API for feature-delivery lab (Hono + open UI + Swagger).
 * No authentication — UI and API are open.
 * POST /runs wraps runFeatureDelivery; UI at `/`; docs at `/docs`.
 * Accept: text/event-stream → SSE phase/done/error events.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { swaggerUI } from "@hono/swagger-ui";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";

import { resolveUiDist } from "../../shared/feature-delivery-ui/resolve-ui-dist.mjs";
import { runWithPhaseListener } from "./phaseLog.js";
import { OUTPUT_DIR, runFeatureDelivery } from "./pipeline.js";

const PROJECT_ID = "langgraph-typescript";

type RunBody = {
  request?: string;
  provider?: string;
  model?: string;
  run_id?: string;
  agents?: string | string[];
};

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".md": "text/markdown; charset=utf-8",
  ".mmd": "text/plain; charset=utf-8",
  ".json": "application/json",
  ".ts": "text/plain; charset=utf-8",
  ".tsx": "text/plain; charset=utf-8",
  ".js": "text/plain; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
};

function guessMime(filePath: string): string {
  return MIME[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

function sseChunk(event: string, data: unknown): Uint8Array {
  return new TextEncoder().encode(
    `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
  );
}

function resolveRunFile(runId: string, relPath: string): string {
  if (!runId || runId.includes("..") || runId.includes("/") || runId.includes("\\")) {
    throw new HTTPException(400, { message: "Invalid run_id" });
  }
  const root = path.resolve(OUTPUT_DIR, runId);
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    throw new HTTPException(404, { message: "Run output not found" });
  }
  const target = path.resolve(root, relPath);
  const rel = path.relative(root, target);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new HTTPException(400, { message: "Invalid file path" });
  }
  if (!existsSync(target) || !statSync(target).isFile()) {
    throw new HTTPException(404, { message: "File not found" });
  }
  return target;
}

const openApiDoc = {
  openapi: "3.0.0",
  info: {
    title: `Feature Delivery — ${PROJECT_ID}`,
    version: "0.1.0",
    description:
      "Open HTTP wrapper around `runFeatureDelivery` (no auth). UI at `/`; Swagger at `/docs`.",
  },
  paths: {
    "/health": {
      get: {
        summary: "Health check",
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: { type: "boolean" },
                    project: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/runs": {
      post: {
        summary: "Run feature delivery pipeline",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["request"],
                properties: {
                  request: {
                    type: "string",
                    description: "Feature request in Spanish",
                  },
                  provider: {
                    type: "string",
                    enum: ["openai", "deepseek", "openrouter"],
                    nullable: true,
                  },
                  model: { type: "string", nullable: true },
                  run_id: {
                    type: "string",
                    nullable: true,
                    description: "Resume from an existing sandbox run",
                  },
                  agents: {
                    oneOf: [
                      { type: "string" },
                      { type: "array", items: { type: "string" } },
                    ],
                    nullable: true,
                  },
                },
                example: {
                  request:
                    "Genera una imagen divertida de Condorito tomando once en Pelotillehue con Yayita",
                  provider: "openai",
                  model: "gpt-4.1-mini",
                  agents: ["researcher", "illustrator"],
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "RunResult summary (or SSE if Accept: text/event-stream)",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    run_id: { type: "string" },
                    output_dir: { type: "string" },
                    request: { type: "string" },
                    plan: { type: "string" },
                    design: { type: "string" },
                    review: { type: "string" },
                    research: { type: "string" },
                    files: { type: "array", items: { type: "string" } },
                    diagrams: { type: "array", items: { type: "string" } },
                    assets: { type: "array", items: { type: "string" } },
                    provider: { type: "string" },
                    model: { type: "string" },
                  },
                },
              },
            },
          },
          "400": { description: "Validation or pipeline error" },
        },
      },
    },
  },
};

const app = new Hono();

app.get("/health", (c) => c.json({ ok: true, project: PROJECT_ID }));

app.get("/openapi.json", (c) => c.json(openApiDoc));

app.get("/docs", swaggerUI({ url: "/openapi.json" }));

app.get("/runs/:runId/files/*", (c) => {
  const runId = c.req.param("runId");
  const prefix = `/runs/${runId}/files/`;
  const relPath = decodeURIComponent(c.req.path.slice(prefix.length));
  const target = resolveRunFile(runId, relPath);
  const body = readFileSync(target);
  return c.body(body, 200, { "Content-Type": guessMime(target) });
});

app.post("/runs", async (c) => {
  let body: RunBody;
  try {
    body = await c.req.json<RunBody>();
  } catch {
    throw new HTTPException(400, { message: "Invalid JSON body" });
  }
  const request = body.request?.trim();
  if (!request) {
    throw new HTTPException(400, { message: "Field 'request' is required" });
  }

  const opts = {
    provider: body.provider,
    model: body.model,
    runId: body.run_id,
    agents: body.agents,
  };

  const accept = c.req.header("accept") ?? "";
  if (!accept.includes("text/event-stream")) {
    try {
      const result = await runFeatureDelivery(request, opts);
      return c.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new HTTPException(400, { message });
    }
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(sseChunk(event, data));
      };
      try {
        const result = await runWithPhaseListener(
          (payload) => send("phase", payload),
          () => runFeatureDelivery(request, opts),
        );
        send("done", result);
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        send("error", { detail });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
});

const uiDist = resolveUiDist(import.meta.url);
if (uiDist) {
  app.use(
    "/assets/*",
    serveStatic({
      root: uiDist,
      rewriteRequestPath: (p) => p,
    }),
  );
  const indexHtml = readFileSync(path.join(uiDist, "index.html"), "utf8");
  app.get("/", (c) => c.html(indexHtml));
} else {
  app.get("/", (c) =>
    c.json({
      message:
        "UI not built. Run npm install && npm run build in shared/feature-delivery-ui",
      docs: "/docs",
    }),
  );
}

const host = process.env.HOST ?? "127.0.0.1";
const port = Number(process.env.PORT ?? "8000");

if (uiDist) console.log(`UI:         http://${host}:${port}/`);
console.log(`Swagger UI: http://${host}:${port}/docs`);
serve({ fetch: app.fetch, hostname: host, port });
