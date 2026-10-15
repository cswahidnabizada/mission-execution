import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=process.cwd();
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const version=read('VERSION').trim();
const versionAtLeast=(actual,minimum)=>{const a=String(actual).split('.').map(Number),b=String(minimum).split('.').map(Number);if(a.length!==3||b.length!==3||!a.every(Number.isInteger)||!b.every(Number.isInteger))return false;for(let i=0;i<3;i++){if(a[i]!==b[i])return a[i]>b[i];}return true;};
assert.ok(versionAtLeast(version, '10.82.0'),`VERSION is ${version}`);
const surfaces={
 build:'public/assets/js/frontend/admin/surfaces/build.js',
 operate:'public/assets/js/frontend/admin/surfaces/monitor.js',
 control:'public/assets/js/frontend/admin/surfaces/control.js',
 governance:'public/assets/js/frontend/admin/surfaces/governance.js',
 operations:'public/assets/js/frontend/admin/surfaces/operations.js'
};
for(const [key,file] of Object.entries(surfaces)){
  assert.ok(fs.existsSync(path.join(root,file)),`Missing ${key} surface module`);
  assert.ok(read(file).includes('export const'),`${key} surface must export a composition object`);
}
const facade=read('public/assets/js/frontend/admin/oversight-panels.js');
for(const surface of ['build','monitor','control','governance','operations'])assert.ok(facade.includes(`./surfaces/${surface}.js?v=${version}`),`Facade cache identity mismatch for ${surface}`);
assert.ok(Buffer.byteLength(facade)<9000,'Oversight facade remains too large');
const shell=read('public/assets/js/frontend/admin/shell.js');
for(const token of ['CONTROL CENTER','AUTHORITY BOUNDARY','CURRENT CONTEXT','SUPER ADMIN'])assert.ok(shell.includes(token),`Shell missing current architecture marker: ${token}`);
const css=read('public/assets/css/admin-control.css');
for(const token of ['.control-plane-map','.nav-surface-items button.active','.control-journey-bar'])assert.ok(css.includes(token),`Admin design system missing ${token}`);
const html=read('public/platform/access/admin/index.html');
assert.ok(html.includes(`admin.js?v=${version}`),'Admin entrypoint cache identity mismatch');
console.log('10.82.0 Super Admin Physical Decomposition + UI Architecture: PASS');
console.log(`Surface modules: ${Object.keys(surfaces).length}`);
console.log(`Oversight facade bytes: ${Buffer.byteLength(facade)}`);
