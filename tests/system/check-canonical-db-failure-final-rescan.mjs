import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const failures=[];
const assert=(ok,msg)=>{if(!ok)failures.push(msg)};
const version=read('VERSION').trim();
assert(/^\d+\.\d+\.\d+$/.test(version),`final rescan release is invalid: ${version}`);
const workerFiles=[];
function walk(dir){for(const name of fs.readdirSync(path.join(root,dir))){const rel=path.join(dir,name),full=path.join(root,rel);const st=fs.statSync(full);if(st.isDirectory())walk(rel);else if(name.endsWith('.js'))workerFiles.push(rel)}}
walk('src/worker');
for(const file of workerFiles){
  const text=read(file);
  if(/\.catch\(\(\)=>null\)|\.catch\(\(\) => null\)|\.catch\(\(\)=>\[\]\)|\.catch\(\(\) => \[\]\)/.test(text))failures.push(`${file}: silent null/empty catch remains`);
}
const account=read('src/worker/modules/account/account.service.js');
assert(!account.includes('async function safe(env,sql'), 'account compatibility DB fallback helper remains');
const frontend=read('public/assets/js/frontend/admin/admin.js');
const runtime=read('public/assets/js/frontend/admin/admin-runtime.js');
const controller=read('public/assets/js/frontend/admin/admin-controller.js');
assert(runtime.includes('export const api=') && runtime.includes('export const state=') || runtime.includes('export let state='), 'admin frontend runtime boundary missing canonical exports');
assert(controller.includes('createAdminController') && controller.includes('showSectionError'), 'admin frontend controller boundary missing');
assert(frontend.includes(`./admin-runtime.js?v=${version}`), 'admin frontend does not use the runtime boundary');
assert(frontend.includes(`./admin-controller.js?v=${version}`), 'admin frontend does not use the controller boundary');
assert(!frontend.includes('function show(v){'), 'admin monolithic navigation controller remains');
const htmlFiles=['public/platform/access/admin/index.html'];
for(const file of htmlFiles){const text=read(file);assert(text.includes(`/assets/js/frontend/admin/admin.js?v=${version}`),`${file}: stale admin runtime reference`)}
if(failures.length){console.error('Canonical DB failure final rescan: FAIL');for(const f of failures)console.error('- '+f);process.exit(1)}
console.log(`Canonical DB failure final rescan: PASS (${workerFiles.length} worker JS files, release ${version})`);
