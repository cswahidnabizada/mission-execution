import { authorityUnavailable } from '../../core/canonical-db.js';
import {canonicalFirst} from "../../core/canonical-db.js";
import { json, readJson } from "../../core/http.js";
import { createSession, destroySession, getSession, sessionCookie, clearSessionCookie, publicSession } from "../../core/auth-session.js";
import { audit } from "../../security/audit.js";
import { authenticate, identityToSession } from "./auth.service.js";
import { validateLogin } from "./auth.validator.js";
import { requestPasswordReset, resetPassword } from "./password-recovery.service.js";
import { validatePasswordPolicy } from "../../security/password.js";
import { consumeRateLimit, requestIp } from "../../security/rate-limit.js";
import { hydrateSession } from "../account/account.service.js";
import {primeOperationalAccess} from "../../security/operational-gate.service.js";

export function registerAuthRoutes(router) {
  router.post("/api/auth/login", async ({ request, env }) => {
    try {
      await consumeLoginIpLimit(env, request);
      const validation = validateLogin(await readJson(request));
      if (!validation.valid) return json({ success: false, error: validation.error }, 400);
      const availability=await canonicalFirst(env,`SELECT 1 FROM country_product_launches l JOIN country_catalog c ON c.code=l.country_code WHERE l.status='active' AND l.active=1 AND c.active=1 LIMIT 1`,[],'country_product_launch_authority');
      if(!availability) return json({ success:false, error:'ON Mission is not currently available in any launched country.' }, 403);
      const access = await authenticate(env, request, validation.value);
      const { token, session } = await createSession(env, access);
      const responseSession = await hydrateSession(env, session) || session;
      await primeOperationalAccess(env,token,responseSession).catch(error=>console.error("OPERATIONAL_ACCESS_PRIME",error?.message||error));
      await audit(env, { session: responseSession, action: "session.password_login", resourceType: "session" });
      const response = json({ success: true, ...publicSession(responseSession) });
      response.headers.set("Set-Cookie", sessionCookie(token));
      return response;
    } catch (error) {
      if (error?.message === "INVALID_CREDENTIALS") return json({ success: false, error: "Invalid login or password" }, 401);
      if (error?.message === "TOO_MANY_ATTEMPTS") return json({ success: false, error: "Too many attempts. Try again later." }, 429);
      return json({ success: false, error: error?.message || "Login failed" }, error?.status || 500);
    }
  });


  router.post("/api/auth/password/forgot", async ({ request, env }) => {
    try {
      const body=await readJson(request);const email=String(body.email||"").trim().toLowerCase();
      if(!/^\S+@\S+\.\S+$/.test(email)) return json({success:false,error:"Enter a valid email address"},400);
      await requestPasswordReset(env,request,email);
      return json({success:true,message:"If an eligible account exists, a reset link has been sent."});
    } catch(error) {
      if(error?.message==="TOO_MANY_ATTEMPTS") return json({success:false,error:"Too many reset requests. Try again later."},429);
      if(error?.message==="PASSWORD_RECOVERY_EMAIL_NOT_CONFIGURED") return json({success:false,error:"Password recovery email is not configured yet.",publicError:true},503);
      return json({success:false,error:error?.message||"Password recovery failed"},error?.status||500);
    }
  });

  router.post("/api/auth/password/reset", async ({ request, env }) => {
    try {
      const body=await readJson(request),token=String(body.token||"").trim(),password=String(body.password||"");
      if(!token) return json({success:false,error:"Reset token is required"},400);
      const policy=validatePasswordPolicy(password);if(!policy.valid)return json({success:false,error:policy.error},400);
      await resetPassword(env,{token,password});
      return json({success:true,message:"Password changed successfully"});
    } catch(error) {
      const msg=error?.message==="INVALID_OR_EXPIRED_RESET_TOKEN"?"This reset link is invalid or expired.":error?.message||"Password reset failed";
      return json({success:false,error:msg},error?.status||500);
    }
  });

  // Organization creation is now owned by the canonical onboarding service.
  // The old tenant CRUD registration endpoint is intentionally removed.


  router.get("/api/auth/session", async ({ request, env }) => {
    const optional = new URL(request.url).searchParams.get("optional") === "1";
    const stored = await getSession(request, env);
    if (!stored) return json({ success: true, authenticated: false, session: null }, optional ? 200 : 401);
    const session = await hydrateSession(env, stored);
    if (!session) {
      await destroySession(request, env);
      const response=json({ success:optional, authenticated:false, session:null },optional ? 200 : 401);
      response.headers.set("Set-Cookie",clearSessionCookie());
      return response;
    }
    return json({ success: true, authenticated: true, session: publicSession(session) });
  });

  router.post("/api/auth/logout", async ({ request, env }) => {
    let session=null;
    try { session = await getSession(request, env); } catch (error) { console.error("SESSION_LOGOUT_AUTHORITY_BYPASS", error?.message || error); }
    try { await destroySession(request, env); } catch (error) { console.error("SESSION_LOGOUT_KV_FAILURE", error?.message || error); }
    if (session) await audit(env, { session, action: "session.logout", resourceType: "session" }).catch(error=>{throw authorityUnavailable('session_logout_audit',error);});
    const response = json({ success: true });
    response.headers.set("Set-Cookie", clearSessionCookie());
    return response;
  });
}

async function consumeLoginIpLimit(env, request) {
  await consumeRateLimit(env, `login-ip:${requestIp(request)}`, { limit: 30, windowSeconds: 900 });
}

