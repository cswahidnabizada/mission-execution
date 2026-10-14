/* ON Mission 10.17.6-H4 — Intelligent Intent Dashboard
 * Presentation-only interpretation of authoritative read models.
 * It explains company state; it does not own truth, priority, authorization, or mutation.
 */
const text = value => String(value ?? "").trim();
const count = value => Math.max(0, Number(value || 0));

const REASON_GROUPS = Object.freeze([
  { keys:["exception:AddressProblem","address_problem"], label:"address problems", rank:1 },
  { keys:["exception:Damage","damage"], label:"damage reports", rank:1 },
  { keys:["exception:ReceiverMissing","receiver_missing"], label:"receiver issues", rank:1 },
  { keys:["overdue","deadline_expired","deadline_soon"], label:"deadlines needing attention", rank:2 },
  { keys:["assignment_required","execution_partner_unassigned"], label:"missions waiting for an executor", rank:2 },
  { keys:["pickup_late","pickup_waiting","loading_delay","unloading_delay"], label:"pickup or loading delays", rank:3 },
  { keys:["stale_progress","stale_location"], label:"progress that needs checking", rank:4 },
  { keys:["completion_pending"], label:"completions waiting to be closed", rank:4 },
  { keys:["traffic"], label:"traffic disruptions", rank:5 },
  { keys:["driver_situation"], label:"executor situations", rank:6 },
  { keys:["important_message"], label:"participant messages", rank:7 }
]);
function groupFor(reason){
  const code=text(reason?.code).toLowerCase(), label=text(reason?.label).toLowerCase();
  return REASON_GROUPS.find(g=>g.keys.some(k=>code===k.toLowerCase()||code.includes(k.toLowerCase())||label.includes(k.replaceAll("_"," ").toLowerCase())))||null;
}
function buildActNow(overview={}){
  const signals=Array.isArray(overview?.intelligence?.signals)?overview.intelligence.signals:[];
  const groups=new Map();
  for(const item of signals){
    for(const reason of (item?.reasons||[])){
      const g=groupFor(reason); if(!g) continue;
      const cur=groups.get(g.label)||{...g,count:0,examples:[],missionIds:new Set()};
      cur.count++; if(item?.missionId) cur.missionIds.add(Number(item.missionId));
      const detail=text(reason?.label); if(detail&&cur.examples.length<2) cur.examples.push(detail);
      groups.set(g.label,cur);
    }
  }
  const pending=count(overview?.operation?.collaboration?.pendingForYou);
  if(pending) groups.set("requests waiting for your decision",{label:"requests waiting for your decision",rank:0,count:pending,examples:[pending===1?"A collaboration decision is waiting.":"Collaboration decisions are waiting."],missionIds:new Set()});
  const custody=count(overview?.operation?.custody?.activeCases);
  if(custody) groups.set("custody handoffs needing attention",{label:"custody handoffs needing attention",rank:0,count:custody,examples:["A responsibility handoff is active."],missionIds:new Set()});
  if(!groups.size && overview?.decision?.level && !["good","neutral"].includes(String(overview.decision.level).toLowerCase())) {
    const d=overview.decision;
    groups.set("highest-priority operational issue",{label:"highest-priority operational issue",rank:0,count:1,examples:[text(d.detail)||text(d.title)||"Existing operational intelligence identified a condition requiring attention."],missionIds:new Set(d.action?.href && /mission=(\d+)/.test(d.action.href)?[Number(d.action.href.match(/mission=(\d+)/)[1])]:[]),decision:d});
  }
  return [...groups.values()].sort((a,b)=>a.rank-b.rank||b.count-a.count).slice(0,5).map(x=>{
    const label=text(x.label).toLowerCase();
    const actionType=label.includes("custody")?"custody":label.includes("request")?"request":label.includes("assignment")||label.includes("executor")?"assignment":label.includes("message")?"collaboration":label.includes("address")||label.includes("damage")||label.includes("receiver")||label.includes("traffic")||label.includes("delay")?"exception":"mission";
    const missionIds=[...x.missionIds].filter(Boolean);
    const contextKey={custody:"context:custody:mission",assignment:"context:execution",collaboration:"context:collaboration",exception:"context:exception",mission:"context:mission"}[actionType]||"context:mission";
    return {count:x.count,label:x.label,detail:x.examples[0]||"Existing operational intelligence identified work that needs attention.",href:actionType==="request"?"#operations?section=requests":(missionIds.length===1?`#operations?mission=${missionIds[0]}`:"#operations?section=attention"),rank:x.rank,missionId:missionIds.length===1?missionIds[0]:null,missionIds,actionType,contextKey,evidenceCount:x.count};
  });
}
function buildOverallStatement(overview={},actNow=[]){
  const decision=overview?.decision||{};
  const level=text(decision.level).toLowerCase();
  if(level==="critical") return {level:"critical",title:decision.title||"A critical issue is affecting the company now",detail:decision.detail||"The current operational intelligence shows a condition that can affect the company now."};
  if(level==="attention" || actNow.length) {
    const n=actNow.reduce((sum,x)=>sum+count(x.count),0);
    return {level:"attention",title:(n===1?"1 thing needs your attention":`${n} things need your attention`),detail:decision.detail||"The current operational picture shows work that may need a decision or intervention."};
  }
  if(count(overview?.operation?.collaboration?.pendingForYou)>0) return {level:"watch",title:"A few decisions are waiting",detail:"Requests are waiting for your response."};
  if(overview?.health==="partial") return {level:"watch",title:"Everything is not fully visible yet",detail:"Some information is temporarily unavailable; the dashboard will keep trying to refresh."};
  return {level:"good",title:"Everything is managed",detail:"No higher-priority operational condition is currently asking for your attention."};
}
function buildPerformance(overview={}){
  const metrics=overview?.operation?.month?.metrics||overview?.analytics?.metrics||{};
  const pct=(m)=>m?.value==null?null:Number(m.value);
  const completion=pct(metrics.completionRate);
  const overdue=pct(metrics.overdueRate);
  const exceptions=pct(metrics.exceptionRate);
  const duration=metrics.averageMissionDurationMinutes?.value;
  const rows=Array.isArray(metrics.statusDistribution)?metrics.statusDistribution:[];
  const topStatus=rows.slice().sort((a,b)=>Number(b.count||0)-Number(a.count||0))[0]||null;
  return Object.freeze({completion,overdue,exceptions,duration:Number.isFinite(Number(duration))?Number(duration):null,topStatus});
}
function buildCompanyPulse(overview={},actNow=[]){
  const p=buildPerformance(overview);
  const active=count(overview?.operation?.today?.activeMissions?.value ?? overview?.operation?.today?.active);
  const marketplace=count(overview?.operation?.marketplace?.available);
  const pending=count(overview?.operation?.collaboration?.pendingForYou);
  if(overview?.decision?.level==='critical') return {level:'critical',title:overview.decision.title||'A critical issue is affecting the company now',detail:overview.decision.detail||'A current operational condition needs attention now.'};
  if(actNow.length) return {level:'attention',title:`${actNow.reduce((s,x)=>s+count(x.count),0)} things need attention`,detail:actNow[0]?.detail||'The current operation has work that may need intervention.'};
  if(pending) return {level:'watch',title:`${pending} decision${pending===1?' is':'s are'} waiting`,detail:'Requests are waiting for a response.'};
  if(p.overdue>0) return {level:'watch',title:'The operation is moving, with some deadlines at risk',detail:`${p.overdue}% of deadline-eligible missions are overdue.`};
  if(active>0 && p.completion!=null) return {level:'good',title:'The operation is moving',detail:`${active} active mission${active===1?'':'s'} in progress${p.completion!=null?` · ${p.completion}% completed in the current view`:''}.`};
  if(marketplace>0) return {level:'good',title:'The operation is ready for more work',detail:`${marketplace} marketplace opportunit${marketplace===1?'y':'ies'} are currently available.`};
  return {level:'good',title:'Everything is managed',detail:'No higher-priority operational condition is currently asking for attention.'};
}
function buildIntentDashboardModel(overview={},marketplaceCount=0){
  const month=overview?.operation?.month||{}; const week=overview?.operation?.week||{}; const today=overview?.operation?.today||{};
  const active=count(month.metrics?.activeMissions?.value ?? today.activeMissions?.value ?? today.active);
  const completed=count(month.metrics?.completionRate?.numerator ?? month.metrics?.statusDistribution?.find?.(x=>String(x.status||"").toLowerCase()==="completed")?.count ?? week.completed);
  const todayCreated=count(today.missionVolume?.value ?? today.total ?? today.today ?? 0);
  const actNow=buildActNow(overview);
  return Object.freeze({version:"10.17.6-H9",presentationOnly:true,
    analytics:Object.freeze({completed,active,today:todayCreated,monthFrom:month.from||null,monthTo:month.to||null}),
    statement:Object.freeze(buildOverallStatement(overview,actNow)),
    pulse:Object.freeze(buildCompanyPulse(overview,actNow)),
    performance:buildPerformance(overview),
    actNow:Object.freeze(actNow),
    todoCount:actNow.reduce((s,x)=>s+count(x.count),0),marketplace:Object.freeze({available:count(overview?.operation?.marketplace?.available ?? marketplaceCount)})});
}
export { buildActNow, buildIntentDashboardModel, buildOverallStatement, buildPerformance, buildCompanyPulse };
