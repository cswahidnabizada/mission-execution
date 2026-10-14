import { cleanText, json, readJson } from "../../core/http.js";
import { requireSession } from "../../core/auth-session.js";
import {limitAction} from "../../security/action-limit.js";
import { listChat, sendChat } from "./chat.service.js";

export function registerChatRoutes(router) {
  router.get(/^\/api\/missions\/(?<missionId>\d+)\/messages$/, async ({ request, env, params, url }) => {
    try {
      const session = await requireSession(request, env);
      await limitAction(env,session,"message-list",{limit:60,windowSeconds:60});
      const limit=Math.min(Math.max(Number(url.searchParams.get("limit"))||100,1),200);
      const offset=Math.min(Math.max(Number(url.searchParams.get("offset"))||0,0),50000);
      const messages = await listChat(env, session, Number(params.missionId),{limit:limit+1,offset});
      const hasMore=messages.length>limit;
      return json({ success: true, messages:messages.slice(0,limit), hasMore, nextOffset:hasMore?offset+limit:null });
    } catch (e) { return fail(e); }
  });

  router.post(/^\/api\/missions\/(?<missionId>\d+)\/messages$/, async ({ request, env, params }) => {
    try {
      const session = await requireSession(request, env);
      await limitAction(env,session,"message-send",{limit:30,windowSeconds:60});
      await limitAction(env,session,"message-burst",{limit:2,windowSeconds:2});
      const body = await readJson(request);
      const message = cleanText(body.message, 2000);
      if (!message) return json({ success: false, error: "Message is required" }, 400);
      const messageId = await sendChat(env, session, Number(params.missionId), message);
      return json({ success: true, messageId }, 201);
    } catch (e) { return fail(e); }
  });
}

function fail(e) {
  const status = e?.status || (e.message === "AUTH_REQUIRED" ? 401 : 500);
  return json({ success: false, error: e.message === "AUTH_REQUIRED" ? "Authentication required" : e.message==="TOO_MANY_ATTEMPTS" ? "Too many requests. Please wait briefly and try again." : e.message }, status);
}
