import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
const root=process.cwd();
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const trash=read('src/worker/security/platform-trash.service.js');
const control=read('src/worker/security/platform-data-control.service.js');
const ui=read('public/assets/js/frontend/admin/data-governance.js');
const runtime=read('public/assets/js/frontend/admin/admin-runtime.js');
const routes=read('src/worker/modules/admin-control/admin-build-data.routes.js');
const migration=read('database/migrations/0114_platform_lifecycle_purge_hardening.sql');
assert.match(trash,/FROM jurisdiction_policies WHERE country_code=\? AND status='active'/,'Trash country dependency scan must use jurisdiction_policies');
assert(!/sector_policies WHERE jurisdiction_code=\?/.test(trash),'Trash must not query nonexistent sector_policies.jurisdiction_code');
assert(!/\.all\(\)\.catch\(\(\)=>\(\{results:\[\]\}\)\)/.test(trash),'Canonical Trash reads must not silently convert DB failure into empty data');
for(const t of ['country_blueprint','product_definition','country_product_launch','expansion_case','data_entry'])assert(control.includes(`resourceType==='${t}'`)||control.includes(`resourceType==='${t}'`),`Data Control resource support missing: ${t}`);
for(const t of ['authorizeDataControl','authorizeTrash','/api/platform/admin/trash/candidates/bulk','/api/platform/admin/trash/empty','DELETE PERMANENTLY','EMPTY TRASH · PURGE SAFE ITEMS'])assert(ui.includes(t),`Super Admin lifecycle UI missing: ${t}`);
for(const t of ['/api/platform/admin/trash/candidates','/api/platform/admin/trash/candidates/bulk','/api/platform/admin/trash/empty','/api/platform/admin/data-control/action','/api/platform/admin/data-control/bulk'])assert(routes.includes(t),`Lifecycle route missing: ${t}`);
for(const t of ['authenticated===false','verified.stepUpActive','No mutation was executed'])assert(runtime.includes(t),`Step-up reliability control missing: ${t}`);
assert(migration.includes('platform_lifecycle'),'Lifecycle governance migration missing');
// Compile the exact high-risk Trash candidate SQL against the current canonical schema.
const db=new DatabaseSync(':memory:');
db.exec(fs.readFileSync(path.join(root,'database/schema.current.sql'),'utf8'));
const q=[
`SELECT c.id,c.name,c.created_at,COALESCE(cmp.updated_at,c.created_at) updated_at,c.deletion_status,cmp.legal_name,cmp.trading_name,cmp.status management_status FROM companies c LEFT JOIN company_management_profiles cmp ON cmp.company_id=c.id WHERE c.deletion_status='active' ORDER BY c.id`,
`SELECT COUNT(*) count FROM jurisdiction_policies WHERE country_code=? AND status='active'`,
`SELECT COUNT(*) count FROM sector_policies WHERE sector_code=? AND status='active'`,
`SELECT id,expansion_key,target_country_code,target_sector_code,status,stage,updated_at FROM platform_product_expansion_cases WHERE status IN ('planning','preparing','composing','blocked','retired') ORDER BY updated_at DESC`,
`SELECT entry_id,entry_type,source_type,classification,purpose,risk_level,status,canonical_resource_type,canonical_resource_id,country_scope,created_at,committed_at FROM platform_data_entry_records WHERE entry_id LIKE ? ORDER BY id DESC LIMIT ?`
];
db.prepare(q[0]).all(); db.prepare(q[1]).all('DE'); db.prepare(q[2]).all('general'); db.prepare(q[3]).all(); db.prepare(q[4]).all('%',10);
console.log('10.60.0 Super Admin lifecycle reliability and canonical SQL gate: PASS');
