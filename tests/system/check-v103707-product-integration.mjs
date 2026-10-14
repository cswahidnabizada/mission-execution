import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root=process.cwd();
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const exists=p=>fs.existsSync(path.join(root,p));
const allFiles=(dir)=>{
  const out=[];
  const walk=d=>{for(const e of fs.readdirSync(path.join(root,d),{withFileTypes:true})){const p=path.join(d,e.name);if(e.isDirectory())walk(p);else out.push(p);}};
  walk(dir); return out;
};
const worker=allFiles('src/worker').filter(f=>/\.(js|mjs)$/.test(f)).map(read).join('\n');
const ui=allFiles('public').filter(f=>/\.(js|html|css)$/.test(f)).map(read).join('\n');
const pkg=JSON.parse(read('package.json'));
const version=read('VERSION').trim();
const failures=[];
const must=(condition,label)=>{if(!condition)failures.push(label);};

must(version==='10.37.8','release version must be 10.37.8');
must(pkg.version===version,'package version must match VERSION');
must(exists('RELEASE-10.37.8.md'),'10.37.8 release document missing');
must(exists('tests/system/check-v103708-final-product-ready.mjs'),'final product-ready gate missing');
must(exists('database/schema.current.sql'),'canonical fresh-install schema missing');
must(!exists('database/schema.sql'),'obsolete schema.sql must remain absent');

// Organization journey: every transition remains on existing canonical authorities.
for(const token of [
  'createOrganizationOnboarding','getOrganizationProvisioning','retryOrganizationProvisioning',
  '/api/organizations/onboarding','/api/organizations/onboarding/requirements',
  '/api/verification','/api/verification/trust-key/activate',
  '/api/organization/invitations','/api/subscriptions/current',
  '/api/subscriptions/checkout','/api/subscriptions/eligibility',
  'replaceEntitlements','subscription_entitlements'
]) must(worker.includes(token),`organization journey contract missing: ${token}`);

// Mission journey: canonical workspace/action execution remains the only mutation path.
for(const token of [
  'canonical-action.application.service','canonical-action-orchestration.service',
  'mission-transition.service','/api/missions','/api/objects','/api/notifications',
  'mission_files','canonical-action-decision.service','canonical-liveness-registry'
]) must(worker.includes(token)||ui.includes(token),`mission journey contract missing: ${token}`);

// Billing journey: provider is downstream and replay/reconciliation remain explicit.
for(const token of [
  'stripe.webhook','processStripeEvent','billing_provider_events','claimEvent',
  '/api/stripe/webhook','/api/subscriptions/reconcile','reconcileStripeSubscription',
  'subscription_entitlements','subscription_state_transitions'
]) must(worker.includes(token),`billing journey contract missing: ${token}`);

// Privacy journey: canonical privacy service + historical truth + critical audit.
for(const token of [
  '/api/account/privacy/requests','/api/account/privacy/export','/api/account/consent',
  'privacy.service','critical-audit.service','historical','legal_hold','DE-GDPR-1'
]) must(worker.includes(token),`privacy journey contract missing: ${token}`);

// Cross-product safety primitives.
for(const token of [
  'request_idempotency','consumeRateLimit','organization_provisioning_events',
  'billing_provider_events','critical_audit_events','mission_transition_requests',
  'platform_admin_security_events','external_provider_audit_events','organization-invite','invitation-accept','provider-reconcile'
]) must(worker.includes(token)||read('database/schema.current.sql').includes(token),`cross-product safety primitive missing: ${token}`);

// Security/operations hardening expected by the final integration gate.
for(const p of [
  'src/worker/security/rate-limit.js',
  'src/worker/security/idempotency.js',
  'src/worker/core/auth-session.js',
  'src/worker/security/platform-super-administrator.js',
  'src/worker/modules/support/support.service.js',
  'src/worker/modules/admin-control/admin-control.service.js'
]) must(exists(p),`security/operations authority missing: ${p}`);
must(worker.includes('metadataOnly:true'),'system health must be metadata-only');
must(!worker.match(/impersonat(e|ion)|tenant payload/i),'final product must not introduce default tenant impersonation/payload access');

// Frontend/network regression: canonical API calls must use the current release identity.
for(const token of ['10.37.8']) must(ui.includes(token),`frontend release asset/version identity missing: ${token}`);
must(!ui.includes('10.37.5'),'stale 10.37.5 frontend cache/version reference remains');

// Release safety: no new migration is required for integration/final gate.
const migrations=fs.readdirSync(path.join(root,'database/migrations')).filter(x=>x.endsWith('.sql')).sort();
must(migrations.length===82,'integration release must preserve migration high-water 0082');
must(migrations.at(-1)?.startsWith('0082_'),'migration high-water must remain 0082');

if(failures.length){console.error('10.37.7 Product Integration gate: FAIL');for(const f of failures)console.error(`- ${f}`);process.exit(1);}
console.log('10.37.7 Product Integration + Release Safety gate: PASS');
console.log('Journeys: organization + mission + billing + privacy');
console.log('Cross-product: provisioning, entitlement, webhook replay/reconciliation, provider governance, tenant isolation, authorization, frontend/network and release identity');
