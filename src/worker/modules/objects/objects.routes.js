import {json} from "../../core/http.js";
import {requireSession} from "../../core/auth-session.js";
import {listMissionObjects} from "./objects.service.js";
export function registerObjectRoutes(router){
  router.get("/api/objects",async({request,env})=>{try{const session=await requireSession(request,env);const objects=await listMissionObjects(env,session);return json({success:true,objects,domain:"object",capabilities:["object","logistics"]});}catch(e){return json({success:false,error:e?.message||"Objects unavailable"},e?.status||500);}});
}
