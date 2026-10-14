import * as fileRepo from "../../repositories/file.repository.js";
import {missionInvariantState} from "./mission-invariants.service.js";

/**
 * Completion is blocked only by requirements that explicitly belong to the
 * completion domain. Mission-management requests such as location, traffic or
 * waiting are operational/advisory and must never prevent a Delivered mission
 * from closing.
 */
export async function completionGate(env,mission,{targetStatus="Completed"}={}){
  const companyId=Number(mission.company_id),missionId=Number(mission.id);
  const logistics=String(mission.sector_code||"logistics").toLowerCase()==="logistics";
  const [proof,exceptions,completionRequirements,custody,invariants]=await Promise.all([
    logistics&&Number(mission.delivery_proof_required??1)===1?fileRepo.findDeliveryProof(env,companyId,missionId):Promise.resolve({id:null}),
    env.DB.prepare(`SELECT COUNT(*) n FROM mission_exceptions WHERE company_id=? AND mission_id=? AND status='open'`).bind(companyId,missionId).first(),
    env.DB.prepare(`
      SELECT COUNT(*) n
      FROM mission_management_requirements
      WHERE company_id=? AND mission_id=? AND status='open' AND code LIKE 'completion_%'
    `).bind(companyId,missionId).first(),
    env.DB.prepare(`SELECT COUNT(*) n FROM mission_custody_cases WHERE company_id=? AND mission_id=? AND status IN ('open','awaiting_release','ready_to_transfer','awaiting_acceptance')`).bind(companyId,missionId).first(),
    missionInvariantState(env,mission)
  ]);

  const blockers=[];
  if(logistics && String(mission.status)!=="Delivered")blockers.push(block("not_delivered","Logistics missions must be Delivered before completion.","mission_status"));
  if(logistics && Number(mission.delivery_proof_required??1)===1&&!proof)blockers.push(block("delivery_proof_missing","Required delivery proof is missing.","delivery_proof"));
  if(Number(exceptions?.n||0)>0)blockers.push(block("open_exceptions","Resolve all open exceptions before completion.","exceptions"));
  if(Number(completionRequirements?.n||0)>0)blockers.push(block("open_completion_requirements","Complete all required completion confirmations.","completion"));
  if(Number(custody?.n||0)>0)blockers.push(block("custody_unresolved","Resolve the open custody case before completion.","custody"));
  for(const x of invariants.violations)blockers.push(block(`invariant:${x.code}`,x.message,"integrity"));

  return Object.freeze({
    allowed:blockers.length===0,
    blockers:Object.freeze(blockers),
    proofComplete:Boolean(!logistics||Number(mission.delivery_proof_required??1)!==1||proof),
    exceptionsComplete:Number(exceptions?.n||0)===0,
    requirementsComplete:Number(completionRequirements?.n||0)===0,
    custodyComplete:Number(custody?.n||0)===0,
    invariants
  });
}
function block(code,message,domain){return Object.freeze({code,message,domain});}
