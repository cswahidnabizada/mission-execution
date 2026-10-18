import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(p,'utf8');
assert.ok(['12.5.3','12.7.0','12.8.0','12.9.0','13.0.0','13.1.0','13.2.0','13.3.0','13.4.0','13.5.0','13.6.0','13.7.0','13.8.0','13.9.0','14.0.0','14.2.0','14.3.0','14.4.0','14.5.0','14.6.0','14.7.0','14.8.0','14.9.0','15.0.0','15.0.1','15.1.0','15.2.0','15.3.0','15.5.0','16.0.0','16.2.0','16.4.0','16.5.0','16.6.0','16.7.0','16.8.0','16.9.0','16.9.1','16.9.2','16.9.3','16.9.4','16.10.0','16.10.1','16.10.10','16.10.11','16.10.12','16.10.13','16.10.14','16.10.15','16.10.16','16.10.17','16.10.18','16.10.19','16.10.20','16.10.21','16.10.22','16.10.23','16.10.24','16.10.25','16.10.26','16.10.27','16.10.28','16.10.29','16.10.30','16.10.31','16.10.32','16.10.33','16.10.34','16.10.35','16.10.36','16.10.37','16.10.39','16.10.40','16.10.41','16.10.43','16.10.44','16.10.45','16.10.46','16.10.47','16.10.48','16.10.49','16.10.50','16.10.51','16.10.52','16.10.53','16.10.54','16.10.55','16.10.56','16.10.57'].includes(read('VERSION').trim()));
const studio=read('public/assets/js/frontend/admin/data-studio.js');
const explorer=read('src/worker/security/platform-resource-explorer.service.js');
const control=read('src/worker/security/platform-data-control.service.js');
const reusable=read('src/worker/security/platform-reusable-data.service.js');
const trash=read('src/worker/security/platform-trash.service.js');
// Data Studio must never reference an undeclared ctx after destructuring its runtime context.
assert.doesNotMatch(studio,/`#\$\{ctx\.mountId/,'Data Studio must not reference undeclared ctx.mountId.');
assert.match(studio,/mountId\}\)\{\s*\n const box=\$\(`#\$\{mountId\|\|'view-data-studio'\}`\)/,'Data Studio must accept its mountId through the runtime context.');
// The unified resource action matrix and canonical reusable authority must agree.
for(const type of ['policy','residency','retention','consent','role','capability','responsibility','provider','plan']){
  assert.match(explorer,new RegExp(`${type}:\\['MANAGE','EDIT','STOP','TRASH','PURGE'\\]`),`${type} must expose governed lifecycle controls.`);
  assert.match(control,new RegExp(`'${type}'`),`${type} must remain in the Data Control canonical type inventory.`);
}
// All reusable types offered by Resources must have a canonical lifecycle authority for stop/trash where exposed.
assert.match(reusable,/country_blueprint:\['platform_country_product_blueprints','id','status'\]/);
assert.match(reusable,/policy:\['platform_reusable_policies','code','active'\]/);
assert.match(reusable,/role:\['organization_role_catalog','role_code','active'\]/);
assert.match(reusable,/provider:\['external_provider_registry','id','active'\]/);
assert.match(reusable,/plan:\['plans','id','active'\]/);
assert.match(trash,/policy:\{table:'platform_reusable_policies',key:'code',active:'active'\}/);
assert.match(trash,/role:\{table:'organization_role_catalog',key:'role_code',active:'active'\}/);
assert.match(trash,/provider:\{table:'external_provider_registry',key:'id',active:'active'\}/);
assert.match(trash,/plan:\{table:'plans',key:'id',active:'active'\}/);
assert.match(trash,/SYSTEM_MANAGED_ROLE_PROTECTED/);
// Evidence failures cannot turn an already-completed reusable deactivation into a false mutation failure.
assert.match(reusable,/evidenceStatus='pending_reconciliation'/);
assert.match(reusable,/Optional reusable-data audit unavailable/);
console.log('12.5.3 Resource control runtime: PASS');
