import {json,readJson} from '../../core/http.js';
import {requirePlatformAdministrator} from '../../security/platform-administrator.js';
import {requirePlatformSuperAdminStepUp} from '../../security/platform-super-administrator.js';
import {getCertificationEnvironment,provisionCertificationEnvironment,resetCertificationEnvironment} from './certification-environment.service.js';

export function registerCertificationEnvironmentRoutes(router){
  router.get('/api/platform/admin/certification/environment',async({request,env})=>{
    try{await requirePlatformAdministrator(request,env);return json({success:true,environment:await getCertificationEnvironment(env)});}
    catch(e){return json({success:false,error:e?.message||'Certification environment unavailable',code:e?.code||'CERTIFICATION_ENVIRONMENT_UNAVAILABLE'},e?.status||500);}
  });
  router.post('/api/platform/admin/certification/environment/provision',async({request,env})=>{
    try{const admin=await requirePlatformSuperAdminStepUp(request,env);const body=await readJson(request);return json({success:true,environment:await provisionCertificationEnvironment(env,admin,{users:body?.users||{}})});}
    catch(e){return json({success:false,error:e?.message||'Certification environment provisioning failed',code:e?.code||'CERTIFICATION_ENVIRONMENT_PROVISION_FAILED'},e?.status||500);}
  });
  router.post('/api/platform/admin/certification/environment/reset',async({request,env})=>{
    try{const admin=await requirePlatformSuperAdminStepUp(request,env);return json({success:true,result:await resetCertificationEnvironment(env,admin)});}
    catch(e){return json({success:false,error:e?.message||'Certification environment reset failed',code:e?.code||'CERTIFICATION_ENVIRONMENT_RESET_FAILED'},e?.status||500);}
  });
}
