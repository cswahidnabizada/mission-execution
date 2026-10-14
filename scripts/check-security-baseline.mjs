import fs from "node:fs";

const read=(p)=>fs.readFileSync(p,"utf8");
const must=(condition,message)=>{if(!condition){console.error(`SECURITY CHECK FAILED: ${message}`);process.exit(1);}};

const router=read("src/worker/core/router.js");
const adminControl=read("src/worker/modules/admin-control/admin-control.routes.js");
const adminAccess=read("src/worker/modules/admin-control/admin-access.routes.js");
const requestSecurity=read("src/worker/security/request-security.js");
const sessions=read("src/worker/core/auth-session.js");
const rate=read("src/worker/security/rate-limit.js");
const wrangler=read("wrangler.jsonc");
const migration=read("database/migrations/0023_session_authority.sql");
const htmlFiles=fs.readdirSync("public", {recursive:true}).filter(x=>String(x).endsWith(".html"));
const localTailwind="public/assets/css/tailwind.local.css";

must(router.includes("validateMutationRequest"),"router must enforce mutation origin checks");
must(requestSecurity.includes('Sec-Fetch-Site'),"Sec-Fetch-Site protection missing");
must(requestSecurity.includes('Strict-Transport-Security'),"HSTS header missing");
must(requestSecurity.includes('Cross-Origin-Resource-Policy'),"CORP header missing");
must(requestSecurity.includes('Content-Security-Policy-Report-Only'),"CSP tightening telemetry missing");
must(sessions.includes("sessionStillAuthorized"),"D1 session authority check missing");
must(sessions.includes("sessionVersion"),"session generation binding missing");
must(migration.includes("session_version"),"session authority migration missing");
must(rate.includes("SECURITY_STRICT_MODE"),"strict D1 rate-limit mode missing");
must(read("src/worker/core/http.js").includes("MAX_JSON_BODY_BYTES"),"JSON request body size limit missing");
must(read("src/worker/modules/files/files.routes.js").includes("assertContentLength"),"multipart request body limit missing");
must(read("src/worker/modules/subscriptions/stripe.webhook.js").includes("assertContentLength"),"Stripe webhook body size limit missing");
must(adminControl.includes("registerAdminAccessRoutes") && adminAccess.includes("platform-admin-login:"),"platform Super Admin login rate limiting missing");
must(wrangler.includes('"SECURITY_STRICT_MODE": "true"'),"production strict security mode is not enabled");
must(wrangler.includes('"TRUST_ENFORCEMENT_MODE": "enforce"'),"production trust enforcement is not explicitly enabled");
must(!requestSecurity.includes('Access-Control-Allow-Origin: *'),"wildcard CORS must not be introduced");
must(!requestSecurity.includes("cdn.tailwindcss.com"),"Tailwind browser CDN must not be allowed by CSP");
must(!requestSecurity.includes("'unsafe-eval'"),"unsafe-eval must not be allowed by CSP");
must(!requestSecurity.includes("script-src 'self' 'unsafe-inline'"),"inline scripts must not be allowed by CSP");
must(requestSecurity.includes("hasSessionCookie"),"cookie-authenticated mutation origin binding missing");
must(fs.existsSync(localTailwind) && fs.statSync(localTailwind).size > 1000,"compiled local Tailwind stylesheet missing or empty");
for (const rel of htmlFiles) {
  const body=read(`public/${rel}`);
  must(!body.includes("cdn.tailwindcss.com"),`Tailwind CDN remains in public/${rel}`);
  const usesFrontendCss=body.includes('/assets/css/frontend/');
  if(!usesFrontendCss) must(body.includes("/assets/css/tailwind.local.css"),`local Tailwind stylesheet missing from public/${rel}`);
}

console.log("security baseline OK (origin/fetch metadata, headers, D1 session authority, strict rate limiting, local Tailwind/CSP)");
