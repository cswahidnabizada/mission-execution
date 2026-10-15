import assert from 'node:assert/strict';
import {assessMarketLaunchEvidence, requireMarketLaunchEvidence} from '../../src/worker/security/market-launch-evidence.js';

const weak = [
  {summary:'i resolved the market lifecycle', evidenceRef:'test one'},
  {summary:'done', evidenceRef:'evidence'},
  {summary:'Reviewed the market lifecycle and confirmed the intended state.', evidenceRef:'placeholder'},
  {summary:'Reviewed the market lifecycle and confirmed the intended state.', evidenceRef:'http://example.com/proof'},
];
for (const item of weak) assert.equal(assessMarketLaunchEvidence(item).valid, false, `weak evidence must fail: ${JSON.stringify(item)}`);
assert.throws(() => requireMarketLaunchEvidence(weak[0]), error => error.code === 'MARKET_LAUNCH_EVIDENCE_QUALITY_INSUFFICIENT' && error.status === 422);
const strong = {summary:'Inspected the Germany logistics market lifecycle in the release review and recorded the approved transition decision.', evidenceRef:'release-review/DE-logistics/decision-2026-10-15.md'};
assert.equal(assessMarketLaunchEvidence(strong).valid, true);
assert.equal(requireMarketLaunchEvidence(strong).valid, true);
const service = (await import('../../src/worker/security/market-factory.service.js')).updateMarketLaunchTask.toString();
assert.match(service,/requireMarketLaunchEvidence\(evidence\)/);
console.log('16.10.28 Market Launch Evidence Integrity: PASS');
