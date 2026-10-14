import { authorityUnavailable } from '../../core/canonical-db.js';
import * as driverRepo from "../../repositories/driver.repository.js";
import * as authRepo from "../../repositories/auth.repository.js";
import { setDriverIdentity } from "../auth/auth.service.js";
import {revokeSessionsForDriver} from "../../core/auth-session.js";
import {setInitialProfile} from "./people-workspace.service.js";
import {annotateDriverPresence,clearDriverPresence} from "./people-presence.service.js";
// Historical guard vocabulary is preserved by the canonical User Situation: requireSubscriptionCapacity -> requireUserSituationCapacity.
import {requireUserSituationCapacity,requireUserSituationAction} from "../../security/user-situation.service.js";

async function assertDriverCanBeDeactivated(env,tenantId,driverId){
  const active=await env.DB.prepare(`
    SELECT m.id,m.reference,m.status,CASE WHEN a.assignment_type='owner_driver' THEN 'owner' ELSE 'shared' END AS assignment_kind
    FROM mission_assignments a
    JOIN mission_canonical_projection m ON m.id=a.mission_id AND m.company_id=a.company_id
    WHERE a.assignee_type='driver' AND a.assignee_id=? AND a.status='active' AND m.status IN ('PickedUp','InTransit')
      AND (a.assignment_type='owner_driver' AND a.company_id=? OR a.assignment_type='tenant_driver' AND a.assignee_company_id=?)
    LIMIT 1
  `).bind(Number(driverId),Number(tenantId),Number(tenantId)).first();
  if(active){
    const e=new Error(`DRIVER_ACTIVE_CUSTODY:${active.reference||active.id}`);e.status=409;throw e;
  }
  const pending=await env.DB.prepare(`
    SELECT m.id,m.reference
    FROM mission_custody_cases c
    JOIN mission_canonical_projection m ON m.id=c.mission_id AND m.company_id=c.company_id
    WHERE c.status='awaiting_acceptance' AND c.target_type='driver' AND c.target_id=?
    LIMIT 1
  `).bind(Number(driverId)).first();
  if(pending){
    const e=new Error(`DRIVER_PENDING_CUSTODY:${pending.reference||pending.id}`);e.status=409;throw e;
  }
}

export const listDrivers=async(env,tenantId,filters={})=>annotateDriverPresence(env,await driverRepo.listDrivers(env,tenantId,filters));
export async function createDriverWithCredentials(env,tenantId,data,session=null){ await requireUserSituationAction(env,session||{role:"admin",tenantId},"create_driver"); await requireUserSituationCapacity(env,session||{role:"admin",tenantId},"driver"); const id=await driverRepo.createDriver(env,tenantId,data.name); try{await setDriverIdentity(env,tenantId,id,data);await setInitialProfile(env,tenantId,id,{vehicleType:data.vehicleType,currentLocation:data.currentLocation});return id;}catch(e){await clearDriverPresence(env,tenantId,id);await driverRepo.removeDriverWithPolicy(env,tenantId,id,session?.identityId||null,"creation_rollback").catch(recoveryError=>{throw authorityUnavailable("driver_creation_rollback",recoveryError);});throw e;} }
export async function setExistingDriverCredentials(env,tenantId,driverId,data){ await setDriverIdentity(env,tenantId,driverId,data); await revokeSessionsForDriver(env,{tenantId,driverId}); return driverId; }
export async function updateDriverProfile(env,tenantId,driverId,{name}){ const d=await driverRepo.findDriver(env,tenantId,driverId); if(!d)throw Object.assign(new Error("DRIVER_NOT_FOUND"),{status:404}); await driverRepo.updateDriverName(env,tenantId,driverId,name); return driverRepo.findDriver(env,tenantId,driverId); }
export async function changeDriverState(env,tenantId,driverId,active){ const d=await driverRepo.findDriver(env,tenantId,driverId); if(!d)throw Object.assign(new Error("DRIVER_NOT_FOUND"),{status:404}); if(!active)await assertDriverCanBeDeactivated(env,tenantId,driverId); await driverRepo.setDriverActive(env,tenantId,driverId,active); await authRepo.setDriverIdentityActive(env,tenantId,driverId,active); if(!active)await revokeSessionsForDriver(env,{tenantId,driverId}); return {driverId,active}; }
export async function removeDriver(env,tenantId,driverId,actorIdentityId=null){ const d=await driverRepo.findDriver(env,tenantId,driverId); if(!d)throw Object.assign(new Error("DRIVER_NOT_FOUND"),{status:404}); await assertDriverCanBeDeactivated(env,tenantId,driverId); await revokeSessionsForDriver(env,{tenantId,driverId}); await clearDriverPresence(env,tenantId,driverId); const cleanup=await driverRepo.removeDriverWithPolicy(env,tenantId,driverId,actorIdentityId,"tenant_requested_removal"); return {driverId,name:d.name,cleanup,removed:true}; }
