import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const fail=[];
const mustExist=[
 'src/worker/extensions/mission-management/custody-responsibility/canonical-custody-responsibility.service.js',
 'public/assets/js/extensions/canonical-custody-responsibility-ui-103056.js',
 'public/assets/js/core/canonical-ui-components-103056.js',
 'public/assets/css/canonical-ui-components-103056.css'
];
const mustDelete=[
 'src/worker/extensions/mission-management/custody/custody.service.js',
 'src/worker/extensions/mission-management/custody/custody.repository.js',
 'src/worker/extensions/mission-management/custody/current-custody-holder.service.js',
 'src/worker/extensions/mission-management/custody/custody.policy.js',
 'src/worker/modules/assignments/execution-ownership.service.js',
 'src/worker/modules/assignments/assignment.service.js',
 'public/assets/js/extensions/custody-workspace.js',
 'public/assets/js/extensions/transfer-custody-module.js',
 'public/assets/js/core/assignment-state.js',
];
for(const f of mustExist)if(!fs.existsSync(path.join(root,f)))fail.push(`missing:${f}`);
for(const f of mustDelete)if(fs.existsSync(path.join(root,f)))fail.push(`legacy_file_present:${f}`);

const all=[];function walk(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){if(['node_modules','.git'].includes(e.name))continue;const p=path.join(d,e.name);if(e.isDirectory())walk(p);else all.push(p);}}walk(root);
const patterns=[/custody\/custody\.service\.js/,/custody\/custody\.repository\.js/,/custody\/current-custody-holder\.service\.js/,/custody\/custody\.policy\.js/,/execution-ownership\.service\.js/,/modules\/assignments\/assignment\.service\.js/,/extensions\/custody-workspace\.js/,/extensions\/transfer-custody-module\.js/,/core\/assignment-state\.js/,];
for(const p of all.filter(x=>/\.(js|html|css)$/.test(x))){const t=fs.readFileSync(p,'utf8');for(const re of patterns)if(re.test(t))fail.push(`legacy_reference:${path.relative(root,p)}:${re}`);}

// Backend local-import integrity: deployment must never ship a broken relative import.
const backendRoot=path.join(root,'src/worker');
const backendMissing=[];
function walkBackend(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){if(['node_modules','.git'].includes(e.name))continue;const p=path.join(d,e.name);if(e.isDirectory())walkBackend(p);else if(e.isFile()&&e.name.endsWith('.js')){const t=fs.readFileSync(p,'utf8');for(const m of t.matchAll(/(?:from|import\s*\()\s*["']([^"']+)["']/g)){const spec=m[1];if(!spec.startsWith('.'))continue;let target=path.resolve(path.dirname(p),spec);if(!path.extname(target))target+='.js';if(!fs.existsSync(target))backendMissing.push(`${path.relative(root,p)} -> ${spec}`);}}}}
walkBackend(backendRoot);
if(backendMissing.length)for(const x of backendMissing)fail.push(`backend_missing_import:${x}`);

const canonical=fs.readFileSync(path.join(root,mustExist[0]),'utf8');
for(const token of ['CANONICAL_CUSTODY_RESPONSIBILITY_VERSION','buildCanonicalCustodyResponsibility','validateCanonicalCustodyResponsibility','executionOwnershipSnapshot','assertSingleExecutionOwner','openCustodyTransfer','acceptCustody','assignDriver','reclaimExecution'])if(!canonical.includes(token))fail.push(`canonical_missing:${token}`);
const ui=fs.readFileSync(path.join(root,mustExist[1]),'utf8');
for(const token of ['renderTransferCustodyWorkbench','renderTransferCustodyActorCase','bindTransferCustodyActor','custodyResponsibilityComponent'])if(!ui.includes(token))fail.push(`ui_missing:${token}`);
const registry=fs.readFileSync(path.join(root,mustExist[2]),'utf8');
if(!registry.includes('custodyResponsibilityComponent'))fail.push('ui_registry_missing:custodyResponsibilityComponent');
if(!fs.readFileSync(path.join(root,'public/admin.html'),'utf8').includes('canonical-ui-components-103056.css'))fail.push('admin_not_registered:canonical-ui-components-103056.css');
if(!fs.readFileSync(path.join(root,'public/missions.html'),'utf8').includes('canonical-custody-responsibility-ui-103056.js'))fail.push('missions_not_registered:canonical-custody-responsibility-ui-103056.js');
if(!fs.readFileSync(path.join(root,'public/driver/dashboard.html'),'utf8').includes('canonical-custody-responsibility-ui-103056.js'))fail.push('driver_not_registered:canonical-custody-responsibility-ui-103056.js');

const checks=[
 ['canonical-service-syntax','src/worker/extensions/mission-management/custody-responsibility/canonical-custody-responsibility.service.js'],
 ['canonical-ui-syntax','public/assets/js/extensions/canonical-custody-responsibility-ui-103056.js'],
 ['canonical-components-syntax','public/assets/js/core/canonical-ui-components-103056.js']
];
for(const [name,f] of checks){const r=spawnSync(process.execPath,['--check',path.join(root,f)],{encoding:'utf8'});if(r.status!==0)fail.push(`${name}:${r.stderr||r.stdout}`);}

if(fail.length){console.error('FAIL 10.30.45 Custody Compatibility Regression');for(const x of fail)console.error(` - ${x}`);process.exit(1);}
console.log('PASS 10.30.45 Custody Compatibility Regression: legacy custody/responsibility authorities removed and canonical service/UI registered');
