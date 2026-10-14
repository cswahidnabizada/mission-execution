/* ON Mission 10.19.30 — Adaptive Action Orchestration
 * Read-only presentation decision layer. It ranks an existing authoritative
 * action contract using current evidence. It never authorizes or executes.
 */
export const ADAPTIVE_ACTION_ORCHESTRATION_VERSION="1.0.0";
const EXECUTABLE_CONTEXTS=new Set(["api","mission_status","ui"]);
const clamp=(v,min=0,max=100)=>Math.max(min,Math.min(max,Number(v)||0));
const text=v=>String(v??"").trim(); const lower=v=>text(v).toLowerCase();
export function buildAdaptiveActionOrchestration({mission=null,unified=null,availableActions=[],predictive=null,orchestration=null,closedLoop=null,exceptions=[]}={}){
 const actions=dedupe([unified?.primary,...(unified?.utilities||[]),...(availableActions||[])].filter(Boolean));
 const ranked=actions.map(action=>scoreAction(action,{mission,predictive,orchestration,closedLoop,exceptions})).sort((a,b)=>b.score-a.score);
 const primary=ranked[0]||null, status=text(mission?.status||unified?.status||"Pending");
 const terminal=Boolean(unified?.terminal||["completed","cancelled","canceled"].includes(lower(status)));
 return Object.freeze({version:ADAPTIVE_ACTION_ORCHESTRATION_VERSION,missionId:Number(mission?.id||unified?.missionId||0)||null,stateToken:unified?.stateToken||null,
  decision:primary?Object.freeze({code:primary.action.code,label:primary.action.label||primary.action.code,why:primary.why,evidence:Object.freeze(primary.evidence),confidence:confidence(primary.score),score:primary.score,capability:primary.action.domain||"operations",safeNow:primary.safeNow,readiness:primary.readiness,next:afterAction(primary.action)}):Object.freeze({code:null,label:"Observe",why:terminal?"Mission is terminal; no mutation should be presented as the current action.":"No executable action is currently established.",evidence:[],confidence:"LOW",score:0,capability:"operations",safeNow:false,readiness:"WAITING",next:{state:"REASSESS",reason:"Re-read authoritative state when the operational situation changes."}}),
  alternatives:Object.freeze(ranked.slice(1,7).map(x=>Object.freeze({code:x.action.code,label:x.action.label||x.action.code,why:x.why,evidence:Object.freeze(x.evidence),confidence:confidence(x.score),safeNow:x.safeNow,readiness:x.readiness}))),
  suppressed:Object.freeze(ranked.filter(x=>!x.safeNow).slice(0,8).map(x=>Object.freeze({code:x.action.code,label:x.action.label||x.action.code,reason:x.suppressionReason||"Requires fresh authoritative validation."}))),terminal,source:"existing-unified-action-contract"});
}
function scoreAction(action,{mission,predictive,orchestration,closedLoop,exceptions}){
 const code=text(action.code); let score=35,evidence=[],why="Current authoritative action context.";
 const risk=lower(predictive?.riskLevel||predictive?.level||""); const sig=lower(orchestration?.significance?.level||""); const loop=lower(closedLoop?.state||"");
 const blob=JSON.stringify({mission,predictive,orchestration,exceptions}).toLowerCase(); const blocked=/(blocked|breach|overdue|exception|escalat|stale|deadline)/.test(blob); const hasException=Array.isArray(exceptions)&&exceptions.length>0;
 const deadline=mission?.deadline_at_utc||mission?.deadline_at||mission?.deadlineAt; const hours=deadline?((Date.parse(deadline)-Date.now())/3600000):Infinity;
 if(code==="assign_driver"||code==="change_driver"){if(!mission?.owner_driver_id&&!mission?.driverId){score+=32;evidence.push("executor is not currently assigned");why="Execution responsibility needs a valid owner now.";}if(/high|critical/.test(risk)){score+=18;evidence.push(`predictive risk is ${risk}`);}}
 if(code.includes("custody")){if(/custody/.test(blob)||hasException){score+=30;evidence.push("custody/exception context is active");why="Physical responsibility requires the next custody-safe step.";}}
 if(code==="edit_mission_data"||code==="review_completion_blocker"){if(/missing|required|incomplete/.test(blob)){score+=34;evidence.push("required operational data or completion requirements need attention");why="The mission cannot progress safely until the requirement is resolved.";}}
 if(["confirm_arrival","confirm_pickup","start_transit","confirm_delivery","complete_mission"].includes(code)){score+=/(actionable|ready|in_transit|arriv|pickup|deliver)/.test(blob)?24:8;if(hours<24){score+=12;evidence.push("deadline window is approaching");}}
 if(code==="report_exception"||code==="resolve_exception"){if(hasException||blocked){score+=26;evidence.push("attention/exception signal is present");why=code==="resolve_exception"?"An existing exception can be resolved if its current truth permits it.":"A new exception should be recorded before the operation drifts further.";}}
 if(code==="request_current_location"&&blocked){score+=16;evidence.push("operational freshness may be insufficient");}
 if(code.includes("network")||code.includes("foryou")||code.includes("assign")){if(/capacity|network|pressure|shortage/.test(blob)){score+=14;evidence.push("capacity/network pressure supports this capability");}}
 if(sig==="critical"||sig==="high"){score+=10;evidence.push(`operational significance is ${sig}`);}
 if(loop.includes("verify")){score-=18;evidence.push("closed-loop verification is pending");why="Verification should complete before presenting another mutation.";}
 if(action.confirmation)score-=2;
 const targetKind=lower(action.target?.kind||""); const safeNow=EXECUTABLE_CONTEXTS.has(targetKind)&&Boolean(action.stateToken||mission?.state_version);
 return {action,score:clamp(score),evidence:evidence.length?evidence:[text(action.reason||action.experience?.hint||"Current authoritative action.")],why,safeNow,readiness:safeNow?"READY_FOR_SERVICE_RECHECK":"REVIEW",suppressionReason:safeNow?null:"Action context lacks a fresh state token or executable target; refresh before acting."};
}
function confidence(score){return score>=78?"HIGH":score>=58?"MEDIUM":"LOW";}
function afterAction(action){const code=text(action?.code);if(code.includes("assign")||code.includes("driver"))return {state:"VERIFY_ASSIGNMENT",reason:"Re-read assignment and mission truth, then reassess the next valid step."};if(code.includes("custody"))return {state:"VERIFY_CUSTODY",reason:"Re-read custody responsibility and confirm the physical handoff state before continuing."};if(code==="confirm_delivery")return {state:"VERIFY_DELIVERY",reason:"Re-read delivery proof and canonical mission state before completion."};if(code==="complete_mission")return {state:"VERIFY_TERMINAL",reason:"Confirm the mission is canonically completed."};return {state:"VERIFY_AND_REASSESS",reason:"Re-read canonical truth and determine the next valid action."};}
function dedupe(xs){const seen=new Set();return xs.filter(a=>a?.code&&!seen.has(a.code)&&seen.add(a.code));}
