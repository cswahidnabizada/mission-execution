import fs from "node:fs";

const read=(p)=>fs.readFileSync(p,"utf8");
const must=(condition,message)=>{if(!condition){console.error(`SECURITY CHECK FAILED: ${message}`);process.exit(1);}};

const router=read("src/worker/core/router.js");
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
must(wrangler.includes('"SECURITY_STRICT_MODE": "true"'),"production strict security mode is not enabled");
must(!requestSecurity.includes('Access-Control-Allow-Origin: *'),"wildcard CORS must not be introduced");
must(!requestSecurity.includes("cdn.tailwindcss.com"),"Tailwind browser CDN must not be allowed by CSP");
must(!requestSecurity.includes("'unsafe-eval'"),"unsafe-eval must not be allowed by CSP");
must(!requestSecurity.includes("script-src 'self' 'unsafe-inline'"),"inline scripts must not be allowed by CSP");
must(fs.existsSync(localTailwind) && fs.statSync(localTailwind).size > 1000,"compiled local Tailwind stylesheet missing or empty");
for (const rel of htmlFiles) {
  const body=read(`public/${rel}`);
  must(!body.includes("cdn.tailwindcss.com"),`Tailwind CDN remains in public/${rel}`);
  const usesFrontendCss=body.includes('/assets/css/frontend/');
  if(!usesFrontendCss) must(body.includes("/assets/css/tailwind.local.css"),`local Tailwind stylesheet missing from public/${rel}`);
}

console.log("security baseline OK (origin/fetch metadata, headers, D1 session authority, strict rate limiting, local Tailwind/CSP)");
