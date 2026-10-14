import { createApp } from "./src/worker/app.js";
import { purgeExpiredOperationalData } from "./src/worker/modules/privacy/privacy.service.js";
import { processPendingAgentSemanticMemory } from "./src/worker/extensions/agentic-layer/agent-semantic-memory.service.js";
import { recalibrateAgentSignals } from "./src/worker/extensions/agentic-layer/agent-recalibration.service.js";
import { reconcilePendingAgentExecutions } from "./src/worker/extensions/agentic-layer/agent-execution-recovery.service.js";

const app = createApp();

export default {
  async fetch(request, env, ctx) {
    return app.fetch(request, env, ctx);
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(purgeExpiredOperationalData(env).catch(error => console.error("PRIVACY_RETENTION_CLEANUP", String(error?.message || error))));
    ctx.waitUntil(processPendingAgentSemanticMemory(env,{limit:40}).catch(error => console.error("AGENT_SEMANTIC_INDEXING", String(error?.message || error))));
    ctx.waitUntil(recalibrateAgentSignals(env,{limit:200}).catch(error => console.error("AGENT_RECALIBRATION", String(error?.message || error))));
    ctx.waitUntil(reconcilePendingAgentExecutions(env,{limit:50}).catch(error => console.error("AGENT_EXECUTION_RECOVERY", String(error?.message || error))));
  }
};
