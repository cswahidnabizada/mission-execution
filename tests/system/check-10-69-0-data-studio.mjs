import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const fail=m=>{console.error(`Data Studio gate: FAIL — ${m}`);process.exit(1)};
const route=read('src/worker/modules/admin-control/admin-build-data.routes.js');
const service=read('src/worker/security/platform-data-studio.service.js');
const catalog=read('public/assets/js/frontend/admin/data-catalog.js');
const control=read('public/assets/js/frontend/admin/data-governance.js');
const studio=read('public/assets/js/frontend/admin/data-studio.js');
const registry=read('public/assets/js/frontend/admin/workspace-registry.js');
const css=read('public/assets/css/admin.css');
for(const x of [
  ['/api/platform/admin/data-studio/record',route],
  ['/api/platform/admin/data-studio/preview',route],
  ['/api/platform/admin/data-studio/commit',route],
  ['inspectDataStudioRecord',service],
  ['prepareDataStudioEdit',service],
  ['commitDataStudioEdit',service],
  ['OPEN IN DATA STUDIO',catalog],
  ["show('data-studio')",control],
  ['data-studio',registry],
  ['data-studio-shell',css],
  ['PREVIEW CHANGES',studio],
  ['VALIDATE',studio],
  ['HISTORY',studio],
  ['DEPENDENCIES',studio],
]) if(!x[1].includes(x[0])) fail(`missing ${x[0]}`);
if(/data-catalog-edit[^\n]*EDIT IN DATA ENTRY/.test(catalog)) fail('Catalog still routes record editing to Data Entry');
if(/data-dc-entry[^\n]*DATA ENTRY/.test(control)) fail('Data Control still exposes Data Entry as the deep edit destination');
if(!service.includes("'canonical_edit'")) fail('Studio edit evidence does not use canonical lifecycle action');
console.log('Data Studio 10.70.0 gate: PASS');
