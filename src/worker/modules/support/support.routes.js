import { cleanText, json, readJson } from "../../core/http.js";
import { requireSession } from "../../core/auth-session.js";
import { submitSupport } from "./support.service.js";

const CATEGORIES = new Set(["technical","billing","mission","driver","account","other"]);

export function registerSupportRoutes(router) {
  router.post("/api/support", async ({ request, env }) => {
    try {
      const session = await requireSession(request, env);
      const body = await readJson(request);
      const data = {
        contactEmail: cleanText(body.contactEmail, 200),
        category: cleanText(body.category, 32).toLowerCase(),
        subject: cleanText(body.subject, 180),
        message: cleanText(body.message, 4000),
        missionReference: cleanText(body.missionReference, 120)
      };

      if (!CATEGORIES.has(data.category)) return json({ success:false,error:"Choose a valid category" },400);
      if (!data.subject || !data.message) return json({ success:false,error:"Subject and message are required" },400);

      const ticketId = await submitSupport(env, session, data);
      return json({ success:true, ticketId, message:"Support request received" },201);
    } catch (e) {
      const status=e?.status||(e?.message==="AUTH_REQUIRED"?401:500);
      return json({success:false,error:e?.message==="AUTH_REQUIRED"?"Authentication required":e?.message||"Support request failed"},status);
    }
  });
}
