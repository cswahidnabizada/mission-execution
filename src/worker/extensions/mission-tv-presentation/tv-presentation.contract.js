export const TV_PRESENTATION_VERSION="1.2";

const PRIMARY_PRIORITY=Object.freeze([
  "reactivate_mission",
  "approve_foryou",
  "accept_network_mission",
  "reclaim_execution",
  "withdraw_network",
  "withdraw_foryou",
  "share_current_location",
  "confirm_custody_release",
  "accept_custody",
  "finalize_custody_transfer",
  "resolve_traffic",
  "resolve_waiting",
  "capture_delivery_proof",
  "confirm_arrival",
  "confirm_pickup",
  "start_transit",
  "confirm_delivery",
  "complete_mission",
  "start_navigation",
  "navigate",
  "assign_driver"
]);

export function buildTvPresentation(item={}){
  const actions=(item.actions||[]).map(normalizeAction);
  const recoveryReview=isRecoveryReview(item);
  const presentable=actions.filter(a=>a.code!=="open_mission"||recoveryReview);
  const executionChoices=executionChoiceGroup(presentable);
  const primary=executionChoices.length?null:choosePrimary(presentable,{recoveryReview});
  // The TV row itself opens the mission, so OPEN is not repeated in overflow.
  // Recovery review is the exception: OPEN becomes the explicit safe primary action.
  const consumed=new Set(executionChoices.map(identity));
  const overflow=presentable.filter(a=>(!primary||identity(a)!==identity(primary))&&!consumed.has(identity(a)));
  const copy=compactCopy(item);
  return Object.freeze({
    version:TV_PRESENTATION_VERSION,
    line:copy.line,
    subline:copy.subline,
    primary:primary?Object.freeze(primary):null,
    choices:Object.freeze(executionChoices),
    overflow:Object.freeze(overflow),
    quiet:Boolean(!primary&&!executionChoices.length),
    maxVisibleActions:executionChoices.length||1
  });
}

export function compactActionLabel(code,label=""){
  const c=String(code||"");
  return ({
    assign_driver:"ASSIGN",change_driver:"CHANGE",share_foryou:"FOR YOU",withdraw_foryou:"CANCEL SHARE",
    share_network:"SEND",withdraw_network:"CANCEL SHARE",accept_network_mission:"ACCEPT",reclaim_execution:"TAKE BACK",
    approve_foryou:"APPROVE",decline_foryou_request:"DECLINE",
    cancel_mission:"CANCEL",reactivate_mission:"REACTIVATE",start_navigation:"NAVIGATE",
    navigate:"NAVIGATE",confirm_arrival:"ARRIVED",confirm_pickup:"PICKED UP",start_transit:"START",
    confirm_delivery:"DELIVERED",complete_mission:"COMPLETE",share_current_location:"SHARE",
    request_current_location:"REQUEST LOCATION",resolve_traffic:"TRAFFIC SOLVED",resolve_waiting:"WAITING OVER",
    capture_delivery_proof:"ADD PROOF",report_exception:"REPORT",message:"MESSAGE",open_mission:"OPEN",
    confirm_custody_release:"RELEASE",finalize_custody_transfer:"TRANSFER",accept_custody:"ACCEPT"
  })[c]||String(label||c||"OPEN").replace(/\s+MISSION$/i,"").toUpperCase();
}

function executionChoiceGroup(actions){
  const wanted=["assign_driver","share_foryou","share_network"];
  const found=wanted.map(code=>actions.find(a=>a.code===code)).filter(Boolean);
  if(found.length!==3)return [];
  return found.map(a=>Object.freeze({...a,label:a.code==="assign_driver"?"ASSIGN DRIVER":a.code==="share_foryou"?"PUBLISH FORYOU":"SEND"}));
}
function choosePrimary(actions,{recoveryReview=false}={}){
  for(const code of PRIMARY_PRIORITY){const found=actions.find(a=>a.code===code);if(found)return found;}
  if(recoveryReview){
    const open=actions.find(a=>a.code==="open_mission");
    if(open)return open;
  }
  // CANCEL MISSION remains secondary. OPEN is implicit in the clickable TV row
  // except when an explicit recovery review is the only safe continuation.
  return null;
}
function compactCopy(item){
  const ref=String(item.reference||item.missionId||"Mission"),headline=String(item.headline||""),detail=String(item.detail||"");
  if(isRecoveryReview(item))return {line:`${ref} · Recovery required`,subline:"Open mission to review"};
  if(/completion blocked/i.test(headline)||/completion blocker/i.test(headline))return {line:`${ref} · Completion blocked`,subline:compactDetail(detail)};
  if(/cancelled/i.test(headline))return {line:`${ref} · Cancelled`,subline:""};
  if(/shared in ForYou/i.test(headline))return {line:`${ref} · In ForYou`,subline:"Waiting for request"};
  if(/requested Mission/i.test(headline)){const who=headline.split(" requested Mission")[0]||"Requester";return {line:`${ref} · ${who} requested`,subline:""};}
  if(/sent to .*waiting for acceptance/i.test(headline)){const m=headline.match(/sent to (.*?) and waiting/i);return {line:`${ref} · Sent to ${m?.[1]||"partner"}`,subline:"Waiting for acceptance"};}
  if(/will execute Mission/i.test(headline)){const who=headline.split(" will execute Mission")[0]||"Partner";return {line:`${ref} · ${who} executing`,subline:/No driver assigned/i.test(detail)?"No driver yet":""};}
  if(/not assigned to an executor/i.test(headline))return {line:`${ref} · No executor`,subline:""};
  if(/Mission .* · /i.test(headline)){const tail=headline.split(" · ").slice(1).join(" · ");return {line:`${ref} · ${sentenceCase(tail)}`,subline:""};}
  if(/waiting for/i.test(headline)){const m=headline.match(/waiting for (.*)$/i);return {line:`${ref} · Waiting`,subline:m?.[1]||""};}
  const short=stripMissionPrefix(headline,ref);return {line:short?`${ref} · ${sentenceCase(short)}`:ref,subline:""};
}
function normalizeAction(a){return Object.freeze({...a,label:compactActionLabel(a.code,a.label)});}
function isRecoveryReview(item={}){
  return String(item.code||"")==="mission_intelligence_recovery"||/recovery review required|recovery required/i.test(String(item.headline||item.label||""));
}
function compactDetail(value){
  const s=String(value||"").trim().replace(/\s+/g," ");
  if(!s)return "";
  return s.length>72?`${s.slice(0,69).trim()}…`:s;
}
function identity(a){return [a.code,a.kind,a.endpoint,a.href,a.missionId,a.requirementId].join("|");}
function stripMissionPrefix(text,ref){return String(text||"").replace(new RegExp(`^Mission\\s+${escapeRegExp(ref)}\\s*`,"i"),"").replace(/^[·:\-\s]+/,"").trim();}
function sentenceCase(v){const s=String(v||"").trim().toLowerCase();return s?s[0].toUpperCase()+s.slice(1):"";}
function escapeRegExp(v){return String(v).replace(/[.*+?^${}()|[\]\\]/g,"\\$&");}
