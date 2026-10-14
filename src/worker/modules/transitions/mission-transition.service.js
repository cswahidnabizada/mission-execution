/**
 * Canonical mission lifecycle write primitive.
 * Policy and authorization remain in domain services; this module only owns
 * compare-and-set status mutation plus the canonical status-history write.
 */
import {resolveLifecycleForNewMission,assertLifecycleTransition,normalizeLifecycleState} from "../../security/sector-lifecycle.service.js";

export async function initializeMissionLifecycle(env,{companyId,missionId,status="Pending"}={}){
  const owner=Number(companyId),id=Number(missionId);
  const requestedState=String(status||"").trim();
  if(!owner||!id||!requestedState)throw make("Invalid mission lifecycle initialization input",400);
  const mission=await env.DB.prepare(`SELECT id,status,country_code,sector_code,product_definition_id,lifecycle_definition_id,lifecycle_state_code FROM missions WHERE id=? AND company_id=? LIMIT 1`).bind(id,owner).first();
  if(!mission)throw make('Mission not found during lifecycle initialization',404);
  let lifecycle;
  if(mission.lifecycle_definition_id) lifecycle=await env.DB.prepare(`SELECT id,initial_state_code FROM platform_lifecycle_definitions WHERE id=? LIMIT 1`).bind(Number(mission.lifecycle_definition_id)).first();
  if(!lifecycle){
    const resolved=await resolveLifecycleForNewMission(env,owner);
    lifecycle=resolved.definition;
    await env.DB.prepare(`UPDATE missions SET country_code=?,sector_code=?,product_definition_id=?,lifecycle_definition_id=?,lifecycle_state_code=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=? AND lifecycle_definition_id IS NULL`).bind(resolved.countryCode,resolved.sectorCode,resolved.productDefinitionId,resolved.definition.id,resolved.definition.initialStateCode,id,owner).run();
  }
  const state=normalizeLifecycleState(mission.lifecycle_state_code||lifecycle?.initial_state_code||requestedState);
  const result=await env.DB.prepare(`INSERT INTO mission_status_history(mission_id,status) SELECT ?,? WHERE EXISTS(SELECT 1 FROM missions WHERE id=? AND company_id=? AND status=?)`).bind(id,requestedState,id,owner,requestedState).run();
  return Object.freeze({recorded:Number(result?.meta?.changes||0)===1,status:requestedState,lifecycleDefinitionId:Number(lifecycle?.id||0)||null,lifecycleState:state});
}

export async function transitionMissionStatus(env,{companyId,missionId,expectedStatus,nextStatus,statements=[],lockToken=null}={}){
  const owner=Number(companyId),id=Number(missionId);
  const from=String(expectedStatus||"").trim(),to=String(nextStatus||"").trim();
  if(!owner||!id||!from||!to)throw make("Invalid mission transition input",400);
  const mission=await env.DB.prepare(`SELECT * FROM missions WHERE id=? AND company_id=? LIMIT 1`).bind(id,owner).first();
  if(!mission)throw make('Mission not found',404);
  const lifecycleCheck=await assertLifecycleTransition(env,mission,mission.lifecycle_state_code||from,to);
  const nextLifecycleState=normalizeLifecycleState(to);
  const statusUpdate=env.DB.prepare(`UPDATE missions SET status=?,lifecycle_state_code=?,state_version=state_version+1,status_changed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=? AND status=? AND (? IS NULL OR state_lock_token=?)`).bind(to,nextLifecycleState,id,owner,from,lockToken,lockToken);
  const history=env.DB.prepare(`INSERT INTO mission_status_history(mission_id,status) SELECT ?,? WHERE EXISTS(SELECT 1 FROM missions WHERE id=? AND company_id=? AND status=?)`).bind(id,to,id,owner,to);
  const result=await env.DB.batch([statusUpdate,...(Array.isArray(statements)?statements:[]),history]);
  const changed=Number(result?.[0]?.meta?.changes||0)===1;
  return Object.freeze({changed,from,to});
}
function make(message,status){const e=new Error(message);e.status=status;return e;}
