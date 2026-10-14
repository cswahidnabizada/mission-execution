import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
const root=process.cwd();
const read=p=>fs.readFileSync(path.join(root,p),"utf8");
const version=read("VERSION").trim();
assert.equal(version,"10.29.58");
const pkg=JSON.parse(read("package.json")); assert.equal(pkg.version,version);
assert.ok(read("RELEASE-10.29.58.md").includes("Built from protected 10.29.57"));
assert.ok(read("public/admin.html").includes("dashboard-work-surface-102958.js?v=10.29.58&build=10.29.58"));
assert.ok(read("public/admin.html").includes("dashboard-work-surface-102958.css?v=10.29.58&build=10.29.58"));
assert.ok(fs.existsSync(path.join(root,"public/assets/js/extensions/dashboard-work-surface-102958.js")));
assert.ok(fs.existsSync(path.join(root,"public/assets/css/dashboard-work-surface-102958.css")));
const dash=read("public/assets/js/pages/dashboard-command-center.js");
assert.ok(dash.includes("data-nm-market-state-token"));
assert.ok(dash.includes('headers["X-Mission-State-Token"]=stateToken'));
const htmlFiles=fs.readdirSync(path.join(root,"public"),{recursive:true}).filter(x=>String(x).endsWith(".html"));
for(const rel of htmlFiles){
  const body=read(`public/${rel}`);
  assert.ok(!body.includes("cdn.tailwindcss.com"),`Tailwind CDN remains in ${rel}`);
  assert.ok(body.includes("/assets/css/tailwind.local.css"),`local Tailwind missing in ${rel}`);
  for(const ref of body.matchAll(/(?:src|href)=["'](\/assets\/(?:js|css)\/[^"']+)["']/g)){
    const clean=ref[1].split("?",1)[0]; assert.ok(fs.existsSync(path.join(root,"public",clean.slice(1))),`missing active asset ${clean} in ${rel}`);
  }
}
const workerFiles=[]; const walk=d=>{for(const e of fs.readdirSync(path.join(root,d),{withFileTypes:true})){const p=path.join(d,e.name);if(e.isDirectory())walk(p);else if(e.name.endsWith(".js"))workerFiles.push(p);}}; walk("src/worker");
for(const f of workerFiles){const s=read(f);for(const m of s.matchAll(/(?:from|import)\s*["'](\.[^"']+)["']/g)){const r=m[1].split("?",1)[0];const abs=path.resolve(root,path.dirname(f),r);assert.ok(fs.existsSync(abs)||fs.existsSync(`${abs}.js`),`missing worker import ${r} from ${f}`);}}
const registry=await import(path.join(root,"src/worker/extensions/actions-intelligence/action-registry.js"));
const serviceMap=await import(path.join(root,"src/worker/extensions/actions-intelligence/action-service-map.js"));
const defs=registry.allActionDefinitions(); const mapped=new Set(serviceMap.mappedActionCodes());
assert.equal(defs.length,mapped.size,"Action Registry/Service Map count mismatch");
for(const d of defs)assert.ok(mapped.has(d.code),`unmapped action ${d.code}`);
for(const p of workerFiles){const s=read(p);if(/router\.(post|patch|delete)\(/.test(s)){const publicAuthRoute=p.endsWith("src/worker/modules/auth/auth.routes.js");assert.ok(publicAuthRoute||/require(Session|Admin|Role)/.test(s),`mutation route without obvious auth guard: ${p}`);}}
const api=read("public/assets/js/core/api.js");
for(const pattern of [/X-Mission-State-Token/,/X-Idempotency-Key/,/MISSION_STATE_TOKEN_REQUIRED/])assert.ok(pattern.test(api),`API protection missing ${pattern}`);
assert.ok(read("database/migrations/0041_canonical_mutation_integrity.sql").includes("mutation_phase"));
const all=read("src/worker/extensions/operations-context/canonical-decision-action-consistency.contract.js");
assert.ok(all.includes("does not replace the canonical lifecycle step"));
assert.ok(read("src/worker/extensions/operations-context/operational-readiness.contract.js").includes('new Set(["WAITING"])'));
const suspicious=["sk_live_","sk_test_","AKIA","BEGIN RSA PRIVATE KEY","BEGIN PRIVATE KEY"];
for(const d of ["src","scripts","public/assets/js"]){for(const f of fs.readdirSync(path.join(root,d),{recursive:true}).filter(x=>String(x).endsWith(".js"))){const s=read(path.join(d,f));for(const token of suspicious)assert.ok(!s.includes(token),`credential pattern ${token} in ${path.join(d,f)}`);}}
console.log("10.29.58 final project audit: PASS");
