/* ON Mission 10.19.31 — Adaptive Action Flow & Outcome Intelligence */
export function buildAdaptiveActionFlow({action,decision=null,outcome=null,context=null}={}){
  const d=decision||{}; const code=String(action?.code||d.code||""); const label=String(d.label||action?.label||code||"Operational action");
  const safeNow=d.safeNow!==false; const evidence=Array.isArray(d.evidence)?d.evidence.slice(0,4):[]; const k=outcome?.kind||null;
  let stage="GUIDE",status="READY",reason=d.why||action?.reason||"Current operational context is ready for review.";
  if(!action){stage="REASSESS";status="NO_ACTION";reason="No authoritative action is currently established.";}
  else if(k==="success"){stage="REASSESS";status="SUCCESS";reason=outcome.message||"Action completed. Re-read canonical truth and determine the next valid step.";}
  else if(k==="stale"){stage="RECOMPUTE";status="STALE";reason=outcome.message||"The operational situation changed. Refresh before continuing.";}
  else if(k==="failure"){stage="RECOVER";status="FAILED";reason=outcome.message||"The action did not complete. Review the secured result and recovery path.";}
  else if(!safeNow){stage="PREPARE";status="REFRESH_REQUIRED";reason="A fresh operational re-check is required before execution.";}
  const after=k==="success"?"Verify canonical outcome → reassess → surface the next valid action":k==="stale"?"Refresh canonical context → recompute action ranking → present only currently valid actions":k==="failure"?"Inspect failure → surface the authorized recovery capability → verify again":d.next?.reason||"Execute through the secured service → verify outcome → reassess";
  return {stage,status,label,code,reason,evidence,confidence:d.confidence||"—",capability:d.capability||action?.capability||"Existing secured capability",safeNow,after,contextType:context?.kind||"mission",generatedAt:new Date().toISOString()};
}
export function classifyActionOutcome(error=null,{stale=false}={}){
  if(!error)return {kind:"success",message:"Action accepted. Re-reading canonical state…"};
  const message=String(error?.message||error||"Action failed");
  if(stale||/stale|state token|state_token|changed|refresh|version conflict|conflict/i.test(message))return {kind:"stale",message:"The operational context changed before completion. Refreshing and recomputing the action surface."};
  return {kind:"failure",message};
}
export function renderAdaptiveActionFlow(flow){
  if(!flow)return ""; const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
  const ev=flow.evidence.map(e=>typeof e==="string"?e:(e?.signal||e?.reason||e?.label||"")).filter(Boolean);
  return `<div class="new-action-flow-card status-${esc(flow.status.toLowerCase())}"><div class="new-action-flow-head"><div><span>ACTION FLOW</span><strong>${esc(flow.stage)} · ${esc(flow.label)}</strong><small>${esc(flow.reason)}</small></div><b>${esc(flow.status)}</b></div><div class="new-action-flow-grid"><div><small>Capability</small><strong>${esc(flow.capability)}</strong></div><div><small>Confidence</small><strong>${esc(flow.confidence)}</strong></div><div><small>Execution</small><strong>${flow.safeNow?"Fresh service validation":"Refresh required"}</strong></div><div><small>Outcome</small><strong>${flow.status==="SUCCESS"?"Accepted":flow.status==="FAILED"?"Recovery":flow.status==="STALE"?"Recompute":"Awaiting action"}</strong></div></div>${ev.length?`<div class="new-action-flow-evidence">${ev.map(x=>`<span>${esc(x)}</span>`).join("")}</div>`:""}<div class="new-action-flow-after"><small>AFTER ACTION</small><strong>${esc(flow.after)}</strong></div><small class="new-predictive-disclaimer">Guidance only · authorization, canonical truth and mutation remain owned by secured services.</small></div>`;
}
