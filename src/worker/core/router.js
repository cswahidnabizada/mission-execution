import { json } from "./http.js";
import { applySecurityHeaders, validateMutationRequest } from "../security/request-security.js";
import { requestIdFor, withRequestObservability, logRequest } from "./observability.js";
import { getSession } from "./auth-session.js";
import { audit } from "../security/audit.js";

export class Router {
  constructor(){this.routes=[];}
  add(method,pattern,handler){this.routes.push({method:method.toUpperCase(),pattern,handler});return this;}
  get(pattern,handler){return this.add("GET",pattern,handler);}
  post(pattern,handler){return this.add("POST",pattern,handler);}
  patch(pattern,handler){return this.add("PATCH",pattern,handler);}
  delete(pattern,handler){return this.add("DELETE",pattern,handler);}

  async fetch(request,env,ctx){
    const started=performance.now();
    const requestId=requestIdFor(request);
    const url=new URL(request.url);
    const method=request.method.toUpperCase();
    const isApi=url.pathname.startsWith("/api/");
    const securityContext={isApi,isHttps:url.protocol==="https:",allowSameOriginFrame:false};

    const finish=(response,extra={})=>{
      const durationMs=performance.now()-started;
      const observed=withRequestObservability(response,{requestId,durationMs});
      logRequest({request,requestId,status:observed.status,durationMs,route:url.pathname,session:extra.session||null,error:extra.error||null});
      return applySecurityHeaders(observed,securityContext);
    };

    const mutationError=validateMutationRequest(request,url);
    if(mutationError)return finish(json({success:false,error:mutationError},403));
    if(isApi && ['POST','PUT','PATCH','DELETE'].includes(method) && !url.pathname.startsWith('/api/platform/admin/user-experience/context/end') && url.pathname !== '/api/auth/logout'){
      try{
        const delegated=await getSession(request,env);
        if(delegated?.actingAs?.mode==='view'){
          const exp=Number(delegated.actingAs.expiresAt||0);
          if(exp>Date.now()) return finish(json({success:false,error:'USER_CONTEXT_READ_ONLY',code:'USER_CONTEXT_READ_ONLY',message:'View as User is read-only. Exit the User Context before performing mutations.'},423));
        }
      }catch(error){
        if(Number(error?.status)>=500) return finish(json({success:false,error:'Session authority unavailable'},503),{error});
      }
    }

    let delegatedSession=null;
    if(isApi && ['POST','PUT','PATCH','DELETE'].includes(method)){
      try{delegatedSession=await getSession(request,env);}catch(error){console.warn("DELEGATED_SESSION_READ_FOR_AUDIT",error?.message||error);}
    }
    const auditDelegated=async(status)=>{
      if(delegatedSession?.actingAs?.mode!=='act')return;
      await audit(env,{session:delegatedSession,action:'platform.user_experience.delegated.http_mutation',resourceType:'http_request',resourceId:null,metadata:{method,path:url.pathname,status,contextId:delegatedSession.actingAs.contextId,targetIdentityId:delegatedSession.actingAs.targetIdentityId,targetTenantId:delegatedSession.actingAs.targetTenantId}}).catch(error=>{console.warn('DELEGATED_ACTION_AUDIT_UNAVAILABLE',error?.message||error);});
    };
    for(const route of this.routes){
      if(route.method!==method)continue;
      const match=matchRoute(route.pattern,url.pathname);
      if(!match.matched)continue;
      try{
        const response=await route.handler({request,env,ctx,url,params:match.params,requestId});
        await auditDelegated(response.status);
        return finish(response);
      }catch(error){
        console.error("UNHANDLED ROUTE ERROR",{requestId,route:url.pathname,method,error:String(error?.message||error).slice(0,240)});
        await auditDelegated(Number(error?.status)||500);
        return finish(json({success:false,error:"Internal server error"},500),{error});
      }
    }

    if(isApi)return finish(json({success:false,error:"API route not found"},404));
    const asset=await env.ASSETS.fetch(request);
    if(url.pathname.startsWith("/assets/") && url.searchParams.has("v")){
      const headers=new Headers(asset.headers);
      headers.set("Cache-Control","public, max-age=31536000, immutable");
      headers.set("X-ONM-Asset-Cache","immutable-versioned");
      return finish(new Response(asset.body,{status:asset.status,statusText:asset.statusText,headers}));
    }
    return finish(asset);
  }
}

function matchRoute(pattern,pathname){
  if(typeof pattern==="string")return {matched:pattern===pathname,params:{}};
  const match=pathname.match(pattern);
  return match?{matched:true,params:match.groups||{}}:{matched:false,params:{}};
}
