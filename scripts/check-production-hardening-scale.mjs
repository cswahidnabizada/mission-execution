import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');
const must=(ok,msg)=>{if(!ok){console.error(`FAIL ${msg}`);process.exitCode=1;}else console.log(`PASS ${msg}`)};

const wrangler=read('wrangler.jsonc');
const router=read('src/worker/core/router.js');
const security=read('src/worker/security/request-security.js');
const rate=read('src/worker/security/rate-limit.js');
const transition=read('src/worker/modules/transitions/mission-transition.service.js');
const finalProduct=read('src/worker/modules/intelligence/final-operational-product.engine.js');
const migration=read('database/migrations/0036_production_query_indexes.sql');
const pkg=JSON.parse(read('package.json'));

must(wrangler.includes('"observability": {\n    "enabled": true'), 'Cloudflare observability is enabled');
must(wrangler.includes('"SECURITY_STRICT_MODE": "true"'), 'strict security mode is enabled');
must(router.includes('validateMutationRequest'), 'mutation origin protection remains in the router');
must(security.includes('Strict-Transport-Security'), 'HSTS remains enforced');
must(security.includes('Cross-Origin-Resource-Policy'), 'CORP remains enforced');
must(security.includes("Content-Security-Policy"), 'CSP remains enforced');
must(rate.includes('SECURITY_STRICT_MODE'), 'strict rate limiting remains available');
must(transition.includes('state_version=state_version+1'), 'canonical transition increments state version');
must(transition.includes('WHERE id=? AND company_id=? AND status=?'), 'canonical transition uses tenant-scoped compare-and-set');
must(transition.includes('INSERT INTO mission_status_history'), 'critical lifecycle transitions remain event-backed');
must(finalProduct.includes('authoritative:false') || finalProduct.includes('authoritative: false'), 'final product remains non-authoritative');
must(finalProduct.includes('executesAction:false') || finalProduct.includes('executesAction: false'), 'final product cannot execute actions');
must(!security.includes('Access-Control-Allow-Origin: *'), 'wildcard CORS is absent');
must(!security.includes("'unsafe-eval'"), 'unsafe-eval is absent from CSP');
must(migration.includes('CREATE INDEX IF NOT EXISTS'), 'production query indexes migration is present');
must(typeof pkg.scripts?.['check:health']==='string', 'health script is present');
must(fs.existsSync(path.join(root,'RELEASE.md')), 'current release document exists');
must(fs.existsSync(path.join(root,'VERSION')), 'current version file exists');

if(process.exitCode) process.exit(1);
console.log('Production hardening + scale foundation: PASS');
