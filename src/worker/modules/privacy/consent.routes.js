import {RELEASE_VERSION} from '../../core/release.js';
import {json,readJson} from '../../core/http.js';
import {requireSession} from '../../core/auth-session.js';
import {getConsentOverview,getConsentState,recordConsent} from './consent.service.js';

export function registerConsentRoutes(router){
  router.get('/api/account/consent',async({request,env})=>{try{const s=await requireSession(request,env);return json({success:true,version:RELEASE_VERSION,companyId:Number(s.tenantId||0)||null,consents:await getConsentOverview(env,s)});}catch(e){return fail(e);}});
  router.get(/^\/api\/account\/consent\/(?<purposeCode>[A-Za-z0-9_-]+)$/,async({request,env,params})=>{try{const s=await requireSession(request,env);return json({success:true,...await getConsentState(env,s,params.purposeCode)});}catch(e){return fail(e);}});
  router.post('/api/account/consent',async({request,env,requestId})=>{try{const s=await requireSession(request,env);const b=await readJson(request);return json({success:true,...await recordConsent(env,s,{purposeCode:b.purposeCode,action:b.action,requestId})});}catch(e){return fail(e);}});
}
const CONSENT_REQUIRED='CONSENT_REQUIRED';
function fail(e){return json({success:false,error:e?.message||'Consent operation failed',code:e?.code||null},Number(e?.status)||500);}
