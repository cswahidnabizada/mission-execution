import {json,publicErrorMessage} from '../../core/http.js';
import {requirePlatformAdministrator} from '../../security/platform-administrator.js';
import {getSuperAdminOperatingSnapshot,searchSuperAdminResources,getCanonicalAdminActionMatrix} from './super-admin-operating-system.service.js';
import {getResourceExplorer,listRecentResourceExplorer,getResourceActivity,PLATFORM_RESOURCE_EXPLORER_VERSION} from '../../security/platform-resource-explorer.service.js';

function fail(e){return json({success:false,error:publicErrorMessage(e?.message||'Super Admin Operating System unavailable'),code:e?.code||e?.message||'SUPER_ADMIN_OPERATING_SYSTEM_UNAVAILABLE'},e?.status||500);}

export function registerSuperAdminOperatingSystemRoutes(router){
  router.get('/api/platform/admin/operating-system',async({request,env})=>{try{await requirePlatformAdministrator(request,env);return json({success:true,operatingSystem:await getSuperAdminOperatingSnapshot(env)});}catch(e){return fail(e);}});
  router.get('/api/platform/admin/resource-search',async({request,env})=>{try{await requirePlatformAdministrator(request,env);const u=new URL(request.url);return json({success:true,...await searchSuperAdminResources(env,u.searchParams.get('q')||'',{limit:u.searchParams.get('limit')||24})});}catch(e){return fail(e);}});
  router.get('/api/platform/admin/resource-management/recent',async({request,env})=>{try{await requirePlatformAdministrator(request,env);const u=new URL(request.url);return json({success:true,...await listRecentResourceExplorer(env,{limit:u.searchParams.get('limit')||24})});}catch(e){return fail(e);}});
  router.get('/api/platform/admin/action-matrix',async({request,env})=>{try{await requirePlatformAdministrator(request,env);return json({success:true,actionMatrix:getCanonicalAdminActionMatrix()});}catch(e){return fail(e);}});
  router.get(/^\/api\/platform\/admin\/resource-explorer\/(?<resourceType>[a-z_]+)\/(?<resourceId>[^/]+)$/,async({request,env,params})=>{try{await requirePlatformAdministrator(request,env);return json({success:true,...await getResourceExplorer(env,{resourceType:params.resourceType,resourceId:params.resourceId})});}catch(e){return fail(e);}});
  router.get(/^\/api\/platform\/admin\/resource-explorer\/(?<resourceType>[a-z_]+)\/(?<resourceId>[^/]+)\/activity$/,async({request,env,params})=>{try{await requirePlatformAdministrator(request,env);const u=new URL(request.url);return json({success:true,...await getResourceActivity(env,{resourceType:params.resourceType,resourceId:params.resourceId,limit:u.searchParams.get('limit')||24})});}catch(e){return fail(e);}});
}
