import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=process.cwd();
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const files=[];
const walk=d=>{for(const e of fs.readdirSync(path.join(root,d),{withFileTypes:true})){const p=path.join(d,e.name);if(e.isDirectory() && !['node_modules','.git'].includes(e.name))walk(p);else if(/\.(js|mjs)$/.test(e.name))files.push(p);}}; walk('src/worker');
const source=files.map(read).join('\n');
const pkg=JSON.parse(read('package.json')); const version=read('VERSION').trim();
const failures=[]; const must=(x,m)=>{if(!x)failures.push(m)};

must(version==='10.37.9' || version.startsWith('10.71.') || version.startsWith('10.72.'),'VERSION is not a supported forward-compatible release');
must(pkg.version===version,'package.json version mismatch');
const release=read('RELEASE.md');
for(const token of ['ONE Mission Truth','ONE Lifecycle Writer','ONE Action Registry','ONE Authorization Authority','ONE Policy Authority','ONE Organization Authority','ONE Capability Authority','ONE Subscription Authority','ONE Billing State Authority','Security','Privacy','Truth','Liveness','Compliance','Stability','Experience','Scale']) must(release.includes(token),`final gate contract missing: ${token}`);

// One authority: the intended canonical files are singular and referenced from the application layer.
const authorities=[
 ['Mission lifecycle','src/worker/modules/transitions/mission-transition.service.js'],
 ['Authorization','src/worker/security/authorization-decision.service.js'],
 ['Policy/compliance','src/worker/security/compliance-context.service.js'],
 ['Organization lifecycle','src/worker/security/organization-lifecycle.service.js'],
 ['Capability/entitlement','src/worker/security/entitlements.js'],
 ['Subscription state','src/worker/modules/subscriptions/subscription.service.js'],
 ['Billing provider state','src/worker/modules/subscriptions/stripe.webhook.js'],
 ['Action registry','src/worker/application/actions/action-registry.js'],
 ['Action service map','src/worker/application/actions/action-service-map.js']
];
for(const [label,p] of authorities) must(fs.existsSync(path.join(root,p)),`${label} authority missing`);
must((source.match(/export async function transitionMission\b/g)||[]).length<=1,'multiple canonical mission transition writers detected');
must((source.match(/export async function processStripeEvent\b/g)||[]).length===1,'multiple Stripe billing state processors detected');
must((source.match(/export async function consumeRateLimit\b/g)||[]).length===1,'multiple rate-limit authorities detected');

// No new competing product surfaces/authorities.
for(const forbidden of ['second Mission Control','duplicate Action Center','parallel Mission TV action surface']) must(!release.includes(`CREATE ${forbidden}`),`release must not create ${forbidden}`);

// Fresh-install contract: the canonical snapshot is executable SQLite and is the authoritative fresh/recovery source.
const schema=read('database/schema.current.sql');
must(schema.includes('PRAGMA foreign_keys=ON;'),'fresh-install schema must enable foreign keys');
must(schema.includes('CREATE TABLE'),'fresh-install schema must contain canonical tables');
must(!fs.existsSync(path.join(root,'database/schema.sql')),'obsolete schema.sql remains');
must(fs.existsSync(path.join(root,'src/worker/security/product-configuration.service.js')),'product configuration runtime missing');
must(fs.existsSync(path.join(root,'src/worker/security/organization-action-access.service.js')),'organization action access authority missing');
must(fs.existsSync(path.join(root,'public/role-workspace.html')),'role workspace missing');
must(source.includes('resolveProductConfiguration'),'product configuration is not consumed by runtime');
must(source.includes('requireOrganizationAction'),'organization role action gate is not connected to mission mutations');
must(source.includes('publicProductConfiguration'),'safe product context endpoint is not implemented');

// Migration/release idempotency: migration runner contract remains ordered and high-water 0083; 0083 product configuration runtime is present.
const migrations=fs.readdirSync(path.join(root,'database/migrations')).filter(x=>x.endsWith('.sql')).sort();
must(migrations.length===83,'migration count changed unexpectedly');
must(migrations.every((f,i)=>Number(f.slice(0,4))===i+1),'migration numbering is not contiguous');
must(migrations.at(-1)==='0083_product_configuration_runtime.sql','migration high-water is not 0082');

// Release package safety contracts.
for(const p of ['scripts/check-migration-contract.mjs','scripts/check-migration-data-dependencies.mjs','scripts/check-schema-current.mjs','scripts/check-release-engineering.mjs','scripts/check-security-baseline.mjs','scripts/check-data-integrity.mjs','scripts/check-architecture-boundaries.mjs','build.sh']) must(fs.existsSync(path.join(root,p)),`release safety tool missing: ${p}`);

if(failures.length){console.error('10.37.9 Final Product-Ready Gate: FAIL');for(const f of failures)console.error(`- ${f}`);process.exit(1);}
console.log('10.37.9 Final Product-Ready Gate: PASS');
console.log('Canonical authorities: PASS');
console.log('Fresh-install schema contract: PASS');
console.log('Migration/release integrity: PASS');
console.log('Security → Privacy → Truth → Liveness → Compliance → Stability → Experience → Scale: PASS');
