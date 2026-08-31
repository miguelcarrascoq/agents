/** Shared Mermaid generation rules for designer/diagrammer agents (TS pipelines). */

export const MERMAID_FLOWCHART_RULES =
  "REGLAS OBLIGATORIAS para diagramas Mermaid flowchart (la UI usa parser estricto):\n" +
  "- Empezar con flowchart TD o flowchart LR.\n" +
  "- Preferir una arista por línea: ID[Etiqueta] --> OtroID[Otra etiqueta]. " +
  "No declares nodos y aristas en bloques separados.\n" +
  "- IDs CamelCase sin espacios; etiqueta visible entre corchetes.\n" +
  "- Etiquetas cortas en texto plano: sin HTML, sin <br>, sin comillas dobles.\n" +
  "- Sin / en etiquetas (usar espacio o guion).\n" +
  "- Sin comas en etiquetas de nodos.\n" +
  "- Sin : en etiquetas de aristas (M-N en lugar de M:N).\n" +
  "- Sin paréntesis en etiquetas de aristas (GET index en lugar de GET (index)).\n" +
  "- Solo rectángulos [...] y rombos {...}; no [(cilindro)], [[subrutina]] ni ((círculo)).\n" +
  "- No uses A & B --> C; una arista por línea.\n" +
  "- Sin acentos en etiquetas si es posible.\n" +
  "- PROHIBIDO: ASCII art, sequenceDiagram, classDiagram.";

export const MERMAID_DESIGNER_RULES =
  " Eres el Designer/Architect. Produce design.md en markdown con: componentes, " +
  "APIs, modelo de datos, trade-offs y un diagrama de componentes. OBLIGATORIO: el " +
  "diagrama debe ir en un fence ```mermaid. " +
  `${MERMAID_FLOWCHART_RULES} ` +
  "PROHIBIDO además diagramas ASCII/textual.";

export const MERMAID_DIAGRAMMER_ARCH_RULES =
  " Eres el Diagrammer. Genera SOLO código Mermaid válido para un diagrama de " +
  "arquitectura (componentes y dependencias). Debe empezar con flowchart TD, " +
  `flowchart LR o graph TD. ${MERMAID_FLOWCHART_RULES} Sin markdown ni explicaciones.`;

export const MERMAID_DIAGRAMMER_SEQ_RULES =
  " Eres el Diagrammer. Genera SOLO código Mermaid válido para un flujo temporal " +
  "(pasos / secuencia de interacción). Usa flowchart TD o flowchart LR. " +
  "Máximo ~15 nodos; evita ramas excesivas. " +
  `${MERMAID_FLOWCHART_RULES} Sin markdown ni explicaciones.`;
