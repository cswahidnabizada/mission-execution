/* ON Mission 11.03.0 — Super Admin Operating System convergence gate. */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {ACTION_REGISTRY} from '../../src/worker/application/actions/action-registry.js';
import {ACTION_SERVICE_MAP} from '../../src/worker/application/actions/action-service-map.js';
import {auditActionRegistry} from '../../src/worker/extensions/actions-intelligence/action-registry-audit.js';
import {getCanonicalAdminActionMatrix,getSuperAdminOperatingSnapshot,searchSuperAdminResources,SUPER_ADMIN_OPERATING_SYSTEM_VERSION} from '../../src/worker/modules/admin-control/super-admin-operating-system.service.js';

const schema=fs.readFileSync('database/schema.current.sql','utf8');
const db=new DatabaseSync(':memory:');db.exec(schema);
const env={DB:{prepare(sql){const statement=db.prepare(sql);let args=[];const api={bind(...values){args=values;return api},all(){return {results:statement.all(...args)}},first(){return statement.get(...args)}};return api;}}};

// Minimal canonical records used only to prove the projection reads existing authorities.
db.prepare(`INSERT INTO companies(name,deletion_status) VALUES(?,?)`).run('Acme GmbH','active');
db.prepare(`INSERT INTO country_catalog(code,name,active) VALUES(?,?,?)`).run('DE','Germany',1);
db.prepare(`INSERT INTO platform_product_country_catalog(code,name,active) VALUES(?,?,?)`).run('DE','Germany',1);
db.prepare(`INSERT INTO country_product_launches(country_code,version,status,active,created_by_type) VALUES(?,?,?,?,?)`).run('DE','4.3.0','active',1,'platform_super_administrator');
db.prepare(`INSERT INTO platform_product_definitions(product_key,name,country_code,sector_code,status,created_by_type) VALUES(?,?,?,?,?,?)`).run('de-logistics','Germany Logistics','DE','logistics','active','platform_super_administrator');
db.prepare(`INSERT INTO platform_admin_operations(operation_key,action_code,resource_type,status,actor_type) VALUES(?,?,?,?,?)`).run('op-482','publish','country_product_launch','verifying','platform_super_administrator');
db.prepare(`INSERT INTO platform_configuration_versions(configuration_id,domain_code,config_key,version,status,payload_json,created_by_type) VALUES(?,?,?,?,?,?,?)`).run('human-work-platform','rendering','human-work-platform','3','active','{}','platform_super_administrator');
db.prepare(`INSERT INTO missions(company_id,reference,status,country_code,sector_code) VALUES(?,?,?,?,?)`).run(1,'M-48192','Pending','DE','logistics');

const problems=auditActionRegistry();assert.deepEqual(problems,[],`canonical Action Registry audit failed: ${problems.join(', ')}`);
const matrix=getCanonicalAdminActionMatrix();
assert.equal(matrix.length,Object.keys(ACTION_REGISTRY).length,'matrix must expose exactly the canonical registry actions');
assert.equal(new Set(matrix.map(x=>x.code)).size,matrix.length,'action matrix contains duplicate action codes');
assert.ok(matrix.every(x=>x.canonical===true&&x.executableByControlPlane===false),'Control Plane must not claim direct canonical action execution authority');
assert.ok(matrix.every(x=>ACTION_SERVICE_MAP[x.code]),'every matrix action must have an existing Action Service Map route');
assert.ok(matrix.every(x=>x.executionBoundary.includes('Canonical Action Application Service')),'every action must declare the canonical execution boundary');

const snapshot=await getSuperAdminOperatingSnapshot(env);
assert.equal(snapshot.version,SUPER_ADMIN_OPERATING_SYSTEM_VERSION);
assert.equal(snapshot.authoritative,false);
assert.equal(snapshot.readOnlyProjection,true);
assert.equal(snapshot.platform.organizations,1);
assert.equal(snapshot.platform.liveProducts,1);
assert.equal(snapshot.platform.activeMissions,1);
assert.equal(snapshot.platform.operationsInFlight,1);
assert.equal(snapshot.operations[0].operation_key,'op-482');
assert.ok(snapshot.architecture.mutationBoundary.includes('No Control Plane-specific SQL mutation authority'));

const search=await searchSuperAdminResources(env,'Acme',{limit:20});
assert.equal(search.results.length,1,'resource search should find the organization through canonical company data');
assert.equal(search.results[0].type,'tenant');
assert.equal(search.results[0].workspace,'companies');

const productSearch=await searchSuperAdminResources(env,'Germany Logistics',{limit:20});
assert.ok(productSearch.results.some(x=>x.type==='product'),'resource search should find canonical product definition');

// The service must never expose an arbitrary SQL or mutation operation as a Control Plane action.
const source=fs.readFileSync('src/worker/modules/admin-control/super-admin-operating-system.service.js','utf8');
assert.ok(!source.includes('.run(')&&!source.includes('.exec('),'Operating System projection must not contain direct database mutation execution');
assert.ok(source.includes('ACTION_REGISTRY')&&source.includes('ACTION_SERVICE_MAP'),'Operating System must derive action metadata from canonical registries');

console.log(`11.04.0 Super Admin Operating System continuity gate: PASS`);
console.log(`Canonical actions: ${matrix.length}; organizations: ${snapshot.platform.organizations}; live products: ${snapshot.platform.liveProducts}; resource search: PASS`);
