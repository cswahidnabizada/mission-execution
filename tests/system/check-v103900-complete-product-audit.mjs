import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root=process.cwd();
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const fail=[];
const files=[];
function walk(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){if(['node_modules','.git'].includes(e.name))continue;const p=path.join(d,e.name);if(e.isDirectory())walk(p);else files.push(p)}}
walk(root);
const hashes=new Map();
for(const f of files){const h=crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');const a=hashes.get(h)||[];a.push(path.relative(root,f));hashes.set(h,a)}
const dup=[...hashes.values()].filter(x=>x.length>1);
if(dup.length)fail.push(`duplicate file groups: ${dup.length}`);

const routes=read('src/worker/modules/admin-control/admin-control.routes.js');
const entry=read('src/worker/security/platform-data-entry.service.js');
const arch=read('src/worker/core/canonical-architecture-control.js');
const schema=read('database/schema.current.sql');
const migration=read('database/migrations/0096_data_entry_creation_fencing.sql');
const release=read('RELEASE.md');

// Top-level canonical creation routes must enter through the governed gate.
for(const [route,marker] of [
 ['/api/platform/admin/product-definitions','entryType:\'product_definition\''],
 ['/api/platform/admin/country-product-blueprints','entryType:\'country_blueprint\''],
 ['/api/platform/admin/country-product-launches/drafts','entryType:\'country_product_launch\''],
 ['/api/platform/admin/expansions','entryType:\'expansion_case\''],
 ['/api/platform/admin/platform-configurations/drafts',"entryType:'platform_configuration_draft'"]
]){
  const i=routes.indexOf(route);if(i<0)fail.push(`canonical creation route missing: ${route}`);
  else {const slice=routes.slice(i,Math.min(routes.length,i+1800));if(!slice.includes('prepareDataEntry'))fail.push(`creation bypass: ${route}`);if(!slice.includes('commitDataEntry'))fail.push(`creation commit bypass: ${route}`);if(!slice.includes(marker))fail.push(`entry type mismatch: ${route}`);}
}
for(const token of ['DATA_ENTRY_IDEMPOTENCY_REQUIRED','commitCanonical','idempotency_key','canonical_resource_id','DATA_ENTRY_COMMIT_IN_PROGRESS'])if(!entry.includes(token))fail.push(`entry integrity control missing: ${token}`);
for(const token of ['data_entry_id','ux_product_definition_data_entry','ux_country_blueprint_data_entry','ux_country_launch_data_entry','ux_expansion_case_data_entry','ux_configuration_version_data_entry'])if(!migration.includes(token))fail.push(`fencing migration control missing: ${token}`);
for(const table of ['platform_product_definitions','platform_country_product_blueprints','country_product_launches','platform_product_expansion_cases','platform_configuration_versions']){
  if(!schema.includes(`data_entry_id TEXT`))fail.push(`current schema data_entry_id missing: ${table}`);
}
if(!arch.includes('architectureFrozen:true'))fail.push('architecture freeze lost');
if(!arch.includes('lifecycle:["ENTRY","TRUTH","DECISION","CREATION","RUNTIME","CONTROL","TRASH"]'))fail.push('frozen lifecycle changed');
for(const forbidden of ['Data Intelligence Engine','Super Data Engine','Super Data Intelligence Engine'])if(arch.includes(forbidden))fail.push(`forbidden post-freeze architecture: ${forbidden}`);
for(const bad of ['eval(','new Function','unsafe-eval'])if(entry.includes(bad))fail.push(`unsafe entry construct: ${bad}`);
if(!release.includes('Architecture remains frozen'))fail.push('release does not preserve architecture freeze');

console.log(`Complete Product Audit 10.39.0: ${fail.length?'FAIL':'PASS'} (${files.length} files scanned, ${dup.length} duplicate groups)`);
if(fail.length){for(const x of fail)console.error(` - ${x}`);process.exit(1)}
