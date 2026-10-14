import * as repo from "../../repositories/awareness.repository.js";
import {resolveMissionAccess} from "../../security/mission-access.js";

export async function markTargetNew(env,mission,target){
  const recipient=repo.recipientForTarget(target);
  if(!recipient)return;
  await repo.markMissionNew(env,{missionId:Number(mission.id),ownerCompanyId:Number(mission.company_id),recipient});
}
export async function markTenantNew(env,{missionId,ownerCompanyId,tenantId}){
  const recipient={key:`admin:${Number(tenantId)}`,role:"admin",tenantId:Number(tenantId)};
  await repo.markMissionNew(env,{missionId,ownerCompanyId,recipient});
}
export async function summary(env,session){
  const recipient=repo.recipientForSession(session);
  if(!recipient)return {active:0,newCount:0,latest:null};
  const [active,candidates]=await Promise.all([repo.activeCount(env,session),repo.unseenForRecipient(env,recipient.key,30)]);
  const authorized=[];
  for(const row of candidates){
    const access=await resolveMissionAccess(env,session,Number(row.mission_id));
    if(access)authorized.push(row);
  }
  return {active,newCount:authorized.length,latest:authorized[0]||null};
}
export async function acknowledgeMission(env,session,missionId){
  const access=await resolveMissionAccess(env,session,Number(missionId));
  if(!access){const e=new Error("Mission not found or access denied");e.status=404;throw e;}
  const recipient=repo.recipientForSession(session);
  if(recipient)await repo.acknowledge(env,missionId,recipient.key);
  return {missionId:Number(missionId)};
}
