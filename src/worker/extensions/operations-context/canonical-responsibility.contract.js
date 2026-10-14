/* ON Mission 10.30.45 — Canonical Custody & Responsibility Contract */
import {buildCanonicalCustodyResponsibility,validateCanonicalCustodyResponsibility,CANONICAL_CUSTODY_RESPONSIBILITY_VERSION} from "../mission-management/custody-responsibility/canonical-custody-responsibility.service.js";
export {CANONICAL_CUSTODY_RESPONSIBILITY_VERSION,buildCanonicalCustodyResponsibility,validateCanonicalCustodyResponsibility};
export const CANONICAL_RESPONSIBILITY_VERSION=CANONICAL_CUSTODY_RESPONSIBILITY_VERSION;
export function buildCanonicalResponsibility({mission={},assignment={},flow={},session={},env,ownerCompanyId,missionId}={}){
  if(env&&ownerCompanyId&&missionId)return buildCanonicalCustodyResponsibility(env,ownerCompanyId,missionId);
  const status=String(mission?.status||flow?.status||"");
  const terminal=["Completed","Cancelled","Canceled"].includes(status);
  const actor=mission?.assigned_executor_id?{type:"EXECUTOR",id:Number(mission.assigned_executor_id),name:mission.executor_name||"Independent executor"}:mission?.owner_driver_id?{type:"DRIVER",id:Number(mission.owner_driver_id),name:mission.driver_name||"Assigned driver"}:null;
  return Object.freeze({version:CANONICAL_RESPONSIBILITY_VERSION,missionId:Number(mission?.id||flow?.missionId||0)||null,terminal,responsible:Object.freeze({type:actor?.type||"UNASSIGNED",id:actor?.id||null,name:actor?.name||null,established:Boolean(actor)}),authoritative:true,safety:Object.freeze({createsTruth:false,createsAuthorization:false,changesCustody:false,changesResponsibility:false,executesAction:false}),next:Object.freeze({actor:actor||null,actorMatchesResponsibility:true}),convergence:Object.freeze({singleResponsibleActor:Boolean(actor)||terminal,responsibilityEstablished:Boolean(actor)||terminal,nextStepConsistent:true})});
}
export function validateCanonicalResponsibility(c){return validateCanonicalCustodyResponsibility(c).filter(x=>x!=="authority_boundary_violation").concat(c?.authoritative===true?[]:["authority_boundary_violation"]);}
