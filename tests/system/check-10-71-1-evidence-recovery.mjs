import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const fail=m=>{console.error(`10.71.4 evidence/recovery gate: FAIL — ${m}`);process.exit(1)};
const lifecycle=read('src/worker/security/platform-data-lifecycle.service.js');
const entry=read('src/worker/security/platform-data-entry.service.js');
const studio=read('src/worker/security/platform-data-studio.service.js');
const critical=read('src/worker/security/critical-audit.service.js');
const required=[
  [lifecycle,['ensureDataLifecycleEvent','source_entry_id=?','reused:true'],'lifecycle evidence idempotency'],
  [entry,['canonical_commit_intent','evidence_required','pending_reconciliation','reconcileStaleDataEntryCommits'],'Data Entry evidence/recovery'],
  [studio,['prepareCriticalAudit','canonical_edit_intent','evidence_required','pending_reconciliation'],'Data Studio durable intent/recovery'],
  [critical,['CRITICAL_AUDIT_UNAVAILABLE','phase=\'reconciled\''],'critical audit durability']
];
for(const [source,need,label] of required)for(const needle of need)if(!source.includes(needle))fail(`${label} missing ${needle}`);
if(entry.includes("recordDataLifecycleEvent(env,{resourceType:'data_entry',resourceId:entry.entry_id,previousStage:'VALIDATED',stage:'COMMITTED'") && entry.includes("}).catch(()=>{})"))fail('post-commit Data Entry evidence must not be silently swallowed');
if(studio.includes("action:'canonical_edit_intent'")===false)fail('Data Studio mutation intent evidence missing');
console.log('10.71.4 evidence/recovery gate: PASS');
