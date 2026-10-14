import assert from 'node:assert/strict';
const mod=await import(`../../public/assets/js/frontend/admin/governance-readiness.js?runtime=${Date.now()}`);
const healthy=mod.governanceReadiness({
 privacySummary:{counts:{received:0,processing:0,restricted:0}},
 consentPolicies:[{active:true}], residency:[{active:true}],
 externalProviderGovernance:{providers:[{active:true,contract_status:'approved'}],policies:[],audits:[]},
 analyticsGovernance:{policies:[{active:true}]}, notificationGovernance:{policies:[{active:true}]},
 backupRecoveryGovernance:{backups:[{}],restoreRequests:[]}, complianceEvidence:{metrics:{activeResidencyPolicies:1,activeProviders:1,evidenceRecords:4}}
});
assert.equal(healthy.overall,'PROTECTED');
assert.equal(healthy.unavailable.length,0);
const degraded=mod.governanceReadiness({privacySummary:{counts:{processing:1}},consentPolicies:[],residency:[],externalProviderGovernance:{providers:[],policies:[],audits:[]},analyticsGovernance:{policies:[]},notificationGovernance:{policies:[]},backupRecoveryGovernance:{backups:[],restoreRequests:[]},complianceEvidence:{metrics:{activeResidencyPolicies:1,activeProviders:1,evidenceRecords:1}}});
assert.equal(degraded.overall,'ATTENTION');
assert.ok(degraded.attention.some(x=>x.key==='privacy'));
const unavailable=mod.governanceReadiness({});
assert.equal(unavailable.overall,'UNAVAILABLE');
assert.equal(unavailable.unavailable.length,8);
console.log('10.60.0 governance runtime gate: PASS');
