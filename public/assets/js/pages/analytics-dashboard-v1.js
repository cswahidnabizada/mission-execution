import { api } from "../core/api.js";

let loaded = false;
let loading = false;

const $ = (selector) => document.querySelector(selector);

function todayLocal() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function defaultFrom() {
  const d = new Date(); d.setDate(d.getDate() - 29);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function number(value) { const n = Number(value); return Number.isFinite(n) ? n.toLocaleString() : "—"; }
function percent(value) { const n = Number(value); return Number.isFinite(n) ? `${Number.isInteger(n) ? n : n.toFixed(1)}%` : "—"; }
function minutes(value) { const n = Number(value); if (!Number.isFinite(n)) return "—"; if (n < 60) return `${Math.round(n)}m`; const h = Math.floor(n / 60); const m = Math.round(n % 60); return m ? `${h}h ${m}m` : `${h}h`; }
function escapeHtml(value) { return String(value ?? "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c])); }
function setFeedback(text, kind = "") { const el = $("#analyticsFeedback"); if (!el) return; el.className = `analytics-feedback ${kind}`.trim(); el.textContent = text; }
function sectionState(name) { return document.querySelector(`[data-analytics-section="${name}"]`); }
function markSection(name, state, detail = "") { const el = sectionState(name); if (!el) return; el.dataset.state = state; const badge = el.querySelector("[data-section-state]"); if (badge) { badge.textContent = state === "ready" ? "LIVE" : state === "unavailable" ? "UNAVAILABLE" : ""; badge.className = `analytics-section-state ${state}`; } const note = el.querySelector("[data-section-note]"); if (note && detail) note.textContent = detail; }

function setLoading(isLoading) {
  document.querySelectorAll("[data-analytics-value]").forEach(el => { if (isLoading) el.classList.add("is-loading"); else el.classList.remove("is-loading"); });
}

function renderMetric(id, value, formatter = number) { const el = $(`#${id}`); if (el) el.textContent = formatter(value); }

function render(data) {
  const m = data?.metrics || {};
  renderMetric("analyticsMissionVolume", m.missionVolume?.value);
  renderMetric("analyticsCompletionRate", m.completionRate?.value, percent);
  renderMetric("analyticsActiveMissions", m.activeMissions?.value);
  renderMetric("analyticsOverdueRate", m.overdueRate?.value, percent);
  renderMetric("analyticsMissionDuration", m.averageMissionDurationMinutes?.value, minutes);
  renderMetric("analyticsStageDuration", m.averageStageDurationMinutes?.value, minutes);
  renderMetric("analyticsExceptionRate", m.exceptionRate?.value, percent);
  renderMetric("analyticsNetworkRate", m.networkInvitationAcceptanceRate?.value, percent);
  renderMetric("analyticsForyouRate", m.foryouAcceptanceRate?.value, percent);

  const completionMeta = $("#analyticsCompletionMeta"); if (completionMeta) completionMeta.textContent = `${number(m.completionRate?.numerator)} completed / ${number(m.completionRate?.denominator)} eligible`;
  const overdueMeta = $("#analyticsOverdueMeta"); if (overdueMeta) overdueMeta.textContent = `${number(m.overdueRate?.numerator)} overdue / ${number(m.overdueRate?.denominator)} deadline eligible`;
  const durationBadge = $("#analyticsDurationBadge"); if (durationBadge) durationBadge.textContent = `${number(m.averageMissionDurationMinutes?.completedCount)} completed`;
  const networkDecided = $("#analyticsNetworkDecided"); if (networkDecided) networkDecided.textContent = number(m.networkInvitationAcceptanceRate?.denominator);
  const executorTotal = $("#analyticsExecutorTotal"); if (executorTotal) executorTotal.textContent = `${number((m.missionsPerExecutor?.value || []).reduce((sum, row) => sum + Number(row.missions || 0), 0))} assigned`;

  const sections = data?.sections || {};
  ["core","duration","flow","exceptions","network","foryou","workforce","status","activity"].forEach(name => markSection(name, sections[name]?.status || "unavailable"));
  renderStatusDistribution(m.statusDistribution, sections.status);
  renderDailyActivity(m.dailyActivity, sections.activity);
  renderExecutors(m.missionsPerExecutor?.value, sections.workforce);
  renderSmart(data.smart || [], data.health);
  renderHealth(data.health, sections);
}

function renderHealth(health, sections) {
  const badge = $("#analyticsDataHealth");
  const states = Object.values(sections || {});
  const unavailable = states.filter(s => s.status === "unavailable").length;
  if (badge) {
    badge.textContent = health === "complete" ? "COMPLETE" : unavailable ? `${unavailable} SECTION${unavailable === 1 ? "" : "S"} LIMITED` : "LIVE";
    badge.className = `analytics-health ${health === "complete" ? "healthy" : "watch"}`;
  }
}

function renderStatusDistribution(rows, section) {
  const list = $("#analyticsStatusDistribution");
  if (!list) return;
  if (section?.status === "unavailable") { list.innerHTML = `<div class="analytics-section-error"><b>Status data unavailable</b><span>Retry Analytics to reload this section.</span></div>`; return; }
  const items = Array.isArray(rows) ? rows : [];
  if (!items.length) { list.innerHTML = `<div class="analytics-empty">No mission activity in this period.</div>`; return; }
  const max = Math.max(1, ...items.map(item => Number(item.count || 0)));
  list.innerHTML = items.map(item => { const c = Number(item.count || 0); const width = Math.round(c / max * 100); return `<div class="analytics-status-row"><div><b>${escapeHtml(item.status || "Unknown")}</b><i><em style="width:${width}%"></em></i></div><strong>${number(c)}</strong></div>`; }).join("");
}

function renderDailyActivity(rows, section) {
  const list = $("#analyticsDailyActivity"); if (!list) return;
  if (section?.status === "unavailable") { list.innerHTML = `<div class="analytics-section-error"><b>Activity trend unavailable</b><span>The rest of Analytics can continue safely.</span></div>`; return; }
  const items = Array.isArray(rows) ? rows.slice(-14) : [];
  if (!items.length) { list.innerHTML = `<div class="analytics-empty">No mission activity in this period.</div>`; return; }
  const max = Math.max(1, ...items.map(item => Number(item.total || 0)));
  list.innerHTML = items.map(item => { const total = Number(item.total || 0); const completed = Number(item.completed || 0); const width = Math.round(total / max * 100); return `<div class="analytics-day-row"><span>${escapeHtml(String(item.day || "").slice(5))}</span><div class="analytics-day-track"><i style="width:${width}%"></i></div><strong>${number(total)}</strong><small>${number(completed)} done</small></div>`; }).join("");
}

function renderExecutors(rows, section) {
  const list = $("#analyticsExecutors"); if (!list) return;
  if (section?.status === "unavailable") { list.innerHTML = `<div class="analytics-section-error"><b>Workforce data unavailable</b><span>Mission KPIs remain available.</span></div>`; return; }
  const items = Array.isArray(rows) ? rows.slice().sort((a,b) => Number(b.missions||0)-Number(a.missions||0)).slice(0,8) : [];
  if (!items.length) { list.innerHTML = `<div class="analytics-empty">No executor workload in this period.</div>`; return; }
  const max = Math.max(1, ...items.map(item => Number(item.missions || 0)));
  list.innerHTML = items.map(item => { const missions = Number(item.missions||0); const width = Math.round(missions / max * 100); return `<div class="analytics-executor-row"><div class="analytics-executor-main"><b>${escapeHtml(item.executorName || "Executor")}</b><small>${escapeHtml(String(item.executionChannel || "").replaceAll("_", " "))}</small><i><em style="width:${width}%"></em></i></div><strong>${number(missions)}</strong><span>${number(item.completed)} done</span></div>`; }).join("");
}

function renderSmart(signals, health) {
  const list = $("#analyticsInsights");
  if (!list) return;
  const items = Array.isArray(signals) ? signals : [];
  if (!items.length) { list.innerHTML = `<div class="analytics-empty">No operational update requires attention in this period.</div>`; return; }
  list.innerHTML = items.map(item => `<article class="analytics-insight ${escapeHtml(item.level || "neutral")}"><span>${item.level === "good" ? "✓" : item.level === "attention" ? "!" : "·"}</span><div><b>${escapeHtml(item.title)}</b><p>${escapeHtml(item.detail)}</p></div></article>`).join("");
  const badge = $("#analyticsHealthBadge"); if (badge) { const level = items.some(x=>x.level === "attention") ? "ATTENTION" : items.some(x=>x.level === "watch") ? "WATCH" : health === "partial" ? "PARTIAL" : "HEALTHY"; badge.textContent = level; badge.className = `analytics-health ${level.toLowerCase()}`; }
}

async function load(force = false) {
  if (loading) return;
  const from = $("#analyticsFrom"); const to = $("#analyticsTo");
  if (!from.value) from.value = defaultFrom();
  if (!to.value) to.value = todayLocal();
  if (from.value > to.value) [from.value, to.value] = [to.value, from.value];
  loading = true; setLoading(true); setFeedback("Reading trusted operational data…", "is-loading");
  try {
    const response = await api(`/api/analytics/overview?from=${encodeURIComponent(from.value)}&to=${encodeURIComponent(to.value)}`);
    render(response.analytics || {});
    loaded = true;
    const a = response.analytics || {};
    setFeedback(`${a.health === "complete" ? "Live" : "Live with limited sections"} · ${a.range?.from || from.value} → ${a.range?.to || to.value} · refreshed ${new Date(a.generatedAt || Date.now()).toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"})}`, a.health === "complete" ? "is-ready" : "is-partial");
  } catch (error) {
    setFeedback(error?.message || "Analytics unavailable", "is-error");
  } finally { loading = false; setLoading(false); }
}

export async function loadInsightsSnapshot() {
  const host=document.querySelector("#tenantInsightsSignals"); if(!host)return;
  const health=document.querySelector("#tenantInsightsHealth");
  const set=(id,value)=>{const el=document.querySelector(id);if(el)el.textContent=value;};
  if(health)health.textContent="SYNC";
  host.innerHTML="<span>Reading tenant operational data…</span>";
  const to=todayLocal(),from=defaultFrom();

  // Overview is the main tenant view and is deliberately
  // used first. Analytics remains read-only and provides deeper detail, but Insights must never
  // become blank merely because one analytical section is unavailable.
  try {
    const fallback=await api(`/api/tenant/overview?date=${encodeURIComponent(to)}`);
    const m=fallback?.operation?.today||{};
    set("#insightSnapshotMissions",number(m.missionVolume?.value??m.total));
    set("#insightSnapshotCompletion",percent(m.completionRate?.value));
    set("#insightSnapshotActive",number(m.activeMissions?.value??m.active));
    set("#insightSnapshotOverdue",percent(m.overdueRate?.value));
    const signals=Array.isArray(fallback?.intelligence?.signals)?fallback.intelligence.signals.slice(0,3):[];
    host.innerHTML=signals.length
      ?signals.map(x=>`<span><b>${escapeHtml(x.reference||"Mission")}</b> · ${escapeHtml(x.reason||"Operational update")}</span>`).join("")
      :"<span>Operational data is available; no current insight.</span>";
    if(health)health.textContent=fallback?.health||"LIVE";
  } catch (overviewError) {
    // If the tenant projection itself is unavailable, try analytics directly.
    try {
      const response=await api(`/api/analytics/overview?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
      const a=response?.analytics||{},m=a.metrics||{};
      set("#insightSnapshotMissions",number(m.missionVolume?.value));
      set("#insightSnapshotCompletion",percent(m.completionRate?.value));
      set("#insightSnapshotActive",number(m.activeMissions?.value));
      set("#insightSnapshotOverdue",percent(m.overdueRate?.value));
      const signals=Array.isArray(a.smart)?a.smart.slice(0,3):[];
      host.innerHTML=signals.length?signals.map(x=>`<span class="${escapeHtml(x.level||"neutral")}"><b>${escapeHtml(x.title||"Insight")}</b> · ${escapeHtml(x.detail||"")}</span>`).join(""):"<span>No active insight for this period.</span>";
      if(health)health.textContent=a.health==="complete"?"LIVE":"PARTIAL";
    } catch (analyticsError) {
      try {
        const fallback=await api(`/api/missions?limit=50`);
        const rows=Array.isArray(fallback?.missions)?fallback.missions:[];
        const terminal=m=>["Completed","Cancelled","Canceled"].includes(String(m?.status||""));
        const completed=rows.filter(m=>String(m?.status||"")==="Completed").length;
        const active=rows.filter(m=>!terminal(m)).length;
        const overdue=rows.filter(m=>!terminal(m)&&m?.deadline_at_utc&&Date.parse(m.deadline_at_utc)<Date.now()).length;
        set("#insightSnapshotMissions",number(rows.length));
        set("#insightSnapshotCompletion",percent(rows.length?completed/rows.length*100:null));
        set("#insightSnapshotActive",number(active));
        set("#insightSnapshotOverdue",percent(rows.length?overdue/rows.length*100:null));
        host.innerHTML="<span>Operational data is available.</span>";
        if(health)health.textContent="PARTIAL";
      } catch (fallbackError) {
        set("#insightSnapshotMissions","—");
        set("#insightSnapshotCompletion","—");
        set("#insightSnapshotActive","—");
        set("#insightSnapshotOverdue","—");
        host.innerHTML=`<span>Insights unavailable right now. <button type="button" class="analytics-inline-retry" data-insights-retry>RETRY</button></span>`;
        if(health)health.textContent="UNAVAILABLE";
        console.warn("TENANT_INSIGHTS_LOAD_FAILURE",overviewError,analyticsError,fallbackError);
      }
    }
  }
  host.querySelector("[data-insights-retry]")?.addEventListener("click",()=>loadInsightsSnapshot());
}

function openAnalyticsWorkspace() {
  const module = $("#tenantAnalyticsModule"); if (!module) return;
  document.querySelectorAll(".tenant-dashboard-module").forEach(panel => { panel.classList.add("hidden"); panel.classList.remove("module-open"); });
  document.querySelectorAll("[data-tenant-module]").forEach(button => button.classList.remove("active"));
  module.classList.remove("hidden"); module.classList.add("module-open");
  document.querySelector('[data-tenant-module="analytics"]')?.classList.add("active");
  window.setTimeout(()=>module.scrollIntoView({behavior:"smooth",block:"nearest"}),0);
  requestAnimationFrame(() => load());
}

window.__onmissionOpenAnalytics = openAnalyticsWorkspace;

function init() {
  const module = $("#tenantAnalyticsModule"); if (!module) return;
  $("#analyticsApply")?.addEventListener("click", () => load(true));
  $("#analyticsRetry")?.addEventListener("click", () => load(true));
  window.addEventListener("onmission:tenant-module", event => {
    if(event.detail?.name === "analytics") { openAnalyticsWorkspace(); loadInsightsSnapshot(); }
  });
  window.addEventListener("tenant-area-changed", event => {
    if(event.detail?.name === "insights") loadInsightsSnapshot();
  });
  window.addEventListener("onmission:live-notifications", event => { const types = event.detail?.notifications || []; if (types.some(item => ["deadline_soon","mission_picked_up","mission_completed","mission_updated"].includes(item.type)) && !module.classList.contains("hidden")) load(true); });
}

document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", init) : init();
