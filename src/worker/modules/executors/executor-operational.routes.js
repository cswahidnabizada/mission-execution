import {json,readJson} from '../../core/http.js';
import {requireRole} from '../../core/auth-session.js';
import {audit} from '../../security/audit.js';
import {limitAction} from '../../security/action-limit.js';
import {executorSelf,updateExecutorSelf} from './executor-operational.service.js';
export function registerExecutorOperationalRoutes(router){
  router.get('/api/executor/me/operational',async({request,env})=>{try{const s=await requireRole(request,env,['executor']);await limitAction(env,s,'executor-self-read',{limit:60,windowSeconds:60});return json({success:true,overview:await executorSelf(env,s)});}catch(e){return fail(e);}});
  router.patch('/api/executor/me/operational',async({request,env})=>{try{const s=await requireRole(request,env,['executor']);await limitAction(env,s,'executor-self-update',{limit:20,windowSeconds:60});const profile=await updateExecutorSelf(env,s,await readJson(request));await audit(env,{session:s,action:'executor.self_status_updated',resourceType:'executor',resourceId:Number(s.executorId)});return json({success:true,profile});}catch(e){return fail(e);}});
}
function fail(e){const map={EXECUTOR_NOT_FOUND:'Executor not found',INVALID_SITUATION:'Choose a valid situation',TOO_MANY_ATTEMPTS:'Too many requests. Please wait briefly and try again.'};const status=e?.status||(e?.message==='AUTH_REQUIRED'?401:500);return json({success:false,error:map[e?.message]||e?.message||'Executor operational update failed'},status);}
