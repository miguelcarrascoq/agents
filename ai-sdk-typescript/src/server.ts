/**
 * HTTP API for feature-delivery lab (Hono + Swagger UI).
 * POST /runs wraps runFeatureDelivery; docs at /docs.
 */
import { serve } from "@hono/node-server";
import { swaggerUI } from "@hono/swagger-ui";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";

import { runFeatureDelivery } from "./pipeline.js";

const PROJECT_ID = "ai-sdk-typescript";

type RunBody = {
  request?: string;
  provider?: string;
  model?: string;
  run_id?: string;
  agents?: string | string[];
};

const openApiDoc = {
  openapi: "3.0.0",
  info: {
    title: `Feature Delivery — ${PROJECT_ID}`,
    version: "0.1.0",
    description:
      "HTTP wrapper around `runFeatureDelivery`. Use Try it out on POST /runs.",
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
                    enum: ["openai", "deepseek"],
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
            description: "RunResult summary",
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

app.get("/", (c) => c.redirect("/docs"));

app.get("/health", (c) => c.json({ ok: true, project: PROJECT_ID }));

app.get("/openapi.json", (c) => c.json(openApiDoc));

app.get("/docs", swaggerUI({ url: "/openapi.json" }));

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
  try {
    const result = await runFeatureDelivery(request, {
      provider: body.provider,
      model: body.model,
      runId: body.run_id,
      agents: body.agents,
    });
    return c.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new HTTPException(400, { message });
  }
});

const host = process.env.HOST ?? "127.0.0.1";
const port = Number(process.env.PORT ?? "8000");

console.log(`Swagger UI: http://${host}:${port}/docs`);
serve({ fetch: app.fetch, hostname: host, port });
