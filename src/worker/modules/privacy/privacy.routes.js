import {json,readJson} from '../../core/http.js';
import {requireSession} from '../../core/auth-session.js';
import {getPrivacyStatus,exportPersonalData,requestPrivacyRight,listPrivacyRequests} from './privacy.service.js';

export function registerPrivacyRoutes(router){
  router.get('/api/account/privacy',async({request,env})=>{try{const s=await requireSession(request,env);return json({success:true,privacy:await getPrivacyStatus(env,s)});}catch(e){return fail(e);}});
  router.get('/api/account/privacy/requests',async({request,env})=>{try{const s=await requireSession(request,env);return json({success:true,requests:await listPrivacyRequests(env,s)});}catch(e){return fail(e);}});
  router.post('/api/account/privacy/requests',async({request,env})=>{try{const s=await requireSession(request,env);const b=await readJson(request);return json({success:true,request:await requestPrivacyRight(env,s,b)},201);}catch(e){return fail(e);}});
  router.get('/api/account/privacy/export',async({request,env})=>{try{const s=await requireSession(request,env);const data=await exportPersonalData(env,s);const r=json({success:true,...data});r.headers.set('Content-Disposition','attachment; filename="onmission-personal-data.json"');return r;}catch(e){return fail(e);}});
}
function fail(e){const status=Number(e?.status)||(e?.message==='AUTH_REQUIRED'?401:500);return json({success:false,error:e?.message==='AUTH_REQUIRED'?'Authentication required':e?.message||'Privacy operation failed'},status);}
