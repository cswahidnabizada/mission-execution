import {canonicalFirst} from '../../core/canonical-db.js';
import {resolveMissionAccess} from "../../security/mission-access.js";
import {missionDataState} from "./feature-state/mission-data.provider.js";
import {assignmentState} from "./feature-state/assignment.provider.js";
import {exceptionsState} from "./feature-state/exceptions.provider.js";
import {deliveryProofState} from "./feature-state/delivery-proof.provider.js";
import {forYouState} from "./feature-state/foryou.provider.js";
import {networkState} from "./feature-state/network.provider.js";
import {messagingState} from "./feature-state/messaging.provider.js";
import {resolveUserSituation} from "../../security/user-situation.service.js";
import {resolveLifecycleForMission} from "../../security/sector-lifecycle.service.js";

async function custodyState(env,session,mission){
  const role=session?.role;
  const targetType=role==="driver"?"driver":role==="executor"?"executor":null;
  const targetId=role==="driver"?Number(session?.driverId||0):role==="executor"?Number(session?.executorId||0):0;
  if(!targetType||!targetId)return {pending:false};
  const row=await canonicalFirst(env,`SELECT id,status,target_type,target_id,recipient_type,recipient_id,transfer_channel,distribution_status FROM mission_custody_cases WHERE mission_id=? AND status='awaiting_acceptance' AND target_type=? AND target_id=? ORDER BY id DESC LIMIT 1`,[Number(mission.id),targetType,targetId],'mission_custody_authority');
  return {pending:Boolean(row),caseId:Number(row?.id||0)||null,status:row?.status||null,targetType:row?.target_type||null,targetId:Number(row?.target_id||0)||null,recipientType:row?.recipient_type||null,recipientId:Number(row?.recipient_id||0)||null,transferChannel:row?.transfer_channel||null,distributionStatus:row?.distribution_status||null,requirementId:null};
}

export async function buildActionContext(env,session,mission,conditions,{exceptions=[]}={}){
  const access=await resolveMissionAccess(env,session,Number(mission.id));
  if(!access){const e=new Error("Mission access lost");e.status=403;throw e;}

  const [assignment,deliveryProof,foryou,network,messaging,situation,custody]=await Promise.all([
    assignmentState(env,session,mission,conditions),
    deliveryProofState(env,access,mission),
    forYouState(env,session,mission),
    networkState(env,session,mission),
    messagingState(env,access,mission),
    resolveUserSituation(env,session),
    custodyState(env,session,mission),
    resolveLifecycleForMission(env,mission)
  ]);

  return Object.freeze({
    version:"1.1",
    missionId:Number(mission.id),
    missionData:missionDataState(mission),
    assignment,
    exceptions:exceptionsState(exceptions,session,access),
    deliveryProof,
    foryou,
    network,
    messaging,
    situation,
    custody,
    lifecycle
  });
}
