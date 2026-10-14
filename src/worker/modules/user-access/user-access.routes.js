import {json,publicErrorMessage} from '../../core/http.js';
import {requireSession} from '../../core/auth-session.js';
import {getUserProgress,resolveUserClassification} from '../../security/user-access.service.js';
import {decideUserAuthorization} from '../../security/authorization-decision.service.js';
import {resolveActivation} from '../../security/activation.service.js';
import {getOperationalGateForRequest} from '../../security/operational-gate.service.js';

export function registerUserAccessRoutes(router){
  router.get('/api/user/classification',async({request,env})=>{
    try{const s=await requireSession(request,env);return json({success:true,classification:await resolveUserClassification(env,s)});}
    catch(e){return json({success:false,error:publicErrorMessage(e,'Unable to load user classification')},e.status||500);}
  });
  router.get('/api/user/progress',async({request,env})=>{
    try{const s=await requireSession(request,env);return json({success:true,progress:await getUserProgress(env,s)});}
    catch(e){return json({success:false,error:publicErrorMessage(e,'Unable to load user progress')},e.status||500);}
  });
  router.get('/api/user/activation',async({request,env})=>{
    try{const s=await requireSession(request,env);return json({success:true,activation:await resolveActivation(env,s)});}
    catch(e){return json({success:false,error:publicErrorMessage(e,'Unable to load activation status')},e.status||500);}
  });
  router.get('/api/user/operational-gate',async({request,env})=>{try{const s=await requireSession(request,env);return json({success:true,gate:await getOperationalGateForRequest(env,request,s)});}catch(e){return json({success:false,error:publicErrorMessage(e,'Unable to load operational gate')},e.status||500);}});
  router.get('/api/user/authorization',async({request,env})=>{
    try{
      const s=await requireSession(request,env);
      const url=new URL(request.url);
      const actionCode=String(url.searchParams.get('action')||'').trim().slice(0,120);
      const readiness=String(url.searchParams.get('readiness')||'action_ready').trim().slice(0,80)||'action_ready';
      if(!actionCode)return json({success:false,error:'Action code is required'},400);
      return json({success:true,authorization:await decideUserAuthorization(env,s,{actionCode,readiness})});
    }catch(e){return json({success:false,error:publicErrorMessage(e,'Unable to evaluate authorization')},e.status||500);}
  });
}
