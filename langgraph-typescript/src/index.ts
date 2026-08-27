#!/usr/bin/env node
import { runFeatureDelivery } from "./pipeline.js";
import { runInteractive } from "./interactive.js";
import { formatLocationReport } from "./models.js";

const PROJECT_ID = "langgraph-typescript";

function parseArgs(argv: string[]) {
  const out: {
    request?: string;
    provider?: string;
    model?: string;
    runId?: string;
    agents?: string;
    interactive?: boolean;
  } = {};
  const positionals: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--provider") out.provider = argv[++i];
    else if (a === "--model") out.model = argv[++i];
    else if (a === "--run-id") out.runId = argv[++i];
    else if (a === "--agents") out.agents = argv[++i];
    else if (a === "--interactive" || a === "-i") out.interactive = true;
    else if (a === "--help" || a === "-h") {
      console.log(
        'Usage: npm start -- [--interactive | -i] "<feature en español>" [--provider openai|deepseek] [--model ...] [--run-id ...] [--agents researcher,planner,...]',
      );
      process.exit(0);
    } else positionals.push(a);
  }
  out.request = positionals.join(" ").trim();
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.interactive || !args.request) {
    const code = await runInteractive(PROJECT_ID);
    process.exit(code);
  }
  try {
    const result = await runFeatureDelivery(args.request, {
      provider: args.provider,
      model: args.model,
      runId: args.runId,
      agents: args.agents,
    });
    console.log(formatLocationReport(result));
    console.log(`provider=${result.provider} model=${result.model}`);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
