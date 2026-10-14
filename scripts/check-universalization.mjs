import fs from 'node:fs'; import path from 'node:path';
const root=process.cwd();
const read=p=>fs.readFileSync(path.join(root,p),'utf8'); const failures=[];
const manifest=read('src/worker/core/canonical-domain-registry.js');
for(const term of ['mission','organization','people','object','resource','relationship','communication','evidence','policy','capability','logistics']) if(!manifest.includes(`${term}:`)) failures.push(`canonical domain missing: ${term}`);
const cap=read('src/worker/core/canonical-capability-registry.js'); if(!cap.includes('logistics:{domain:"logistics"')) failures.push('logistics capability boundary missing');
const vocab=read('src/worker/core/canonical-vocabulary.js'); if(!vocab.includes('cargo')||!vocab.includes('logistics')) failures.push('cargo/logistics vocabulary missing');
const migration=read('database/migrations/0077_canonical_domain_capability_universalization.sql');
for(const t of ['canonical_domain_registry','canonical_capability_registry','canonical_relationship_type_registry','canonical_vocabulary_registry','canonical_object_type_registry']) if(!migration.includes(`CREATE TABLE IF NOT EXISTS ${t}`)) failures.push(`migration missing ${t}`);
const runtime=read('public/assets/js/extensions/canonical-dashboard-runtime.js');
for(const t of ['objects:','data-exp-area="objects"','data-exp-panel=','labelMap']) if(!runtime.includes(t)) failures.push(`UI runtime missing ${t}`);
if(!cap.includes('logistics')) failures.push('UI capability surface missing logistics');
for(const [file,bad] of [['public/admin.html',/>Drivers</],['public/assets/js/core/global-nav.js',/driver:'Driver'/],['public/assets/js/extensions/canonical-dashboard-runtime.js',/Driver management\./],['public/assets/js/extensions/canonical-dashboard-runtime.js',/>Driver assignment required</]]) if(bad.test(read(file))) failures.push(`legacy user-facing vocabulary remains in ${file}`);
if(failures.length){console.error('Universalization gate: FAIL'); failures.forEach(x=>console.error(`- ${x}`)); process.exit(1)}
console.log('Universalization gate: PASS');
