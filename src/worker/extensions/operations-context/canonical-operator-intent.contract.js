/* ON Mission 10.29.52 — Unified Responsibility, Readiness & Operator Intent
 * Read-only presentation contract. It converges responsibility, canonical next step,
 * readiness, execution exposure and legitimate viewer actions into one operator intent.
 * It never creates truth, grants authorization, changes custody/responsibility or mutates.
 */
export const CANONICAL_OPERATOR_INTENT_VERSION="2.0";
const EXECUTABLE="EXECUTABLE";

export function buildCanonicalOperatorIntent({mission={},responsibility={},readiness={},capability={},availableActions=[],deniedActions=[]}={}){
  const terminal=Boolean(responsibility?.terminal)||String(readiness?.readiness?.state||"").toUpperCase()==="TERMINAL";
  const next=readiness?.next||{};
  const ready=String(readiness?.readiness?.state||"UNKNOWN").toUpperCase();
  const execution=String(readiness?.execution?.state||capability?.exposureState||"NOT_ESTABLISHED").toUpperCase();
  const responsible=responsibility?.responsible||{};
  const viewer=responsibility?.viewer||{};
  const actions=Array.isArray(availableActions)?availableActions.filter(Boolean):[];
  const legitimate=actions.filter(a=>!['open_mission','navigate'].includes(String(a.code||'').toLowerCase()));
  const nextLabel=String(next.label||next.code||"").trim()||null;
  const responsibleName=String(responsible.name||"").trim()||null;
  const actualWaiting=readiness?.waiting?.isActive===true && Boolean(readiness?.waiting?.condition);
  const waitingActorName=String(readiness?.waitingFor||readiness?.waiting?.actor?.name||"").trim()||null;
  const canExecute=execution===EXECUTABLE&&Boolean(viewer.canExecute)&&Boolean(next.code);
  const supportActions=legitimate.map(a=>String(a.code||"")).filter(Boolean);

  let state="OBSERVE",label="Observe current operational context",reason="Current canonical context does not establish an executable operator action.";
  if(terminal){state="OBSERVE";label="Observe the completed mission";reason="The mission is terminal; no further active execution belongs in this operator context.";}
  else if(canExecute){state="EXECUTE";label=nextLabel||"Execute the next valid step";reason=`${nextLabel||"The next lifecycle step"} is executable by this viewer after fresh secured-service validation.`;}
  else if(ready==="BLOCKED"||ready==="REVIEW"||execution==="REQUIRES_VALIDATION"){state="REVIEW";label="Review the current operational condition";reason=String(readiness?.readiness?.reason||capability?.reason||"Canonical execution readiness requires review.");}
  else if(actualWaiting){state="WAIT";label=waitingActorName?`Wait for ${waitingActorName}`:"Wait for the current condition";reason=String(readiness?.waiting?.condition?.label||readiness?.readiness?.reason||`The mission is waiting on a known operational condition.`);}
  else if(nextLabel&&responsibleName&&supportActions.length){state="SUPPORT";label=`Support ${responsibleName}`;reason=`${nextLabel} is the canonical next step and ${responsibleName} is responsible. This viewer cannot execute it, but legitimate support actions remain available.`;}
  else if(nextLabel&&responsibleName){state="SUPPORT";label=`Support ${responsibleName}`;reason=`${nextLabel} is the canonical next step and ${responsibleName} is responsible. This viewer cannot execute it, but legitimate support actions remain available.`;}
  else if(nextLabel){state="REVIEW";label="Review the next valid step";reason=String(readiness?.readiness?.reason||`The canonical next step is ${nextLabel}, but no active waiting condition is established.`);}

  const whatMustHappen=nextLabel||null;
  const whoMustAct=responsibleName||null;
  const whatViewerCanDo=supportActions.slice(0,8);
  const result={version:CANONICAL_OPERATOR_INTENT_VERSION,advisory:true,authoritative:false,missionId:Number(mission?.id||responsibility?.missionId||readiness?.missionId||0)||null,
    state,label,reason,
    impact:state==="EXECUTE"?"Immediate":state==="REVIEW"?"Immediate":state==="SUPPORT"?"Monitor":"Normal",
    canonical:Object.freeze({waiting:Object.freeze({isActive:Boolean(actualWaiting),actor:waitingActorName,condition:readiness?.waiting?.condition||null}),next:Object.freeze({code:next.code||null,label:nextLabel,actor:next.actor||responsible||null}),responsibility:Object.freeze({type:responsible.type||"UNASSIGNED",id:responsible.id||null,name:responsibleName,established:Boolean(responsible.established)}),readiness:Object.freeze({state:ready,reason:String(readiness?.readiness?.reason||"")}),execution:Object.freeze({state:execution,reason:String(readiness?.execution?.reason||capability?.reason||"")}),risk:readiness?.risk||null,liveness:readiness?.liveness||null}),
    operator:Object.freeze({viewerRole:viewer.role||null,viewerId:viewer.id||null,isResponsible:Boolean(viewer.isResponsible),canExecute:Boolean(canExecute),intent:state,whatMustHappen,whoMustAct,whatViewerCanDo:Object.freeze(whatViewerCanDo),deniedCount:Array.isArray(deniedActions)?deniedActions.length:0}),
    safety:Object.freeze({createsTruth:false,createsAuthorization:false,changesCustody:false,changesResponsibility:false,executesAction:false})};
  return Object.freeze(result);
}

export function validateCanonicalOperatorIntent(c){
  const p=[];
  if(!c?.missionId)p.push("mission_id_missing");
  if(c?.advisory!==true||c?.authoritative!==false)p.push("authority_boundary_violation");
  if(!["EXECUTE","SUPPORT","WAIT","REVIEW","OBSERVE"].includes(String(c?.state||"")))p.push("invalid_intent_state");
  if(c?.state==="EXECUTE"&&c?.operator?.canExecute!==true)p.push("execute_without_viewer_execution");
  if(c?.state==="EXECUTE"&&!c?.canonical?.next?.code)p.push("execute_without_next_step");
  if(c?.safety?.createsTruth!==false||c?.safety?.createsAuthorization!==false||c?.safety?.executesAction!==false)p.push("mutation_boundary_violation");
  return [...new Set(p)];
}
