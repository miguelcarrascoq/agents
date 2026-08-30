import { useEffect, useState, type FormEvent } from "react";
import { createRun, fetchHealth } from "./api";
import {
  defaultModelFor,
  isKnownModel,
  modelsFor,
} from "./models";
import { TEMPLATES } from "./templates";
import {
  AGENT_META,
  AGENT_ORDER,
  DEFAULT_AGENTS,
  type AgentName,
  type Provider,
  type RunFormState,
  type RunResult,
  type Template,
} from "./types";
import "./App.css";

const INITIAL: RunFormState = {
  request: "",
  provider: "openai",
  model: defaultModelFor("openai"),
  runId: "",
  agents: [...DEFAULT_AGENTS],
  quiet: false,
};

function orderAgents(selected: AgentName[]): AgentName[] {
  return AGENT_ORDER.filter((a) => selected.includes(a));
}

function simpleMarkdown(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escaped
    .replace(/^### (.+)$/gm, "<h4>$1</h4>")
    .replace(/^## (.+)$/gm, "<h3>$1</h3>")
    .replace(/^# (.+)$/gm, "<h3>$1</h3>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\n/g, "<br />");
}

export default function App() {
  const [project, setProject] = useState<string | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [form, setForm] = useState<RunFormState>(INITIAL);
  const [activeTemplate, setActiveTemplate] = useState<string | null>(null);
  const [preset, setPreset] = useState<"default" | "extended" | "custom">(
    "default",
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);
  const [templateFlash, setTemplateFlash] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);

  const supportsQuiet = project === "smolagents-python";
  const activeTemplateTitle =
    TEMPLATES.find((t) => t.id === activeTemplate)?.title ?? null;

  useEffect(() => {
    let cancelled = false;
    fetchHealth()
      .then((h) => {
        if (!cancelled) {
          setProject(h.project);
          setHealthError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setHealthError(
            err instanceof Error ? err.message : "No se pudo conectar al API",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!templatesOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setTemplatesOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [templatesOpen]);

  function applyTemplate(t: Template) {
    setActiveTemplate(t.id);
    setForm((prev) => ({
      ...prev,
      request: t.form.request,
      provider: t.form.provider ?? prev.provider,
      model: t.form.model ?? prev.model,
      runId: t.form.runId ?? "",
      agents: orderAgents(t.form.agents),
      quiet: t.form.quiet ?? prev.quiet,
    }));
    const agents = orderAgents(t.form.agents);
    if (agents.join() === DEFAULT_AGENTS.join()) setPreset("default");
    else if (agents.join() === AGENT_ORDER.join()) setPreset("extended");
    else setPreset("custom");
    setTemplateFlash(true);
    window.setTimeout(() => setTemplateFlash(false), 450);
    setError(null);
    setTemplatesOpen(false);
  }

  function setAgentsFromPreset(next: "default" | "extended" | "custom") {
    setPreset(next);
    setActiveTemplate(null);
    if (next === "default") {
      setForm((f) => ({ ...f, agents: [...DEFAULT_AGENTS] }));
    } else if (next === "extended") {
      setForm((f) => ({ ...f, agents: [...AGENT_ORDER] }));
    }
  }

  function toggleAgent(name: AgentName) {
    setPreset("custom");
    setActiveTemplate(null);
    setForm((f) => {
      const has = f.agents.includes(name);
      const next = has
        ? f.agents.filter((a) => a !== name)
        : orderAgents([...f.agents, name]);
      return { ...f, agents: next };
    });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.request.trim()) {
      setError("El request es obligatorio.");
      return;
    }
    if (form.agents.length === 0) {
      setError("Selecciona al menos un agente.");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await createRun({
        ...form,
        agents: orderAgents(form.agents),
      });
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <header className="hero">
        <h1 className="brand">Feature Delivery</h1>
        <p className="tagline">
          Configura el pipeline multi-agente y lanza un run contra la API del
          lab.
        </p>
        <div className="lab-pill" aria-live="polite">
          {healthError ? (
            <span className="lab-bad">API offline — {healthError}</span>
          ) : project ? (
            <>
              <span className="lab-dot" />
              <span className="lab-id">{project}</span>
              <a className="docs-link" href="/docs">
                Swagger
              </a>
            </>
          ) : (
            <span className="lab-muted">Conectando…</span>
          )}
        </div>
      </header>

      <div className="main-grid">
        <form
          className={templateFlash ? "run-form flash" : "run-form"}
          onSubmit={onSubmit}
        >
          <div className="form-head">
            <div className="section-head">
              <h2>Parámetros</h2>
              <p>Request, LLM, agentes y sandbox.</p>
            </div>
            <button
              type="button"
              className={
                templatesOpen || activeTemplate
                  ? "templates-trigger active"
                  : "templates-trigger"
              }
              aria-expanded={templatesOpen}
              aria-haspopup="dialog"
              onClick={() => setTemplatesOpen(true)}
            >
              {activeTemplateTitle
                ? `Plantilla: ${activeTemplateTitle}`
                : "Plantillas"}
            </button>
          </div>

          <label className="field">
            <span>Request (español)</span>
            <textarea
              rows={5}
              value={form.request}
              onChange={(e) => {
                setActiveTemplate(null);
                setForm((f) => ({ ...f, request: e.target.value }));
              }}
              placeholder="Describe la feature…"
              required
            />
          </label>

          <div className="row-2">
            <label className="field">
              <span>Provider</span>
              <select
                value={form.provider}
                onChange={(e) => {
                  setActiveTemplate(null);
                  const provider = e.target.value as Provider;
                  setForm((f) => ({
                    ...f,
                    provider,
                    model: defaultModelFor(provider),
                  }));
                }}
              >
                <option value="openai">openai</option>
                <option value="deepseek">deepseek</option>
              </select>
            </label>
            <label className="field">
              <span>Model</span>
              <select
                value={form.model}
                onChange={(e) => {
                  setActiveTemplate(null);
                  setForm((f) => ({ ...f, model: e.target.value }));
                }}
              >
                {!isKnownModel(form.provider, form.model) && form.model.trim() ? (
                  <option value={form.model}>{form.model} (custom)</option>
                ) : null}
                {modelsFor(form.provider).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label} — {m.hint}
                  </option>
                ))}
              </select>
              {form.agents.includes("illustrator") ? (
                <p className="field-hint">
                  Las imágenes usan OpenAI <code>gpt-image-1</code> (requiere{" "}
                  <code>OPENAI_API_KEY</code>), aunque el chat sea DeepSeek.
                </p>
              ) : null}
            </label>
          </div>

          <label className="field">
            <span>Run ID (opcional — reanudar sandbox)</span>
            <input
              type="text"
              className="mono"
              value={form.runId}
              onChange={(e) => {
                setActiveTemplate(null);
                setForm((f) => ({ ...f, runId: e.target.value }));
              }}
              placeholder="dejar vacío = nuevo run"
            />
          </label>

          <fieldset className="field agents-field">
            <legend>Agentes</legend>
            <div className="presets" role="group" aria-label="Presets">
              {(
                [
                  ["default", "Default"],
                  ["extended", "Extended"],
                  ["custom", "Custom"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={preset === id ? "chip active" : "chip"}
                  onClick={() => setAgentsFromPreset(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="agent-list">
              {AGENT_ORDER.map((name) => {
                const meta = AGENT_META[name];
                return (
                  <label key={name} className="agent-row">
                    <span className="agent-row-text">
                      <span className="agent-name">{meta.name}</span>
                      <span className="agent-hint">{meta.hint}</span>
                    </span>
                    <input
                      type="checkbox"
                      className="switch"
                      checked={form.agents.includes(name)}
                      onChange={() => toggleAgent(name)}
                    />
                  </label>
                );
              })}
            </div>
          </fieldset>

          {supportsQuiet && (
            <label className="agent-row quiet">
              <span className="agent-row-text">
                <span className="agent-name">Quiet</span>
                <span className="agent-hint">smolagents</span>
              </span>
              <input
                type="checkbox"
                className="switch"
                checked={form.quiet}
                onChange={(e) =>
                  setForm((f) => ({ ...f, quiet: e.target.checked }))
                }
              />
            </label>
          )}

          {error && (
            <p className="banner error" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            className="submit"
            disabled={loading || !!healthError}
          >
            {loading ? "Ejecutando…" : "Lanzar run"}
          </button>
        </form>

        <aside className={`results ${result || loading ? "show" : ""}`}>
          <div className="section-head">
            <h2>Resultado</h2>
            <p>
              {loading
                ? "El pipeline puede tardar varios minutos…"
                : result
                  ? "Resumen del run"
                  : "Aquí aparecerá la respuesta de POST /runs"}
            </p>
          </div>

          {loading && (
            <div className="loading-block" aria-busy="true">
              <div className="spinner" />
              <p>Corriendo agentes…</p>
            </div>
          )}

          {result && !loading && (
            <div className="result-body">
              <dl className="meta">
                <div>
                  <dt>run_id</dt>
                  <dd className="mono">{result.run_id}</dd>
                </div>
                <div>
                  <dt>LLM</dt>
                  <dd className="mono">
                    {result.provider}/{result.model}
                  </dd>
                </div>
                {result.output_dir && (
                  <div>
                    <dt>output</dt>
                    <dd className="mono small">{result.output_dir}</dd>
                  </div>
                )}
              </dl>

              {(
                [
                  ["research", result.research],
                  ["plan", result.plan],
                  ["design", result.design],
                  ["review", result.review],
                ] as const
              ).map(
                ([key, value]) =>
                  value && (
                    <details key={key} className="artifact" open={key === "plan"}>
                      <summary>{key}.md</summary>
                      <div
                        className="md"
                        dangerouslySetInnerHTML={{
                          __html: simpleMarkdown(value),
                        }}
                      />
                    </details>
                  ),
              )}

              {(
                [
                  ["files", result.files],
                  ["diagrams", result.diagrams],
                  ["assets", result.assets],
                ] as const
              ).map(
                ([key, list]) =>
                  list &&
                  list.length > 0 && (
                    <div key={key} className="path-list">
                      <h3>{key}</h3>
                      <ul>
                        {list.map((p) => (
                          <li key={p} className="mono">
                            {p}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ),
              )}
            </div>
          )}
        </aside>
      </div>

      {templatesOpen && (
        <div
          className="templates-overlay"
          role="presentation"
          onClick={() => setTemplatesOpen(false)}
        >
          <div
            className="templates-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="templates-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="templates-modal-head">
              <div>
                <h2 id="templates-modal-title">Plantillas</h2>
                <p>Elige un ejemplo para rellenar el formulario.</p>
              </div>
              <button
                type="button"
                className="templates-close"
                aria-label="Cerrar plantillas"
                onClick={() => setTemplatesOpen(false)}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
            <div className="template-grid">
              {TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={
                    activeTemplate === t.id
                      ? "template-btn active"
                      : "template-btn"
                  }
                  onClick={() => applyTemplate(t)}
                >
                  <span className="template-title">{t.title}</span>
                  <span className="template-blurb">{t.blurb}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
