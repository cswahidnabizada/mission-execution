import { json,readJson } from '../../core/http.js';
import { createSession,requireRole,sessionCookie } from '../../core/auth-session.js';
import { identityToSession } from '../auth/auth.service.js';
import { registerExecutor,updateProfile } from './executors.service.js';
import { validateExecutorRegistration,validateExecutorProfile } from './executors.validator.js';
import * as execRepo from '../../repositories/executor.repository.js';
import {primeOperationalAccess} from '../../security/operational-gate.service.js';
export function registerExecutorRoutes(router){
  router.post('/api/executors/register',async({request,env})=>{try{
    const v=validateExecutorRegistration(await readJson(request));if(!v.valid)return json({success:false,error:v.error},400);
    const identity=await registerExecutor(env,request,v.value);const access=identityToSession({...identity,identity_type:'executor'});const {token,session}=await createSession(env,access);
    await primeOperationalAccess(env,token,session).catch(error=>console.error('OPERATIONAL_ACCESS_PRIME',error?.message||error));
    const response=json({success:true,...publicExecutorSession(session),next:'/app#account?activation=1'},201);response.headers.set('Set-Cookie',sessionCookie(token));return response;
  }catch(e){return json({success:false,error:e.message==='ACCOUNT_ALREADY_EXISTS'?'An account with this email already exists.':e.message||'Registration failed'},e.status||500);}});
  router.get('/api/executors/profile',async({request,env})=>{try{const s=await requireRole(request,env,['executor']);const p=await execRepo.findExecutorById(env,Number(s.executorId));return json({success:true,profile:safeExecutorProfile(p)});}catch(e){return fail(e);}});
  router.patch('/api/executors/profile',async({request,env})=>{try{const s=await requireRole(request,env,['executor']);const v=validateExecutorProfile(await readJson(request));if(!v.valid)return json({success:false,error:v.error},400);await updateProfile(env,s,v.value);return json({success:true});}catch(e){return fail(e);}});
  router.get('/api/executors/tenant-links',async({request,env,url})=>{try{const s=await requireRole(request,env,['admin']);const limit=Math.min(Math.max(Number(url.searchParams.get('limit'))||100,1),200),offset=Math.min(Math.max(Number(url.searchParams.get('offset'))||0,0),50000);const executors=await execRepo.listTenantExecutors(env,Number(s.tenantId),{limit:limit+1,offset});const hasMore=executors.length>limit;return json({success:true,executors:executors.slice(0,limit),hasMore,nextOffset:hasMore?offset+limit:null});}catch(e){return fail(e);}});
}
function publicExecutorSession(s){return {role:s.role,accessType:s.accessType,identityType:s.identityType,identityId:s.identityId,executorId:s.executorId,login:s.login,displayName:s.displayName,companyName:s.companyName||null,companyVerified:s.companyVerified===true,verificationComplete:s.verificationComplete===true,countryCode:s.countryCode||null,authMethod:s.authMethod};}
function fail(e){return json({success:false,error:e.message==='AUTH_REQUIRED'?'Authentication required':e.message||'Operation failed'},e.status||500);}

function safeExecutorProfile(p){
  if(!p)return null;
  return {
    id:Number(p.id),
    login:p.login||null,
    email:p.email||null,
    display_name:p.display_name||null,
    active:Number(p.active||0),
    last_login_at:p.last_login_at||null,
    created_at:p.created_at||null,
    updated_at:p.updated_at||null,
    registered_company_name:p.registered_company_name||null,
    company_category:p.company_category||null,
    working_cities:p.working_cities||[],
    working_zip_codes:p.working_zip_codes||[],
    mobile:p.mobile||null,
    description:p.description||null,
    vehicle_types:p.vehicle_types||[],
    website:p.website||null
  };
}
