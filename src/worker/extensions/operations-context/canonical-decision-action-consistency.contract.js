/* ON Mission 10.29.57 — Canonical Decision-to-Action Consistency
 * Read-only presentation contract. It explains the relationship between the
 * canonical mission need/lifecycle step and the viewer-scoped action surface.
 * It never grants authority, changes truth, responsibility, custody, or state.
 */
export const CANONICAL_DECISION_ACTION_CONSISTENCY_VERSION="1.0";
const EXECUTION=new Set(["confirm_arrival","confirm_pickup","start_transit","confirm_delivery","complete_mission","assign_driver","change_driver","reclaim_execution","accept_custody","reassign_custody_receiver","confirm_custody_release","finalize_custody_transfer","abort_custody_transfer","start_custody_resolution","start_custody_recovery"]);
function code(a){return String(a?.code||"").trim().toLowerCase()||null;}
function label(a){return String(a?.label||a?.experience?.label||a?.code||"").trim()||null;}
export function buildCanonicalDecisionActionConsistency({mission,decision,readiness,responsibility,operatorIntent,canonicalCapability,primaryAction,actionInventory}={}){
  const canonicalCode=String(readiness?.next?.code||canonicalCapability?.code||"").trim().toLowerCase()||null;
  const canonicalLabel=String(readiness?.next?.label||canonicalCapability?.label||canonicalCode||"No canonical next step");
  const primaryCode=code(primaryAction);
  const primaryLabel=label(primaryAction);
  const primaryKind=primaryCode?(EXECUTION.has(primaryCode)?"EXECUTION":"SUPPORT"):null;
  const canonicalExposed=canonicalCapability?.exposureState==="EXECUTABLE"||canonicalCapability?.exposed===true;
  const viewerCanExecute=Boolean(readiness?.execution?.state==="EXECUTABLE"||operatorIntent?.state==="EXECUTE");
  const actualWaiting=readiness?.waiting?.isActive===true;
  let relationship="NONE", explanation="No viewer action is currently established.";
  if(primaryCode&&canonicalCode&&primaryCode===canonicalCode){relationship=primaryKind==="EXECUTION"?"DIRECT_EXECUTION":"DIRECT_SUPPORT";explanation=`${primaryLabel} is the viewer action associated with the canonical lifecycle step ${canonicalLabel}.`}
  else if(primaryCode&&canonicalCode){relationship=primaryKind==="EXECUTION"?"ALTERNATIVE_EXECUTION":"SUPPORT_FOR_CANONICAL_STEP";explanation=primaryKind==="SUPPORT"?`${primaryLabel} is a viewer support/reassessment action; it does not replace the canonical lifecycle step ${canonicalLabel}.`:`${primaryLabel} is a viewer execution action distinct from the canonical lifecycle step ${canonicalLabel}; secured services must validate the current truth before execution.`}
  const expected=actualWaiting?"Re-read canonical truth when the waiting condition changes.":primaryKind==="SUPPORT"?`Complete ${primaryLabel}, then re-read canonical truth to determine whether ${canonicalLabel} becomes executable, responsibility changes, or another next step is established.`:"Re-read canonical truth after the secured action result and determine the next valid step.";
  const viewerActions=Number(actionInventory?.counts?.all||0);
  const result={version:CANONICAL_DECISION_ACTION_CONSISTENCY_VERSION,advisory:true,authoritative:false,missionId:Number(mission?.id||0)||null,
    decision:{state:String(decision?.state||"OBSERVE"),label:String(decision?.label||""),reason:String(decision?.reason||"")},
    missionNeed:Object.freeze({canonicalStepCode:canonicalCode,canonicalStepLabel:canonicalLabel,responsibleActor:responsibility?.responsible?.name||null,actualWaiting}),
    viewer:Object.freeze({intent:String(operatorIntent?.state||decision?.operatorIntent||"OBSERVE"),primaryCode,primaryLabel,primaryKind,actionCount:viewerActions,canExecute:viewerCanExecute}),
    relationship:Object.freeze({type:relationship,explanation,canonicalExposed}),
    reassessment:Object.freeze({expected,afterAction:true}),
    consistency:Object.freeze({decisionMatchesNeed:Boolean(canonicalCode||actualWaiting),viewerActionExplained:Boolean(primaryCode?relationship!=="NONE":true),canonicalLifecycleStepPreserved:true}),
    safety:Object.freeze({createsTruth:false,createsAuthorization:false,changesCustody:false,changesResponsibility:false,executesAction:false})};
  return Object.freeze(result);
}
export function validateCanonicalDecisionActionConsistency(c){const p=[];if(c?.advisory!==true||c?.authoritative!==false)p.push("authority_boundary_violation");if(c?.safety?.createsTruth!==false||c?.safety?.createsAuthorization!==false||c?.safety?.executesAction!==false)p.push("mutation_boundary_violation");if(c?.consistency?.canonicalLifecycleStepPreserved!==true)p.push("canonical_step_not_preserved");if(c?.viewer?.primaryCode&&!c?.relationship?.type)p.push("viewer_action_unexplained");return [...new Set(p)];}
