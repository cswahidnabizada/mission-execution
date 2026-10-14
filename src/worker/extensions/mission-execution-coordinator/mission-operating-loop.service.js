/**
 * ON Mission 14.0 — Mission Operating Loop composition boundary.
 * Read/composition only. Canonical authorities remain owners of truth.
 */
import {canonicalFirst} from '../../core/canonical-db.js';
import {getMissionPlan} from '../mission-planning/mission-planning-authority.service.js';
import {getLatestMissionPlanEvaluation} from '../mission-planning/mission-plan-evaluation-authority.service.js';
import {assessSectorMissionContract} from '../../security/sector-mission-contract.service.js';
import {buildUniversalMissionContract,validateUniversalMissionContract,UNIVERSAL_MISSION_CONTRACT_VERSION} from '../mission-contract/mission-contract.service.js';
import {getCurrentMissionNextSituation} from '../../security/mission-continuity-authority.service.js';
import {getMissionOutcome} from '../../security/mission-outcome-authority.service.js';
import {certifyMissionJourney,MISSION_CERTIFICATION_VERSION} from './mission-certification.service.js';

export const MISSION_OPERATING_LOOP_VERSION='14.2.0';
const fail=(code,status=409)=>Object.assign(new Error(code),{code,status});

export async function getMissionOperatingLoop(env,{companyId,missionId}={}){
  const tenant=Number(companyId||0)||0,mid=Number(missionId||0)||0;
  if(!tenant||!mid)throw fail('MISSION_OPERATING_LOOP_CONTEXT_REQUIRED',400);
  const mission=await canonicalFirst(env,`SELECT * FROM missions WHERE id=? AND company_id=? LIMIT 1`,[mid,tenant],'mission_authority');
  if(!mission)throw fail('MISSION_NOT_FOUND_OR_ACCESS_DENIED',404);
  const sectorContract=await assessSectorMissionContract(env,{countryCode:mission.country_code||'ZZ',sectorCode:mission.sector_code||mission.capability_code||'general',scenarioCode:null,requireExecutionBoundary:false});
  const universalMissionContract=buildUniversalMissionContract({mission,sectorContract});
  const universalMissionContractValidation=validateUniversalMissionContract(universalMissionContract,{requireExecutionReady:false});
  const plan=await getMissionPlan(env,{companyId:tenant,missionId:mid});
  const evaluation=plan?.id?await getLatestMissionPlanEvaluation(env,{companyId:tenant,missionId:mid,planId:plan.id}):null;
  const [nextSituation,outcomes,certification]=await Promise.all([
    getCurrentMissionNextSituation(env,{companyId:tenant,missionId:mid}),
    getMissionOutcome(env,{companyId:tenant,missionId:mid}),
    certifyMissionJourney(env,{companyId:tenant,missionId:mid,profile:'JOURNEY'})
  ]);
  return Object.freeze({version:MISSION_OPERATING_LOOP_VERSION,missionCertificationVersion:MISSION_CERTIFICATION_VERSION,universalMissionContractVersion:UNIVERSAL_MISSION_CONTRACT_VERSION,missionId:mid,plan,evaluation,nextSituation:nextSituation||null,outcomes:Array.isArray(outcomes)?outcomes.slice(0,10):[],certification,universalMissionContract,universalMissionContractValidation,sectorContract:Object.freeze({matched:Boolean(sectorContract.matched),ready:Boolean(sectorContract.ready),sectorCode:sectorContract.sectorCode,countryCode:sectorContract.countryCode,scenarioCode:sectorContract.contract?.scenarioCode||null,scenarioId:sectorContract.contract?.id||null,version:sectorContract.contract?.version||null,failures:sectorContract.failures||[]})});
}
