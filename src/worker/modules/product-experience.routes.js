import {json,publicErrorMessage} from '../core/http.js';
import {requireSession} from '../core/auth-session.js';
import {resolveRuntimeProductManifest,PRODUCT_RUNTIME_VERSION} from '../security/product-manifest-runtime.service.js';

const TYPES=new Set(['workspace','section','navigation','card','panel','form','empty-state','guidance']);
const arr=v=>Array.isArray(v)?v:[];
const text=v=>String(v??'');
const sanitize=(manifest)=>{
  const experiences=arr(manifest?.presentation?.experiences).filter(x=>x&&TYPES.has(text(x.type))).slice(0,50).map(x=>({
    key:text(x.key),type:text(x.type),
    sections:arr(x.sections).filter(s=>s&&TYPES.has(text(s.type||'section'))).slice(0,50).map(s=>({key:text(s.key),type:text(s.type||'section'),capability:text(s.capability),contentKey:text(s.contentKey),visible:s.visible!==false})),
    navigation:arr(x.navigation).slice(0,50).map(n=>({key:text(n.key),labelKey:text(n.labelKey),capability:text(n.capability),visible:n.visible!==false})),
    presentation:x.presentation&&typeof x.presentation==='object'&&!Array.isArray(x.presentation)?x.presentation:{}
  })).filter(x=>x.key);
  return {version:PRODUCT_RUNTIME_VERSION,available:experiences.length>0,experiences};
};

export function registerProductExperienceRoutes(router){
  router.get('/api/product/experience',async({request,env})=>{
    try{
      const session=await requireSession(request,env);
      const runtime=await resolveRuntimeProductManifest(env,session);
      if(!runtime.available)return json({success:true,experience:{version:PRODUCT_RUNTIME_VERSION,available:false,reason:runtime.reason,experiences:[]}});
      return json({success:true,experience:sanitize(runtime.manifest)});
    }catch(e){return json({success:false,error:publicErrorMessage(e,'Product experience unavailable')},e?.status||500);}
  });
}
