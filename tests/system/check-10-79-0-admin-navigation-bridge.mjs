import fs from 'node:fs';
import assert from 'node:assert/strict';

const root=new URL('../../',import.meta.url).pathname;
const version=fs.readFileSync(`${root}VERSION`,'utf8').trim();
const context=fs.readFileSync(`${root}public/assets/js/frontend/admin/oversight/context.js`,'utf8');
const admin=fs.readFileSync(`${root}public/assets/js/frontend/admin/admin.js`,'utf8');
const panel=fs.readFileSync(`${root}public/assets/js/frontend/admin/panel-registry.js`,'utf8');
const shell=fs.readFileSync(`${root}public/assets/js/frontend/admin/shell.js`,'utf8');
const command=fs.readFileSync(`${root}public/assets/js/frontend/admin/command-center.js`,'utf8');

assert.match(context,/const NAVIGATION_KEY='__ON_MISSION_CANONICAL_ADMIN_NAVIGATE__'/,'navigation bridge key missing');
assert.match(context,/globalThis\[NAVIGATION_KEY\]=fn/,'canonical navigation is not bound to the process-global bridge');
assert.match(context,/const fn=globalThis\[NAVIGATION_KEY\]\|\|localNavigate/,'navigation does not resolve through the canonical global bridge');
assert.match(admin,/setAdminShow\(show\)/,'admin bootstrap does not bind canonical navigation');
assert.match(panel,/setAdminShow\(show\)/,'panel registry is not composed with canonical navigation');
assert.match(shell,/data-view="overview"/,'Control Plane shell does not expose canonical overview navigation');
assert.match(command,/typeof navigate!==['"]function['"]/,'Command Center lacks navigation dependency guard');
assert.match(command,/await navigate\(key\)/,'Command Center actions do not use canonical navigation');

const adminJs=[...fs.readFileSync(`${root}public/assets/js/frontend/admin/admin.js`,'utf8').matchAll(/\?v=(\d+\.\d+\.\d+)/g)].map(m=>m[1]);
const unique=[...new Set(adminJs)];
assert.equal(unique.length,1,'admin bootstrap has inconsistent cache identity');
assert.equal(unique[0],version,`admin bootstrap cache identity is ${unique[0]}, expected ${version}`);

console.log(`${version} Admin navigation bridge: PASS`);
