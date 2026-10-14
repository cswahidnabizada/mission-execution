import {json,numberParam} from "../../core/http.js";
import {requireSession,touchSession} from "../../core/auth-session.js";
import {limitAction} from "../../security/action-limit.js";
import {notificationLive,recentNotifications,markNotificationRead,markAllNotificationsRead} from "./notifications.service.js";
import {touchDriverPresence} from "../people/people-presence.service.js";

export function registerNotificationRoutes(router){
  router.get("/api/notifications/live",async({request,env,url})=>{try{
    const s=await requireSession(request,env);
    await limitAction(env,s,"notification-live",{limit:30,windowSeconds:60});
    await touchSession(request,env);
    try{await touchDriverPresence(env,s);}catch{}
    return json({success:true,...await notificationLive(env,s,{after:numberParam(url.searchParams.get("after"))||0})});
  }catch(e){return fail(e);}});

  router.get("/api/notifications",async({request,env})=>{try{
    const s=await requireSession(request,env);
    await limitAction(env,s,"notification-list",{limit:30,windowSeconds:60});
    return json({success:true,...await recentNotifications(env,s)});
  }catch(e){return fail(e);}});

  router.patch(/^\/api\/notifications\/(?<id>\d+)\/read$/,async({request,env,params})=>{try{
    const s=await requireSession(request,env);
    await limitAction(env,s,"notification-read",{limit:60,windowSeconds:60});
    await markNotificationRead(env,s,Number(params.id));return json({success:true});
  }catch(e){return fail(e);}});

  router.post("/api/notifications/read-all",async({request,env})=>{try{
    const s=await requireSession(request,env);
    await limitAction(env,s,"notification-read-all",{limit:20,windowSeconds:60});
    await markAllNotificationsRead(env,s);return json({success:true});
  }catch(e){return fail(e);}});
}
function fail(e){const status=e?.status||(e?.message==="AUTH_REQUIRED"?401:e?.message==="FORBIDDEN"?403:500);const msg=e?.message==="TOO_MANY_ATTEMPTS"?"Notification refresh is temporarily rate-limited. Please wait a moment.":e?.message==="AUTH_REQUIRED"?"Authentication required":e?.message||"Notification operation failed";return json({success:false,error:msg},status);}
