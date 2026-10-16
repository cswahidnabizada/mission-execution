import fs from 'node:fs';
import assert from 'node:assert/strict';
const version=fs.readFileSync('VERSION','utf8').trim();
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
const manifest=JSON.parse(fs.readFileSync('RELEASE-MANIFEST.json','utf8'));
const release=fs.readFileSync('RELEASE.md','utf8');
const routes=fs.readFileSync('src/worker/modules/admin-control/objective-orchestrator.routes.js','utf8');
const ui=fs.readFileSync('public/assets/js/frontend/admin/command-center.js','utf8');
assert.equal(version,'16.10.35');
assert.equal(pkg.version,version);
assert.equal(manifest.version,version);
for (const f of [
 'tests/system/check-16-10-21-objective-completion-loop.mjs',
 'tests/system/check-16-10-22-objective-completion-contract.mjs',
 'tests/system/check-16-10-23-gap-dependency-intelligence.mjs',
 'tests/system/check-16-10-24-guided-data-preparation.mjs',
 'tests/system/check-16-10-25-governed-continuation.mjs',
 'tests/system/check-16-10-26-outcome-recovery-loop.mjs']) assert.ok(fs.existsSync(f),`missing cumulative contract ${f}`);
for (const phrase of ['Define','Observe & assess','Prepare','Continue safely','Verify & recover','Close honestly']) assert.ok(release.includes(phrase),`release missing ${phrase}`);
assert.match(routes,/completionAllowed:false/,'completion must remain fail-closed until trusted gate exists');
assert.match(routes,/canonical_verification/,'completion must require trusted verification evidence');
assert.match(routes,/automaticRetry:false/,'recovery must not blindly retry');
assert.match(routes,/objective-runs\/:runId\/complete/,'explicit completion gate must exist');
assert.match(routes,/requirePlatformSuperAdminStepUp\(request,env\)/,'completion must require step-up authorization');
assert.match(routes,/OBJECTIVE_OUTCOME_EVIDENCE_STALE/,'stale evidence must block completion');
assert.match(routes,/OBJECTIVE_COMPLETION_EVIDENCE_INCOMPLETE/,'incomplete evidence must block completion');
assert.match(routes,/OBJECTIVE_COMPLETED_VERIFIED/,'completion must be audited and evented');
assert.match(ui,/objectiveConfirmCompletion/,'Command Center must expose completion confirmation');
assert.match(ui,/objectiveReconcileOutcome/,'Command Center must expose outcome reconciliation');
assert.match(release,/Security → Truth → Liveness → Stability → Experience → Scale/);
assert.match(release,/OBSERVE → UNDERSTAND → PLAN → EVALUATE → ACCEPT → AUTHORIZE → PREPARE → ASSIGN → EXECUTE → EFFECT → VERIFY → RECOVER → OUTCOME → LEARN → NEXT SITUATION → OBSERVE/);
console.log('16.10.27 Unified Objective Completion System: PASS');
