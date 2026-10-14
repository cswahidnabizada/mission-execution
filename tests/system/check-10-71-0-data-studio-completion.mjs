import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const fail=m=>{console.error(`Data Studio 10.71.0 gate: FAIL — ${m}`);process.exit(1)};
const version=read('VERSION').trim();
if(!/^\d+\.\d+\.\d+$/.test(version))fail(`VERSION is ${version}`);
const pkg=JSON.parse(read('package.json'));if(pkg.version!==version)fail('package version mismatch');
const studio=read('public/assets/js/frontend/admin/data-studio.js');
const service=read('src/worker/security/platform-data-studio.service.js');
const routes=read('src/worker/modules/admin-control/admin-build-data.routes.js');
const css=read('public/assets/css/admin.css');
const requiredStudio=[
 'BASIC','ADVANCED','CHANGE RECORD','dataStudioValidate','dataStudioSave','dataStudioCopyJson',
 'renderOverview','renderEdit','renderPreview','renderJson','renderHistory','renderDependencies','renderGovernance',
 'data-studio-tab="governance"','CONSUMER PREVIEW','REVISION TIMELINE','AUTHORITY & CAPABILITY','DEPENDENCY GATE'
];
for(const needle of requiredStudio)if(!studio.includes(needle))fail(`studio missing ${needle}`);
for(const needle of ['listReusableDataDefinitions','capabilitiesFor','entryHistory','DATA_STUDIO_CHANGE_REASON_REQUIRED','capabilities,record,entry,history','history:{entries'])if(!service.includes(needle))fail(`service missing ${needle}`);
for(const needle of ['dataEntryId:entry.entry_id','expectedUpdatedAt:expected',"quarantineAuthority:'data-control/trash'",'prepareCriticalAudit','canonical_edit_intent','ensureDataLifecycleEvent','evidence_required','pending_reconciliation'])if(!service.includes(needle))fail(`governance/fencing/evidence contract missing ${needle}`);
for(const needle of ['/api/platform/admin/data-studio/record','/api/platform/admin/data-studio/preview','/api/platform/admin/data-studio/commit'])if(!routes.includes(needle))fail(`route missing ${needle}`);
for(const needle of ['data-studio-modebar','data-studio-facts-grid','data-studio-preview-stats','data-studio-timeline','data-studio-relation-group','data-studio-picker-toolbar','data-studio-governance-grid'])if(!css.includes(needle))fail(`css missing ${needle}`);
if(studio.includes('const EDITABLE=new Set(Object.keys(LABELS))'))fail('UI must not infer editability from labels');
if(studio.includes('VALIDATED DRAFT') && !studio.includes('validation?.valid===false'))fail('preview status is not validation-aware');
if(service.includes('DATA_STUDIO_CHANGE_REASON_REQUIRED')===false)fail('server reason enforcement missing');
console.log('Data Studio 10.71.x completion gate: PASS');
