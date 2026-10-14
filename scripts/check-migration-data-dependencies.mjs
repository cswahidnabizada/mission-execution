import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd(),dir=path.join(root,'database','migrations');
const files=fs.readdirSync(dir).filter(f=>f.endsWith('.sql')).sort();
const index=new Map(files.map((f,i)=>[f,i]));
const text=new Map(files.map(f=>[f,fs.readFileSync(path.join(dir,f),'utf8')]));
const failures=[];
const requireBefore=(child,seed,description)=>{
  const ci=index.get(child), positions=files.filter((f,i)=>i<(ci??-1)&&text.get(f)?.includes(seed));
  if(ci===undefined) failures.push(`${description}: migration ${child} missing`);
  else if(!positions.length) failures.push(`${description}: no earlier migration seeds ${seed}`);
};
requireBefore('0076_compliance_evidence_control_plane.sql',"'DE_PRIVACY_REQUESTS'",'0076 retention dependency');
requireBefore('0077_canonical_domain_capability_universalization.sql',"'DE_COMPLIANCE_REVIEW'",'0077 compliance retention dependency');
requireBefore('0078_product_foundation.sql',"'DE_ACCOUNT_DEFAULT'",'0078 account retention dependency');
requireBefore('0078_product_foundation.sql',"'DE_SECURITY_AUDIT'",'0078 security retention dependency');
requireBefore('0078_product_foundation.sql',"'DE_COMPLIANCE_REVIEW'",'0078 compliance retention dependency');
requireBefore('0118_data_entry_reusable_types.sql','ADD COLUMN commit_recovery_status','0118 Data Entry ledger recovery-state dependency');
requireBefore('0118_data_entry_reusable_types.sql','ADD COLUMN commit_attempt','0118 Data Entry ledger attempt-counter dependency');
const expansion=text.get('0092_product_expansion_workspace.sql')||'';
const classificationPos=expansion.indexOf('INSERT OR IGNORE INTO data_classification_registry');
for(const seed of ["'product_expansion'","'DE_PRODUCT_EXPANSION_REVIEW'"]){const pos=expansion.indexOf(seed);if(pos<0 || (classificationPos>=0 && pos>classificationPos)) failures.push(`0092 expansion seed must precede classification reference: ${seed}`);}
for(const [child,parentTable,childTable] of [
 ['0077_canonical_domain_capability_universalization.sql','canonical_domain_registry','canonical_capability_registry'],
 ['0077_canonical_domain_capability_universalization.sql','canonical_capability_registry','canonical_relationship_type_registry'],
 ['0077_canonical_domain_capability_universalization.sql','canonical_capability_registry','canonical_object_type_registry']
]){const s=text.get(child)||'';if(!s.includes(parentTable)||!s.includes(childTable))failures.push(`${child}: missing schema dependency ${parentTable} → ${childTable}`);}
if(failures.length){console.error('Migration data dependency gate: FAIL');failures.forEach(x=>console.error(`- ${x}`));process.exit(1);}
console.log(`Migration data dependency gate: PASS (${files.length} migrations inspected)`);
