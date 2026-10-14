import { json,readJson } from "../../core/http.js";
import { clearSessionCookie,createSession,destroySession,getSession,requireSession,sessionCookie,publicSession } from "../../core/auth-session.js";
import { deleteOwnAccount,getAccount,hydrateSession,updateAccount } from "./account.service.js";
import {primeOperationalAccess} from "../../security/operational-gate.service.js";

export function registerAccountRoutes(router){
  router.get("/api/account",async({request,env})=>{try{const s=await requireSession(request,env);return json({success:true,account:await getAccount(env,s)});}catch(e){return fail(e);}});
  router.patch("/api/account",async({request,env})=>{try{
    const old=await requireSession(request,env);const account=await updateAccount(env,old,await readJson(request));
    await destroySession(request,env);const fresh=await hydrateSession(env,old);const {token,session}=await createSession(env,fresh);
    await primeOperationalAccess(env,token,session).catch(error=>console.error("OPERATIONAL_ACCESS_PRIME",error?.message||error));
    const r=json({success:true,account,session:publicSession(session)});r.headers.set("Set-Cookie",sessionCookie(token));return r;
  }catch(e){return fail(e);}});
  router.delete("/api/account",async({request,env})=>{try{
    const s=await requireSession(request,env);const result=await deleteOwnAccount(env,s,await readJson(request));await destroySession(request,env);
    const r=json({success:true,...result});r.headers.set("Set-Cookie",clearSessionCookie());return r;
  }catch(e){return fail(e);}});
}
function fail(e){const st=e?.status||(e?.message==="AUTH_REQUIRED"?401:500);return json({success:false,error:e?.message==="AUTH_REQUIRED"?"Authentication required":e?.message||"Account operation failed"},st);}
