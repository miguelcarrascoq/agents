import { useEffect, useState, type FormEvent } from "react";
import { assetUrl, createRun, fetchHealth, zipUrl, type PhaseEvent } from "./api";
import {
  buildApiPreview,
  buildCliPreview,
  highlightCallPreview,
} from "./callPreview";
import { FileViewer } from "./FileViewer";
import { MarkdownArtifact } from "./MarkdownArtifact";
import { renderMarkdown } from "./markdown";
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

function isImageAsset(path: string): boolean {
  return /\.(png|jpe?g|webp|gif)$/i.test(path);
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
  const [phases, setPhases] = useState<PhaseEvent[]>([]);
  const [templateFlash, setTemplateFlash] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [paramsCollapsed, setParamsCollapsed] = useState(false);
  const [callMethod, setCallMethod] = useState<"cli" | "api">("cli");
  const [copied, setCopied] = useState(false);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileText, setFileText] = useState<string | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  const runActive = loading || !!result;

  const supportsQuiet = project === "smolagents-python";
  const activeTemplateTitle =
    TEMPLATES.find((t) => t.id === activeTemplate)?.title ?? null;
  const callPreview =
    callMethod === "cli"
      ? buildCliPreview(form, project, supportsQuiet)
      : buildApiPreview(form);

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

  async function copyCallPreview() {
    try {
      await navigator.clipboard.writeText(callPreview);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
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
    setPhases([]);
    setSelectedFile(null);
    setFileText(null);
    setFileError(null);
    setParamsCollapsed(true);
    try {
      const data = await createRun(
        {
          ...form,
          agents: orderAgents(form.agents),
        },
        {
          onPhase: (event) => setPhases((prev) => [...prev, event]),
        },
      );
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setParamsCollapsed(false);
    } finally {
      setLoading(false);
    }
  }

  async function openRunFile(runId: string, relPath: string) {
    setSelectedFile(relPath);
    setFileLoading(true);
    setFileError(null);
    setFileText(null);
    try {
      const res = await fetch(assetUrl(runId, relPath));
      if (!res.ok) {
        throw new Error(`No se pudo cargar (${res.status})`);
      }
      setFileText(await res.text());
    } catch (err) {
      setFileError(err instanceof Error ? err.message : String(err));
    } finally {
      setFileLoading(false);
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

      <div className={runActive ? "main-grid run-active" : "main-grid"}>
        <div className="params-col">
        <form
          className={[
            "run-form",
            templateFlash ? "flash" : "",
            paramsCollapsed ? "collapsed" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          onSubmit={onSubmit}
        >
          <div className="form-head">
            <div className="section-head">
              <h2>Parámetros</h2>
              {paramsCollapsed ? (
                <p className="params-summary">
                  {form.provider}/{form.model} · {form.agents.length} agente
                  {form.agents.length === 1 ? "" : "s"}
                  {activeTemplateTitle ? ` · ${activeTemplateTitle}` : ""}
                </p>
              ) : (
                <p>Request, LLM, agentes y sandbox.</p>
              )}
            </div>
            <div className="form-head-actions">
              {runActive && (
                <button
                  type="button"
                  className="params-toggle"
                  aria-expanded={!paramsCollapsed}
                  onClick={() => setParamsCollapsed((c) => !c)}
                >
                  {paramsCollapsed ? "Editar parámetros" : "Ocultar parámetros"}
                </button>
              )}
              {!paramsCollapsed && (
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
              )}
            </div>
          </div>

          <div className="form-body">
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
                <option value="openrouter">openrouter</option>
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
                  <code>OPENAI_API_KEY</code>), aunque el chat sea DeepSeek u
                  OpenRouter.
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
          </div>
        </form>

        {!paramsCollapsed && (
          <aside className="call-methods">
            <div className="call-methods-head">
              <div className="section-head">
                <h2>Otros métodos</h2>
                <p>El mismo run vía CLI o API.</p>
              </div>
              <button
                type="button"
                className="copy-btn"
                onClick={copyCallPreview}
              >
                {copied ? "Copiado" : "Copiar"}
              </button>
            </div>
            <div className="presets call-method-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={callMethod === "cli"}
                className={callMethod === "cli" ? "chip active" : "chip"}
                onClick={() => setCallMethod("cli")}
              >
                CLI
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={callMethod === "api"}
                className={callMethod === "api" ? "chip active" : "chip"}
                onClick={() => setCallMethod("api")}
              >
                API
              </button>
            </div>
            <pre className="call-preview mono" tabIndex={0}>
              {highlightCallPreview(callPreview)}
            </pre>
          </aside>
        )}
        </div>

        {runActive && (
        <aside className="results show">
          <div className="section-head">
            <h2>Resultado</h2>
            <p>
              {loading
                ? "El pipeline puede tardar varios minutos…"
                : "Resumen del run"}
            </p>
          </div>

          {(loading || phases.length > 0) && (
            <ol className="phase-log" aria-live="polite">
              {phases.map((p, i) => {
                const done = !loading || i < phases.length - 1;
                const active = loading && i === phases.length - 1;
                return (
                  <li
                    key={`${p.phase}-${p.index}-${i}`}
                    className={
                      active ? "phase active" : done ? "phase done" : "phase"
                    }
                  >
                    <span className="phase-banner">
                      Pipeline {p.index}/{p.total} · {p.phase}
                    </span>
                    <span className="phase-meta mono">
                      run_id={p.run_id} · {p.framework}
                    </span>
                  </li>
                );
              })}
              {loading && phases.length === 0 && (
                <li className="phase active">
                  <span className="phase-banner">Iniciando pipeline…</span>
                </li>
              )}
            </ol>
          )}

          {loading && (
            <div className="loading-block" aria-busy="true">
              <div className="spinner" />
              <p>
                {phases.length
                  ? `Ejecutando ${phases[phases.length - 1].phase}…`
                  : "Corriendo agentes…"}
              </p>
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
                <div className="meta-actions">
                  <a
                    className="zip-download"
                    href={zipUrl(result.run_id)}
                    download={`${result.run_id}.zip`}
                  >
                    Descargar ZIP
                  </a>
                </div>
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
                      <MarkdownArtifact html={renderMarkdown(value)} />
                    </details>
                  ),
              )}

              {(
                [
                  ["files", result.files],
                  ["diagrams", result.diagrams],
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
                            <button
                              type="button"
                              className={
                                selectedFile === p
                                  ? "path-link active"
                                  : "path-link"
                              }
                              onClick={() =>
                                void openRunFile(result.run_id, p)
                              }
                            >
                              {p}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ),
              )}

              {(fileLoading || fileError || (selectedFile && fileText !== null)) && (
                <div className="file-preview">
                  {fileLoading && (
                    <p className="file-preview-status">Cargando archivo…</p>
                  )}
                  {fileError && (
                    <p className="file-preview-error">{fileError}</p>
                  )}
                  {!fileLoading &&
                    !fileError &&
                    selectedFile &&
                    fileText !== null && (
                      <FileViewer
                        path={selectedFile}
                        text={fileText}
                        rawUrl={assetUrl(result.run_id, selectedFile)}
                      />
                    )}
                </div>
              )}

              {result.assets && result.assets.length > 0 && (
                <div className="path-list assets-gallery">
                  <h3>assets</h3>
                  <ul className="asset-list">
                    {result.assets.map((p) => (
                      <li key={p}>
                        {isImageAsset(p) ? (
                          <figure className="asset-figure">
                            <img
                              src={assetUrl(result.run_id, p)}
                              alt={p}
                              loading="lazy"
                            />
                            <figcaption className="mono">{p}</figcaption>
                          </figure>
                        ) : (
                          <span className="mono">{p}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </aside>
        )}
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
