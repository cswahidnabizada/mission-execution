import { json, cleanText } from "../../core/http.js";
import { requireAdmin } from "../../core/auth-session.js";
import { limitAction } from "../../security/action-limit.js";
import { getCanonicalMissionMetrics } from "./metrics.service.js";
import { resolveAnalyticsGovernance } from "../../security/analytics-governance.service.js";

export function registerAnalyticsRoutes(router) {
  router.get("/api/analytics/overview", async ({ request, env, url }) => {
    try {
      const session = await requireAdmin(request, env);
      await limitAction(env, session, "analytics-overview", { limit: 20, windowSeconds: 60 });
      const from = cleanText(url.searchParams.get("from"), 10);
      const to = cleanText(url.searchParams.get("to"), 10);
      const governance = await resolveAnalyticsGovernance(env, session.tenantId);
      const result = await getCanonicalMissionMetrics(env, { tenantId: session.tenantId, from, to, governance });
      return json({ success: true, analytics: result });
    } catch (error) {
      const status = Number(error?.status) || 500;
      if (status >= 500) console.error("ANALYTICS OVERVIEW ERROR", error);
      return json({ success: false, error: status === 503 ? "Analytics temporarily unavailable" : (status === 500 ? "Analytics unavailable" : (error?.message || "Analytics unavailable")) }, status);
    }
  });
}
