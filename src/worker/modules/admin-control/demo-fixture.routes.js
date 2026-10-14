import {json} from '../../core/http.js';
import {requirePlatformAdministrator} from '../../security/platform-administrator.js';
import {requirePlatformSuperAdminStepUp} from '../../security/platform-super-administrator.js';
import {getDemoFixture,provisionDemoFixture,resetDemoFixture} from './demo-fixture.service.js';

const fail=e=>json({success:false,error:e?.message||'Demo fixture unavailable',code:e?.code||'DEMO_FIXTURE_UNAVAILABLE'},e?.status||500);

export function registerDemoFixtureRoutes(router){
  router.get('/api/platform/admin/demo/fixture',async({request,env})=>{
    try{await requirePlatformAdministrator(request,env);return json({success:true,fixture:await getDemoFixture(env)});}
    catch(e){return fail(e);}
  });
  router.post('/api/platform/admin/demo/fixture/provision',async({request,env})=>{
    try{const admin=await requirePlatformSuperAdminStepUp(request,env);return json({success:true,fixture:await provisionDemoFixture(env,admin)});}
    catch(e){return fail(e);}
  });
  router.post('/api/platform/admin/demo/fixture/reset',async({request,env})=>{
    try{const admin=await requirePlatformSuperAdminStepUp(request,env);return json({success:true,result:await resetDemoFixture(env,admin)});}
    catch(e){return fail(e);}
  });
}
