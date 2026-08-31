import type { Template } from "./types";
import { DEFAULT_AGENTS } from "./types";

export const TEMPLATES: Template[] = [
  {
    id: "jwt-auth",
    title: "Autenticación JWT",
    blurb: "Login + tokens — pipeline default",
    form: {
      request:
        "Agregar autenticación JWT con registro, login, refresh token y middleware de protección de rutas en una API REST.",
      provider: "openai",
      model: "gpt-4.1",
      agents: [...DEFAULT_AGENTS],
      runId: "",
    },
  },
  {
    id: "crud-api",
    title: "CRUD de productos",
    blurb: "API + modelo de datos",
    form: {
      request:
        "Diseñar e implementar un CRUD de productos con categorías, paginación, filtros por precio y validación de entrada.",
      provider: "openai",
      model: "gpt-4.1",
      agents: [...DEFAULT_AGENTS],
      runId: "",
    },
  },
  {
    id: "research-plan",
    title: "Research + plan",
    blurb: "Solo investigación y planificación",
    form: {
      request:
        "Investigar mejores prácticas actuales para rate limiting en APIs públicas y proponer un plan de implementación para nuestro servicio.",
      provider: "openai",
      model: "gpt-4.1-mini",
      agents: ["researcher", "planner"],
      runId: "",
    },
  },
  {
    id: "diagrams",
    title: "Arquitectura + secuencia",
    blurb: "Design + diagramas Mermaid",
    form: {
      request:
        "Diseñar la arquitectura de un sistema de notificaciones push (web + mobile) y generar diagramas de arquitectura y de flujo temporal.",
      provider: "openai",
      model: "gpt-4.1-mini",
      agents: ["planner", "designer", "diagrammer"],
      runId: "",
    },
  },
  {
    id: "illustrator",
    title: "Ilustración Condorito",
    blurb: "Research + imagen",
    form: {
      request:
        "Genera una imagen divertida de Condorito tomando once en Pelotillehue con Yayita",
      provider: "openai",
      model: "gpt-4.1-mini",
      agents: ["researcher", "illustrator"],
      runId: "",
    },
  },
  {
    id: "ilustracion-mafalda",
    title: "Ilustración JC Bodoque",
    blurb: "OpenRouter · Gemini Flash",
    form: {
      request:
        "Genera una ilustración humorística de 'Juan Carlos Bodoque' (personaje de la serie de TV '31 minutos') hablando sobre computadores.",
      provider: "openrouter",
      model: "google/gemini-2.5-flash-lite",
      agents: ["researcher", "illustrator"],
      runId: "",
    },
  },
  {
    id: "ilustracion-onboarding",
    title: "Assets de bienvenida",
    blurb: "OpenRouter · Llama 70B",
    form: {
      request:
        "Genera 2-3 ilustraciones flat/friendly para pantallas de onboarding de una app de productividad (bienvenida, perfil, listo).",
      provider: "openrouter",
      model: "meta-llama/llama-3.3-70b-instruct",
      agents: ["researcher", "illustrator"],
      runId: "",
    },
  },
  {
    id: "ilustracion-arquitectura",
    title: "Metaphor visual de arquitectura",
    blurb: "OpenRouter · Gemini Flash",
    form: {
      request:
        "Genera una ilustración metafórica de un pipeline de agentes (research → plan → diseño → código) como fábrica/taller, estilo editorial limpio.",
      provider: "openrouter",
      model: "google/gemini-2.5-flash-lite",
      agents: ["researcher", "illustrator"],
      runId: "",
    },
  },
  {
    id: "full-pipeline",
    title: "Pipeline completo",
    blurb: "Los 7 agentes",
    form: {
      request:
        "Construir un módulo de onboarding para nuevos usuarios: pantallas, API, diagramas de flujo y assets visuales de bienvenida; luego revisar la entrega.",
      provider: "openai",
      model: "gpt-4.1",
      agents: [
        "researcher",
        "planner",
        "designer",
        "diagrammer",
        "illustrator",
        "coder",
        "reviewer",
      ],
      runId: "",
    },
  },
  {
    id: "dark-mode",
    title: "Tema oscuro",
    blurb: "Feature de UI",
    form: {
      request:
        "Agregar un tema oscuro al dashboard con toggle persistente, tokens de color y componentes adaptados (sidebar, tablas, formularios).",
      provider: "openai",
      model: "gpt-4.1",
      agents: [...DEFAULT_AGENTS],
      runId: "",
    },
  },
  {
    id: "push-notif",
    title: "Notificaciones push",
    blurb: "Plan → code → review",
    form: {
      request:
        "Implementar notificaciones push web con Service Worker, suscripción del usuario y endpoint de envío desde el backend.",
      provider: "openai",
      model: "gpt-4.1",
      agents: ["planner", "designer", "coder", "reviewer"],
      runId: "",
    },
  },
  {
    id: "rate-limit",
    title: "Rate limiting",
    blurb: "DeepSeek + default agents",
    form: {
      request:
        "Agregar rate limiting por API key con ventanas deslizantes, headers de cuota y respuesta 429 consistente.",
      provider: "deepseek",
      model: "deepseek-chat",
      agents: [...DEFAULT_AGENTS],
      runId: "",
    },
  },
  {
    id: "crud-openrouter",
    title: "CRUD vía OpenRouter",
    blurb: "Código económico (Qwen coder)",
    form: {
      request:
        "Diseñar e implementar un CRUD de productos con categorías, paginación, filtros por precio y validación de entrada.",
      provider: "openrouter",
      model: "qwen/qwen-2.5-coder-32b-instruct",
      agents: [...DEFAULT_AGENTS],
      runId: "",
    },
  },
  {
    id: "onboarding",
    title: "Onboarding flow",
    blurb: "Design + mockups",
    form: {
      request:
        "Diseñar el flujo de onboarding de 3 pasos (perfil, preferencias, tour) con wireframes conceptuales y generar 1-2 mockups de pantalla.",
      provider: "openai",
      model: "gpt-4.1-mini",
      agents: ["planner", "designer", "illustrator"],
      runId: "",
    },
  },
  {
    id: "resume-coder",
    title: "Resume: coder + reviewer",
    blurb: "Reanuda un run_id existente",
    form: {
      request:
        "Continuar la implementación y hacer code review de los artefactos ya generados en este sandbox.",
      provider: "openai",
      model: "gpt-4.1",
      agents: ["coder", "reviewer"],
      runId: "",
    },
  },
];
