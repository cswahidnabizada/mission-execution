import { ANALYTICS_VERSION, EXECUTION_CHANNELS, METRIC_DEFINITIONS, TERMINAL_STATUSES } from "./metrics.catalog.js";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 366;

export async function getCanonicalMissionMetrics(env, input = {}) {
  assertDb(env);
  const scope = normalizeScope(input);
  const governance = input.governance || null;

  const jobs = [
    ["core", () => getMissionSummary(env, scope)],
    ["duration", () => getAverageMissionDuration(env, scope)],
    ["flow", () => getAverageStageDuration(env, scope)],
    ["exceptions", () => getExceptionMetrics(env, scope)],
    ["network", () => getNetworkInvitationMetrics(env, scope)],
    ["foryou", () => getForYouMetrics(env, scope)],
    ["workforce", () => getMissionsPerExecutor(env, scope)],
    ["status", () => getStatusDistribution(env, scope)],
    ["activity", () => getDailyActivity(env, scope)]
  ];

  const settled = await Promise.allSettled(jobs.map(([, run]) => run()));
  const sections = {};
  for (let i = 0; i < jobs.length; i += 1) {
    const [name] = jobs[i];
    const result = settled[i];
    if (result.status === "fulfilled") {
      sections[name] = { status: "ready" };
    } else {
      sections[name] = { status: "unavailable", code: safeErrorCode(result.reason) };
      console.error("ANALYTICS SECTION ERROR", name, result.reason);
    }
  }

  const values = settled.map(result => result.status === "fulfilled" ? result.value : null);
  const [summary, duration, stageDuration, exceptions, invitations, foryou, executorRows, statusDistribution, dailyActivity] = values;
  const readyCount = Object.values(sections).filter(section => section.status === "ready").length;

  if (readyCount === 0) throw Object.assign(new Error("ANALYTICS_ALL_SECTIONS_UNAVAILABLE"), { status: 503 });

  const denominator = summary?.total ?? null;
  const deadlineDenominator = summary?.deadlineEligible ?? null;
  const metrics = {
    missionVolume: metric(METRIC_DEFINITIONS.missionVolume, summary?.total),
    activeMissions: metric(METRIC_DEFINITIONS.activeMissions, summary?.active),
    completionRate: metricWithRatio(METRIC_DEFINITIONS.completionRate, summary?.completed, denominator),
    overdueRate: metricWithRatio(METRIC_DEFINITIONS.overdueRate, summary?.overdue, deadlineDenominator),
    averageMissionDurationMinutes: duration
      ? { ...METRIC_DEFINITIONS.averageMissionDurationMinutes, value: duration.averageMinutes, completedCount: duration.completedCount, fallbackCount: duration.fallbackCount }
      : metric(METRIC_DEFINITIONS.averageMissionDurationMinutes, null),
    averageStageDurationMinutes: stageDuration
      ? { ...METRIC_DEFINITIONS.averageStageDurationMinutes, value: stageDuration.averageMinutes, transitionCount: stageDuration.transitionCount, invalidTransitionCount: stageDuration.invalidTransitionCount }
      : metric(METRIC_DEFINITIONS.averageStageDurationMinutes, null),
    exceptionRate: exceptions
      ? { ...METRIC_DEFINITIONS.exceptionRate, value: rate(exceptions.missionsWithException, denominator), numerator: exceptions.missionsWithException, denominator, exceptionCount: exceptions.exceptionCount }
      : metric(METRIC_DEFINITIONS.exceptionRate, null),
    networkInvitationAcceptanceRate: invitations
      ? { ...METRIC_DEFINITIONS.networkInvitationAcceptanceRate, value: rate(invitations.accepted, invitations.decided), numerator: invitations.accepted, denominator: invitations.decided, byStatus: invitations.byStatus, eligible: invitations.eligible }
      : metric(METRIC_DEFINITIONS.networkInvitationAcceptanceRate, null),
    missionsPerExecutor: executorRows ? { ...METRIC_DEFINITIONS.missionsPerExecutor, value: executorRows } : metric(METRIC_DEFINITIONS.missionsPerExecutor, null),
    foryouAcceptanceRate: foryou
      ? { ...METRIC_DEFINITIONS.foryouAcceptanceRate, value: rate(foryou.approved, foryou.decided), numerator: foryou.approved, denominator: foryou.decided, byStatus: foryou.byStatus, eligible: foryou.eligible }
      : metric(METRIC_DEFINITIONS.foryouAcceptanceRate, null),
    statusDistribution: statusDistribution || [],
    dailyActivity: dailyActivity || []
  };

  const smart = buildSmartSignals({ summary, exceptions, invitations, foryou, executorRows, denominator });
  const governedMetrics = Object.fromEntries(Object.entries(metrics).filter(([key]) => governance?.allowedMetricCodes?.includes(key) ?? true));
  return {
    version: ANALYTICS_VERSION,
    range: { from: scope.from, to: scope.to },
    generatedAt: new Date().toISOString(),
    health: readyCount === jobs.length ? "complete" : "partial",
    sections,
    metrics: governedMetrics,
    governance: governance ? { policyId: governance.policyId, purposeCode: governance.purposeCode, classification: governance.classification, retentionPolicyCode: governance.retentionPolicyCode, aggregationRequired: governance.aggregationRequired, minimized: governance.minimize, pseudonymized: governance.pseudonymize, exportAllowed: governance.exportAllowed, version: governance.version } : null,
    smart
  };
}

function metric(definition, value) { return { ...definition, value: value == null ? null : value }; }
function metricWithRatio(definition, numerator, denominator) {
  return { ...definition, value: rate(numerator, denominator), numerator: numerator == null ? null : numerator, denominator: denominator == null ? null : denominator };
}

function buildSmartSignals({ summary, exceptions, invitations, foryou, executorRows, denominator }) {
  const signals = [];
  const completion = denominator > 0 ? rate(summary?.completed, denominator) : null;
  const overdue = summary?.deadlineEligible > 0 ? rate(summary?.overdue, summary.deadlineEligible) : null;
  const exceptionRate = denominator > 0 ? rate(exceptions?.missionsWithException, denominator) : null;
  const pendingNetwork = Object.entries(invitations?.byStatus || {}).filter(([status]) => status.toLowerCase() === "pending").reduce((sum, [, value]) => sum + count(value), 0);
  const pendingForYou = Object.entries(foryou?.byStatus || {}).filter(([status]) => status.toLowerCase() === "pending").reduce((sum, [, value]) => sum + count(value), 0);
  const pending = pendingNetwork + pendingForYou;

  if (completion == null) signals.push({ priority: 2, level: "neutral", key: "completion_unknown", title: "Completion signal unavailable", detail: "There is not enough eligible mission data to calculate completion." });
  else if (completion < 80) signals.push({ priority: 1, level: "attention", key: "completion_low", title: "Completion needs attention", detail: `${completion}% of eligible missions are completed.` });
  else signals.push({ priority: 3, level: "good", key: "completion_healthy", title: "Mission flow is completing well", detail: `${completion}% of eligible missions are completed.` });

  if (overdue != null && overdue > 0) signals.push({ priority: overdue >= 20 ? 1 : 2, level: overdue >= 20 ? "attention" : "watch", key: "overdue", title: "Overdue work detected", detail: `${overdue}% of deadline-eligible missions are currently overdue.` });
  if (exceptionRate != null && exceptionRate > 10) signals.push({ priority: exceptionRate >= 20 ? 1 : 2, level: exceptionRate >= 20 ? "attention" : "watch", key: "exceptions", title: "Exception signal is elevated", detail: `${exceptionRate}% of eligible missions have at least one exception.` });
  if (pending > 0) signals.push({ priority: 2, level: "watch", key: "pending", title: "Decisions are waiting", detail: `${pending} network/ForYou requests remain pending.` });

  const ranked = (executorRows || []).slice().sort((a, b) => Number(b.missions || 0) - Number(a.missions || 0));
  if (ranked.length >= 3) {
    const high = Number(ranked[0].missions || 0);
    const low = Number(ranked[ranked.length - 1].missions || 0);
    if (low > 0 && high / low >= 3) signals.push({ priority: 2, level: "watch", key: "workload_imbalance", title: "Workload is uneven", detail: `${ranked[0].executorName} carries about ${Math.round(high / low)}× the missions of the lightest listed executor.` });
  }

  return signals.sort((a, b) => a.priority - b.priority).slice(0, 5);
}

async function getMissionSummary(env, scope) {
  const terminalSql = placeholders(TERMINAL_STATUSES.length);
  const sql = `SELECT COUNT(*) AS total,SUM(CASE WHEN status='Completed' THEN 1 ELSE 0 END) AS completed,SUM(CASE WHEN status NOT IN (${terminalSql}) THEN 1 ELSE 0 END) AS active,SUM(CASE WHEN status NOT IN (${terminalSql}) AND deadline_at_utc IS NOT NULL AND datetime(deadline_at_utc)<datetime('now') THEN 1 ELSE 0 END) AS overdue,SUM(CASE WHEN deadline_at_utc IS NOT NULL THEN 1 ELSE 0 END) AS deadline_eligible FROM mission_canonical_projection WHERE company_id=? AND mission_date IS NOT NULL AND date(mission_date)>=date(?) AND date(mission_date)<=date(?)`;
  const row = await env.DB.prepare(sql).bind(...TERMINAL_STATUSES, ...TERMINAL_STATUSES, scope.tenantId, scope.from, scope.to).first();
  return { total: count(row?.total), completed: count(row?.completed), active: count(row?.active), overdue: count(row?.overdue), deadlineEligible: count(row?.deadline_eligible) };
}

async function getAverageMissionDuration(env, scope) {
  const sql = `SELECT AVG(CASE WHEN COALESCE(h.completed_at,m.updated_at) IS NOT NULL AND julianday(COALESCE(h.completed_at,m.updated_at))>=julianday(m.created_at) THEN (julianday(COALESCE(h.completed_at,m.updated_at))-julianday(m.created_at))*1440 ELSE NULL END) AS average_minutes,COUNT(CASE WHEN COALESCE(h.completed_at,m.updated_at) IS NOT NULL AND julianday(COALESCE(h.completed_at,m.updated_at))>=julianday(m.created_at) THEN 1 END) AS completed_count,SUM(CASE WHEN m.status='Completed' AND h.completed_at IS NULL THEN 1 ELSE 0 END) AS fallback_count FROM mission_canonical_projection m LEFT JOIN (SELECT mission_id,MIN(created_at) AS completed_at FROM mission_status_history WHERE status='Completed' GROUP BY mission_id) h ON h.mission_id=m.id WHERE m.company_id=? AND m.mission_date IS NOT NULL AND date(m.mission_date)>=date(?) AND date(m.mission_date)<=date(?) AND m.status='Completed'`;
  const row = await env.DB.prepare(sql).bind(scope.tenantId, scope.from, scope.to).first();
  return { averageMinutes: nullableRounded(row?.average_minutes), completedCount: count(row?.completed_count), fallbackCount: count(row?.fallback_count) };
}

async function getAverageStageDuration(env, scope) {
  const sql = `SELECT h.mission_id,h.status,h.created_at,h.id FROM mission_status_history h JOIN mission_canonical_projection m ON m.id=h.mission_id AND m.company_id=? WHERE m.company_id=? AND m.mission_date IS NOT NULL AND date(m.mission_date)>=date(?) AND date(m.mission_date)<=date(?) ORDER BY h.mission_id ASC,h.created_at ASC,h.id ASC`;
  const result = await env.DB.prepare(sql).bind(scope.tenantId, scope.tenantId, scope.from, scope.to).all();
  let totalMinutes = 0, transitions = 0, invalid = 0; const byMission = new Map();
  for (const row of result?.results || []) { const list = byMission.get(Number(row.mission_id)) || []; list.push(row); byMission.set(Number(row.mission_id), list); }
  for (const history of byMission.values()) for (let i=1;i<history.length;i+=1) { const previous=history[i-1], current=history[i]; const minutes=durationMinutes(previous.created_at,current.created_at); if(minutes===null){invalid+=1;continue;} if(previous.status===current.status)continue; totalMinutes+=minutes;transitions+=1; }
  return { averageMinutes: transitions ? Math.round((totalMinutes/transitions)*100)/100 : null, transitionCount: transitions, invalidTransitionCount: invalid };
}

async function getExceptionMetrics(env, scope) { const sql=`SELECT COUNT(*) AS exception_count,COUNT(DISTINCT e.mission_id) AS missions_with_exception FROM mission_exceptions e JOIN mission_canonical_projection m ON m.id=e.mission_id AND m.company_id=e.company_id WHERE e.company_id=? AND m.mission_date IS NOT NULL AND date(m.mission_date)>=date(?) AND date(m.mission_date)<=date(?)`; const row=await env.DB.prepare(sql).bind(scope.tenantId,scope.from,scope.to).first(); return { exceptionCount:count(row?.exception_count),missionsWithException:count(row?.missions_with_exception)}; }
async function getNetworkInvitationMetrics(env, scope) { const sql=`SELECT ni.status AS invitation_status,COUNT(*) AS count FROM network_mission_invitations ni JOIN mission_canonical_projection m ON m.id=ni.mission_id AND m.company_id=ni.owner_company_id WHERE ni.owner_company_id=? AND m.mission_date IS NOT NULL AND date(m.mission_date)>=date(?) AND date(m.mission_date)<=date(?) GROUP BY ni.status`; const result=await env.DB.prepare(sql).bind(scope.tenantId,scope.from,scope.to).all(); const byStatus=Object.fromEntries((result?.results||[]).map(row=>[String(row.invitation_status),count(row.count)])); const decided=["Accepted","Rejected","Cancelled"].reduce((sum,status)=>sum+count(byStatus[status]),0); return {eligible:Object.values(byStatus).reduce((sum,value)=>sum+value,0),decided,accepted:count(byStatus.Accepted),byStatus}; }
async function getForYouMetrics(env, scope) { const sql=`SELECT r.status AS request_status,COUNT(*) AS count FROM public_mission_requests r JOIN mission_canonical_projection m ON m.id=r.mission_id AND m.company_id=r.company_id WHERE r.company_id=? AND m.mission_date IS NOT NULL AND date(m.mission_date)>=date(?) AND date(m.mission_date)<=date(?) GROUP BY r.status`; const result=await env.DB.prepare(sql).bind(scope.tenantId,scope.from,scope.to).all(); const byStatus=Object.fromEntries((result?.results||[]).map(row=>[String(row.request_status),count(row.count)])); const decided=["Approved","Declined","Revoked"].reduce((sum,status)=>sum+count(byStatus[status]),0); return {eligible:Object.values(byStatus).reduce((sum,value)=>sum+value,0),decided,approved:count(byStatus.Approved),byStatus}; }
async function getMissionsPerExecutor(env, scope) { const sql=`SELECT ma.assignee_id AS executor_id,COALESCE(CASE WHEN ma.assignee_type='driver' THEN d.name ELSE pei.display_name END,'Executor') AS executor_name,CASE WHEN ma.assignee_type='driver' THEN '${EXECUTION_CHANNELS.OWNER_DRIVER}' ELSE '${EXECUTION_CHANNELS.NETWORK_EXECUTOR}' END AS execution_channel,COUNT(m.id) AS missions,SUM(CASE WHEN m.status='Completed' THEN 1 ELSE 0 END) AS completed FROM mission_assignments ma JOIN mission_canonical_projection m ON m.id=ma.mission_id AND m.company_id=ma.company_id LEFT JOIN drivers d ON ma.assignee_type='driver' AND d.id=ma.assignee_id AND d.company_id=ma.assignee_company_id LEFT JOIN public_executor_identities pei ON ma.assignee_type='executor' AND pei.id=ma.assignee_id WHERE ma.company_id=? AND ma.status='active' AND m.mission_date IS NOT NULL AND date(m.mission_date)>=date(?) AND date(m.mission_date)<=date(?) GROUP BY ma.assignee_id,ma.assignee_type,d.name,pei.display_name`; const result=await env.DB.prepare(sql).bind(scope.tenantId,scope.from,scope.to).all(); return (result?.results||[]).map(row=>({executorId:Number(row.executor_id),executorName:String(row.executor_name||"Executor"),executionChannel:String(row.execution_channel),missions:count(row.missions),completed:count(row.completed)})); }
async function getStatusDistribution(env, scope) { const sql=`SELECT status,COUNT(*) AS count FROM mission_canonical_projection WHERE company_id=? AND mission_date IS NOT NULL AND date(mission_date)>=date(?) AND date(mission_date)<=date(?) GROUP BY status ORDER BY count DESC,status ASC`; const result=await env.DB.prepare(sql).bind(scope.tenantId,scope.from,scope.to).all(); return (result?.results||[]).map(row=>({status:String(row.status||"Unknown"),count:count(row.count)})); }
async function getDailyActivity(env, scope) { const sql=`SELECT date(mission_date) AS day,COUNT(*) AS total,SUM(CASE WHEN status='Completed' THEN 1 ELSE 0 END) AS completed,SUM(CASE WHEN status NOT IN ('Completed','Cancelled','Canceled') THEN 1 ELSE 0 END) AS active FROM mission_canonical_projection WHERE company_id=? AND mission_date IS NOT NULL AND date(mission_date)>=date(?) AND date(mission_date)<=date(?) GROUP BY date(mission_date) ORDER BY day ASC`; const result=await env.DB.prepare(sql).bind(scope.tenantId,scope.from,scope.to).all(); return (result?.results||[]).map(row=>({day:String(row.day||""),total:count(row.total),completed:count(row.completed),active:count(row.active)})); }

function normalizeScope(input) { const tenantId=Number(input.tenantId); if(!Number.isSafeInteger(tenantId)||tenantId<=0)throw new Error("INVALID_ANALYTICS_TENANT"); const today=new Date().toISOString().slice(0,10); const fallbackFrom=new Date(Date.now()-29*86400000).toISOString().slice(0,10); let from=validDate(input.from)?input.from:fallbackFrom; let to=validDate(input.to)?input.to:today; if(from>to)[from,to]=[to,from]; const days=(Date.parse(to)-Date.parse(from))/86400000; if(!Number.isFinite(days))throw new Error("INVALID_ANALYTICS_RANGE"); if(days>MAX_RANGE_DAYS)from=new Date(Date.parse(to)-MAX_RANGE_DAYS*86400000).toISOString().slice(0,10); return {tenantId,from,to}; }
function validDate(value){return ISO_DATE_RE.test(String(value||""))&&Number.isFinite(Date.parse(`${value}T00:00:00Z`));}
function durationMinutes(from,to){const a=Date.parse(String(from||"")),b=Date.parse(String(to||""));if(!Number.isFinite(a)||!Number.isFinite(b)||b<a)return null;return(b-a)/60000;}
function rate(numerator,denominator){const n=Number(numerator||0),d=Number(denominator||0);return d>0?Math.round((n/d)*10000)/100:null;}
function count(value){const n=Number(value||0);return Number.isFinite(n)&&n>=0?n:0;}
function nullableRounded(value){const n=Number(value);return Number.isFinite(n)?Math.round(n*100)/100:null;}
function placeholders(countValue){return Array.from({length:countValue},()=>"?").join(",");}
function safeErrorCode(error){const code=String(error?.code||error?.message||"ANALYTICS_SECTION_FAILED");return code.slice(0,80).replace(/[^A-Za-z0-9_\-]/g,"_");}
function assertDb(env){if(!env?.DB||typeof env.DB.prepare!=="function")throw new Error("ANALYTICS_DB_UNAVAILABLE");}
export { durationMinutes, normalizeScope, rate };
