import {json,publicErrorMessage} from "../core/http.js";
import {requireSession,publicSession} from "../core/auth-session.js";
import {hydrateSession} from "./account/account.service.js";
import {resolveProductConfiguration,publicProductConfiguration} from "../security/product-configuration.service.js";
import {resolveRuntimeProductManifest,mergeGovernedProductContext,PRODUCT_RUNTIME_VERSION} from "../security/product-manifest-runtime.service.js";
import {resolveUserSituation} from "../security/user-situation.service.js";

export function registerBootstrapRoutes(router){
  router.get("/api/bootstrap",async({request,env})=>{
    try{
      const current=await requireSession(request,env);
      const session=await hydrateSession(env,current)||current;
      const base=await resolveProductConfiguration(env);
      const [runtime,situation]=await Promise.all([
        resolveRuntimeProductManifest(env,session),
        resolveUserSituation(env,session,{productConfiguration:base})
      ]);
      const configuration=mergeGovernedProductContext(base,runtime);
      const launch=runtime.launch&&runtime.launch.active?runtime.launch:null;
      return json({
        success:true,
        session:publicSession(session),
        organizationRole:session.organizationRole||null,
        product:{
          ...publicProductConfiguration(configuration),
          runtime:{version:PRODUCT_RUNTIME_VERSION,available:runtime.available,reason:runtime.reason,manifest:runtime.manifest,integrity:runtime.integrity||null,launch:runtime.launch||null,eligibility:runtime.eligibility||null},
          availability:{status:launch?'start':'under_development',countryCode:session.countryCode||null,countryName:launch?.countryName||null,launchMessage:launch?.launchMessage||null}
        },
        situation
      });
    }catch(e){
      return json({success:false,error:publicErrorMessage(e,"Unable to load ON Mission workspace context")},Number(e?.status)||500);
    }
  });
}
