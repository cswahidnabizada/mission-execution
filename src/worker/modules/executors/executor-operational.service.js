import * as repo from '../../repositories/executor-operational.repository.js';
import * as executorRepo from '../../repositories/executor.repository.js';
import {requireWorkTrust} from '../verification/verification.service.js';
const SITUATIONS=new Set(['Available','Driving','Traffic','Break','Unavailable']);
export async function executorSelf(env,session){
  const id=Number(session.executorId); const executor=await executorRepo.findExecutorById(env,id); if(!executor)throw make('EXECUTOR_NOT_FOUND',404);
  await repo.ensureProfile(env,id); return {executor:{id,name:executor.display_name},profile:await repo.getProfile(env,id)};
}
export async function updateExecutorSelf(env,session,data){
  await requireWorkTrust(env,session); const id=Number(session.executorId); const executor=await executorRepo.findExecutorById(env,id); if(!executor)throw make('EXECUTOR_NOT_FOUND',404);
  const out={};
  if(data.situation!==undefined){const s=clean(data.situation,32);if(!SITUATIONS.has(s))throw make('INVALID_SITUATION',400);out.situation=s;}
  if(data.currentLocation!==undefined)out.currentLocation=clean(data.currentLocation,180)||null;
  if(data.situationNote!==undefined)out.situationNote=clean(data.situationNote,300)||'';
  return repo.updateProfile(env,id,out);
}
function clean(v,n){return String(v??'').trim().replace(/[\u0000-\u001f\u007f]/g,'').slice(0,n)}
function make(message,status){const e=new Error(message);e.status=status;return e}
