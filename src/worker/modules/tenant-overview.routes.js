import { json, cleanText } from "../core/http.js";
import { requireAdmin } from "../core/auth-session.js";
import { limitAction } from "../security/action-limit.js";
import { attentionForSession } from "./attention/attention.service.js";
import { getCanonicalMissionMetrics } from "./analytics/metrics.service.js";
import { operationalMissionHref } from "./intelligence/operational-mission-route.js";
import { listAvailablePublicMissions } from "../repositories/public.repository.js";

/*
 * V2.2 Tenant Overview Intelligence
 * Read-only composition boundary. It does not own mission, action, assignment,
 * execution, liveness, or analytics rules. Existing engines remain authoritative.
 */
export function registerTenantOverviewRoutes(router) {
  router.get("/api/tenant/overview", async ({ request, env, url }) => {
    try {
      const session = await requireAdmin(request, env);
      await limitAction(env, session, "tenant-overview", { limit: 30, windowSeconds: 60 });
      const today = cleanText(url.searchParams.get("date"), 10) || new Date().toISOString().slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) return json({ success: false, error: "Invalid overview date" }, 400);
      const date = new Date(`${today}T12:00:00Z`);
      const monthStartDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 12));
      const monthEndDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 12));
      const monthFrom = monthStartDate.toISOString().slice(0, 10);
      const monthTo = monthEndDate.toISOString().slice(0, 10);
      const day = date.getUTCDay();
      const mondayOffset = (day + 6) % 7;
      date.setUTCDate(date.getUTCDate() - mondayOffset);
      const weekFrom = date.toISOString().slice(0, 10);
      const results = await Promise.allSettled([
        attentionForSession(env, session, { limit: 8 }),
        getCanonicalMissionMetrics(env, { tenantId: session.tenantId, from: today, to: today }),
        getCanonicalMissionMetrics(env, { tenantId: session.tenantId, from: monthFrom, to: monthTo }),
        env.DB.prepare(`SELECT
          (SELECT COUNT(*) FROM mission_canonical_projection cm WHERE cm.company_id=? AND cm.status='Completed' AND cm.mission_date IS NOT NULL AND date(cm.mission_date)>=date(?) AND date(cm.mission_date)<=date(?)) AS completed,
          (SELECT COUNT(*) FROM mission_canonical_projection nm WHERE nm.company_id=? AND date(nm.created_at)>=date(?) AND date(nm.created_at)<=date(?)) AS created,
          (SELECT COUNT(*) FROM mission_canonical_projection tm WHERE tm.company_id=? AND date(tm.created_at)=date(?)) AS today_created`).bind(
          Number(session.tenantId),weekFrom,today,
          Number(session.tenantId),weekFrom,today,
          Number(session.tenantId),today
        ).first(),
        env.DB.prepare("SELECT COUNT(*) AS total,SUM(CASE WHEN active=1 THEN 1 ELSE 0 END) AS active FROM drivers WHERE company_id=?").bind(Number(session.tenantId)).first(),
        env.DB.prepare("SELECT COUNT(*) AS pending FROM public_mission_requests WHERE company_id=? AND status='Pending'").bind(Number(session.tenantId)).first(),
        env.DB.prepare("SELECT id,mission_id,requester_name,requester_type,status,created_at,updated_at FROM public_mission_requests WHERE company_id=? AND status='Pending' ORDER BY COALESCE(updated_at,created_at) ASC,id ASC LIMIT 5").bind(Number(session.tenantId)).all(),
        env.DB.prepare(`SELECT COUNT(*) AS count FROM mission_custody_cases c WHERE c.status IN ('awaiting_release','ready_to_transfer','awaiting_acceptance') AND (c.company_id=? OR (c.recipient_type='tenant' AND c.recipient_id=?))`).bind(Number(session.tenantId),Number(session.tenantId)).first(),
        listAvailablePublicMissions(env, session)
      ]);
      const [attention, analytics, monthAnalytics, week, drivers, requests, pendingRequestRows, custody, marketplace] = results;
      const intelligence = attention.status === "fulfilled" ? attention.value : null;
      const metrics = analytics.status === "fulfilled" ? analytics.value : null;
      const monthMetrics = monthAnalytics.status === "fulfilled" ? monthAnalytics.value : null;
      const weekRow = week.status === "fulfilled" ? week.value : null;
      const driverRow = drivers.status === "fulfilled" ? drivers.value : null;
      const requestRow = requests.status === "fulfilled" ? requests.value : null;
      const pendingRequestList = pendingRequestRows.status === "fulfilled" ? (pendingRequestRows.value?.results || []) : [];
      const custodyRow = custody.status === "fulfilled" ? custody.value : null;
      const marketplaceRows = marketplace.status === "fulfilled" && Array.isArray(marketplace.value) ? marketplace.value : null;
      const sections = {
        intelligence: sectionState(attention),
        analytics: sectionState(analytics),
        monthAnalytics: sectionState(monthAnalytics),
        capacity: sectionState(drivers),
        collaboration: sectionState(requests),
        custody: sectionState(custody),
        marketplace: sectionState(marketplace)
      };
      const available = Object.values(sections).filter(x => x.status === "ready").length;
      if (!available) return json({ success: false, error: "Tenant overview temporarily unavailable", sections }, 503);
      const focus = intelligence?.intelligence || null;
      const attentionSummary = intelligence?.summary || { critical: 0, attention: 0, watch: 0, total: 0 };
      const smartSignals = Array.isArray(metrics?.smart) ? metrics.smart : [];
      const engineSignals = (intelligence?.items || []).slice(0, 5).map(item => ({
        missionId: Number(item.missionId), reference: String(item.reference || ""), level: item.level,
        score: Number(item.score || 0), status: item.statusLabel || item.status || "", reason: item.reasons?.[0]?.label || "Mission needs attention.",
        link: item.link || operationalMissionHref(item.missionId,{role:session.role})
      }));
      const top = focus?.focus || null;
      const decision = buildDecision({ focus, top, attentionSummary, smartSignals, driverRow, requestRow, custodyRow, metrics, session });
      return json({
        success: true,
        version: "2.3",
        generatedAt: new Date().toISOString(),
        tenantId: undefined,
        health: available === Object.keys(sections).length ? "complete" : "partial",
        sections,
        operation: {
          today: metrics?.metrics || null,
          week: weekRow ? { completed: count(weekRow.completed), created: count(weekRow.created), todayCreated: count(weekRow.today_created), from: weekFrom, to: today } : null,
          month: monthMetrics?.metrics ? { from: monthFrom, to: monthTo, health: monthMetrics.health || null, metrics: monthMetrics.metrics } : null,
          drivers: driverRow ? { total: count(driverRow.total), active: count(driverRow.active) } : null,
          collaboration: requestRow ? { pendingForYou: count(requestRow.pending), pendingRequests: pendingRequestList.slice(0,5).map(r => ({ id:Number(r.id), missionId:Number(r.mission_id)||null, requesterName:String(r.requester_name||"Requester"), requesterType:String(r.requester_type||""), status:String(r.status||"Pending"), createdAt:r.created_at||null, updatedAt:r.updated_at||null })) } : null,
          custody: custodyRow ? { activeCases: count(custodyRow.count) } : null,
          marketplace: marketplaceRows ? { available: marketplaceRows.length } : null
        },
        intelligence: {
          focus: focus ? { available: Boolean(focus.available), missionId: focus.missionId || null, reference: focus.reference || "", priority: focus.priority || { level: "none", score: 0 }, reason: focus.focus?.reason || focus.attention?.reason || "" } : null,
          attention: attentionSummary,
          signals: engineSignals,
          events: Array.isArray(intelligence?.intelligence?.events) ? intelligence.intelligence.events.slice(0, 8) : []
        },
        analytics: {
          health: metrics?.health || null,
          signals: smartSignals.slice(0, 5),
          metrics: metrics?.metrics ? {
            completionRate: metrics.metrics.completionRate || null,
            overdueRate: metrics.metrics.overdueRate || null,
            exceptionRate: metrics.metrics.exceptionRate || null,
            averageMissionDurationMinutes: metrics.metrics.averageMissionDurationMinutes || null,
            statusDistribution: Array.isArray(metrics.metrics.statusDistribution) ? metrics.metrics.statusDistribution : [],
            dailyActivity: Array.isArray(metrics.metrics.dailyActivity) ? metrics.metrics.dailyActivity.slice(-30) : []
          } : null
        },
        decision
      });
    } catch (error) {
      const status = Number(error?.status) || 500;
      if (status >= 500) console.error("TENANT OVERVIEW ERROR", error);
      return json({ success: false, error: status === 500 ? "Tenant overview unavailable" : (error?.message || "Tenant overview unavailable") }, status);
    }
  });
}

function sectionState(result) {
  return result.status === "fulfilled" ? { status: "ready" } : { status: "unavailable" };
}
function count(v) { return Number(v || 0); }
function buildDecision({ focus, top, attentionSummary, smartSignals, driverRow, requestRow, custodyRow, metrics, session }) {
  const custodyCount = count(custodyRow?.count);
  if (custodyCount) return { level:"critical", title:`${custodyCount} custody handoff${custodyCount===1?"":"s"} needs action`, detail:"Physical responsibility is in transfer. Continue through the secured custody workspace so liveness and responsibility remain valid.", action:{label:"OPEN CUSTODY",module:"custody"} };
  if (top?.available && top.missionId) return {
    level: top.priority?.level || "high",
    title: `Mission ${top.reference || top.missionId} deserves attention`,
    detail: top.focus?.reason || top.attention?.reason || "Mission intelligence identified the highest-priority operational signal.",
    action: { label: "OPEN MISSION", href: operationalMissionHref(top.missionId,{role:session.role}) }
  };
  const critical = count(attentionSummary?.critical);
  const attention = count(attentionSummary?.attention);
  if (critical || attention) return {
    level: critical ? "critical" : "attention",
    title: `${critical || attention} operational signal${(critical || attention) === 1 ? "" : "s"} needs review`,
    detail: "Mission Intelligence and Attention have identified work that may require tenant action.",
    action: { label: "WATCH", area: "monitoring" }
  };
  const pending = count(requestRow?.pending);
  if (pending) return {
    level: "watch", title: `${pending} collaboration decision${pending === 1 ? " is" : "s are"} waiting`,
    detail: "Review pending ForYou requests before they become a coordination bottleneck.",
    action: { label: "OPEN FORYOU", module: "requests" }
  };
  const analyticAttention = (smartSignals || []).find(x => ["attention", "watch"].includes(x.level));
  if (analyticAttention) return { level: analyticAttention.level, title: analyticAttention.title, detail: analyticAttention.detail, action: { label: "UNDERSTAND", module: "analytics" } };
  if (metrics?.health === "partial") return { level: "watch", title: "Overview is partially informed", detail: "Some read-only analytical signals are temporarily unavailable.", action: { label: "RETRY", area: "overview" } };
  if (driverRow && count(driverRow.total) === 0) return { level: "watch", title: "Execution capacity is not configured", detail: "No tenant drivers are available yet.", action: { label: "OPEN DRIVERS", module: "drivers" } };
  return { level: "good", title: "Operation is stable", detail: "No higher-priority operational signal is currently asking for attention.", action: { label: "WATCH", area: "monitoring" } };
}
