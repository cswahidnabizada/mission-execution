import fs from 'node:fs';

const runtime=fs.readFileSync('public/assets/js/extensions/operations-context-runtime.js','utf8');
const rendering=fs.readFileSync('public/assets/js/extensions/operations-rendering-capability.js','utf8');
const actions=fs.readFileSync('public/assets/js/extensions/operations-actions-capability.js','utf8');

const checks=[
  ['Create entry selects workbench mode', /intent==="create"[\s\S]{0,900}state\.operationMode="workbench"/],
  ['Create entry renders intake before shell convergence', /intent==="create"[\s\S]{0,900}renderIntakeComponent\(\);\s*setShell\(\);/],
  ['Create entry does not rerender generic queue', /intent==="create"[\s\S]{0,1000}renderIntakeComponent\(\);\s*setShell\(\);\s*renderContext\(\)/],
  ['Queue preserves active intake workbench', /state\.section==="intake"&&state\.operationMode==="workbench"/],
  ['Intake component writes the mission form', /opsCreatePickupCompany[\s\S]{0,3000}CREATE MISSION/],
  ['Create driver route exists', /kind==="createDriver"/],
  ['Create customer route exists', /kind==="createCustomer"/]
];
let failed=0;
for(const [name,re] of checks){const ok=re.test(name==='Create entry does not rerender generic queue'?runtime: name.includes('Create entry')?runtime: name.includes('Queue')?rendering: name.includes('Intake')?actions: name.includes('driver')||name.includes('customer')?actions:''); console.log(`${ok?'PASS':'FAIL'} ${name}`); if(!ok)failed++;}
if(failed)process.exit(1);
console.log('Operations Create Workbench contract: PASS');
