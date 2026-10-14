import {isLifecycleTerminal} from "../../domains/logistics/logistics-lifecycle.contract.js";
/* ON Mission 10.29.49 — Canonical Capability Exposure & Action Convergence
 * Read-only capability bridge. It reconciles the canonical mission-flow next step
 * with the existing action registry/service map and the viewer-scoped action contract.
 * It never grants authorization or executes mutation.
 */
import {ACTION_REGISTRY} from "../../application/actions/action-registry.js";
import {ACTION_SERVICE_MAP,resolveActionTarget} from "../../application/actions/action-service-map.js";

export const CANONICAL_CAPABILITY_EXPOSURE_VERSION="1.0";
const EXPOSURE_STATES=new Set(["EXECUTABLE","NOT_EXPOSED","REQUIRES_VALIDATION","NOT_APPLICABLE","NOT_ESTABLISHED"]);

export function buildCanonicalCapabilityExposure({mission,flow,session={},availableActions=[]}={}){
  const f=flow||{}, next=f.next?.action||null;
  const status=String(mission?.status||f.status||"");
  const terminal=Boolean(f.terminal)||isLifecycleTerminal(status);
  if(terminal){
    return freeze({version:CANONICAL_CAPABILITY_EXPOSURE_VERSION,advisory:true,authoritative:false,missionId:Number(mission?.id||f.missionId||0)||null,exposureState:"NOT_APPLICABLE",code:null,label:null,viewerCanExecute:false,registered:false,routed:false,executable:false,action:null,reason:"The mission is terminal; no active execution capability is exposed.",authority:"SECURED SERVICES",safety:safety()});
  }
  if(!next){
    return freeze({version:CANONICAL_CAPABILITY_EXPOSURE_VERSION,advisory:true,authoritative:false,missionId:Number(mission?.id||f.missionId||0)||null,exposureState:"NOT_ESTABLISHED",code:null,label:null,viewerCanExecute:false,registered:false,routed:false,executable:false,action:null,reason:"The canonical mission flow does not currently expose a next lifecycle capability.",authority:"SECURED SERVICES",safety:safety()});
  }

  const code=String(next.code||"");
  const label=String(next.label||code);
  const registered=Boolean(ACTION_REGISTRY[code]);
  const route=ACTION_SERVICE_MAP[code]||null;
  const target=resolveActionTarget(code,{
    missionId:Number(mission?.id||f.missionId||0)||null,
    role:String(session.role||""),
    stateToken:Number(mission?.state_version||0)>0?`v:${Number(mission.state_version)}`:null
  });
  const matching=(Array.isArray(availableActions)?availableActions:[]).find(a=>String(a?.code||"")===code)||null;
  const viewerCanExecute=Boolean(f.next?.viewerCanExecute);
  const normalizedExecutable=Boolean(matching&&(matching?.target||matching?.executable||matching?.executionReady));
  let exposureState="NOT_EXPOSED",reason=`${label} is not currently exposed as an executable capability to this viewer.`;
  if(!registered||!route||!target){
    exposureState="REQUIRES_VALIDATION";
    reason=`${label} is the canonical next lifecycle step, but its capability route is incomplete and requires validation.`;
  }else if(viewerCanExecute&&normalizedExecutable){
    exposureState="EXECUTABLE";
    reason="The canonical next lifecycle capability is exposed to this viewer; the secured service must revalidate current truth and preconditions before mutation.";
  }else if(viewerCanExecute){
    exposureState="REQUIRES_VALIDATION";
    reason=`${label} is authorized by the canonical flow for this viewer, but the viewer-scoped action contract has not exposed an executable route yet.`;
  }

  const canonicalAction=freezeAction({
    code,label,domain:String(ACTION_REGISTRY[code]?.domain||route?.domain||"mission"),
    target,registered,routed:Boolean(route),
    executable:exposureState==="EXECUTABLE",executionReady:exposureState==="EXECUTABLE",
    requiredStatus:ACTION_REGISTRY[code]?.requiredStatus||null,
    nextStatus:ACTION_REGISTRY[code]?.nextStatus||route?.nextStatus||null,
    confirmation:Boolean(ACTION_REGISTRY[code]?.confirmation)
  });
  return freeze({version:CANONICAL_CAPABILITY_EXPOSURE_VERSION,advisory:true,authoritative:false,missionId:Number(mission?.id||f.missionId||0)||null,exposureState,code,label,viewerCanExecute,registered,routed:Boolean(route),executable:exposureState==="EXECUTABLE",action:canonicalAction,reason,authority:"SECURED SERVICES",safety:safety()});
}

export function validateCanonicalCapabilityExposure(c){
  const problems=[];
  if(!c?.missionId)problems.push("mission_id_missing");
  if(c?.advisory!==true)problems.push("capability_exposure_not_advisory");
  if(c?.authoritative!==false)problems.push("capability_exposure_claims_authority");
  if(!EXPOSURE_STATES.has(String(c?.exposureState||"")))problems.push("invalid_exposure_state");
  if(c?.executable!==true&&c?.exposureState==="EXECUTABLE")problems.push("executable_state_mismatch");
  if(c?.exposureState==="EXECUTABLE"&&!c?.code)problems.push("executable_without_code");
  if(c?.exposureState==="EXECUTABLE"&&!c?.action?.target)problems.push("executable_without_target");
  if(c?.safety?.createsAuthorization!==false||c?.safety?.executesAction!==false)problems.push("capability_mutation_boundary_violation");
  return [...new Set(problems)];
}

function freezeAction(a){return Object.freeze({...a,target:a.target?Object.freeze({...a.target}):null});}
function safety(){return Object.freeze({createsTruth:false,createsAuthorization:false,changesCustody:false,changesResponsibility:false,executesAction:false});}
function freeze(x){return Object.freeze(x);}
