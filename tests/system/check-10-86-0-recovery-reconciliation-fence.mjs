import fs from 'node:fs';
import assert from 'node:assert/strict';

const read=p=>fs.readFileSync(p,'utf8');
const version=read('VERSION').trim();
assert.match(version,/^(?:10\.(8[7-9]|9\d)|(?:11\.0[23456789]|(?:11\.1[0-8]|12\.[0-9]+|13\.[0-9]+|14\.[0-9]+|15\.[0-9]+|16\.[0-9]+)))\./);
const safety=read('src/worker/modules/transitions/transition-safety.service.js');
const release=read('RELEASE.md');
const pkg=JSON.parse(read('package.json'));

assert.equal(pkg.version,version,'package version must match canonical VERSION');
assert.match(safety,/state_lock_token=\?,state_lock_at=CURRENT_TIMESTAMP/,'reconciliation must acquire the canonical mission state lease');
assert.match(safety,/WHERE id=\? AND company_id=\? AND state_version=\? AND state_lock_token IS NULL/,'reconciliation lease must be compare-and-set fenced by state_version');
assert.match(safety,/readMissionFence/,'reconciliation must capture the canonical state fence');
assert.match(safety,/sameMissionFence/,'reconciliation must compare the canonical state fence before committing recovery');
assert.match(safety,/canonical_truth_changed_during_reconciliation/,'concurrent canonical changes must remain recovery-required');
assert.match(safety,/canonical_truth_changed_before_reconciliation_commit/,'a truth change before recovery commit must not be marked reconciled');
assert.match(safety,/reconciliation_lease_release_failed/,'loss of the recovery lease must remain explicit');
assert.match(safety,/SET state_lock_token=NULL,state_lock_at=NULL/,'reconciliation must release its lease without silently inventing a domain transition');
assert.match(release,/10\.86\.0/,'release documentation must retain the reconciliation-fence lineage');
assert.match(release,/reconciliation fence/i,'release documentation must describe the reconciliation fence');
console.log('10.87.0 Recovery/Reconciliation Fence Contract: PASS');
