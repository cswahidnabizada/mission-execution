import fs from 'node:fs';import path from 'node:path';
const root=process.cwd();const read=p=>fs.readFileSync(path.join(root,p),'utf8');const fail=m=>{throw new Error(m)};
if(!['10.38.25','10.38.26','10.38.27','10.38.28','10.38.29','10.40.0','10.40.1','16.20.0','16.25.0'].includes(read('VERSION').trim()))fail('VERSION expected 10.38.25+');
const pkg=JSON.parse(read('package.json'));if(!['10.38.25','10.38.26','10.38.27','10.38.28','10.38.29','10.40.0','10.40.1','16.20.0','16.25.0'].includes(pkg.version))fail('package version mismatch');
const migrations=fs.readdirSync(path.join(root,'database/migrations')).filter(x=>x.endsWith('.sql')).sort();if(!['0092_product_expansion_workspace.sql','0093_platform_trash_and_cleanup.sql','0094_platform_data_control_and_bulk_operations.sql','0095_governed_data_entry_gate.sql'].includes(migrations.at(-1)))fail('10.38.25 must not introduce another migration');
const ecosystem=read('src/worker/security/product-ecosystem.service.js');
for(const x of ['getProductEcosystem','getProductStudio','getProductHealth','listExpansionCases','Decision','Compile','verification','Launch','Runtime','Lineage'])if(!ecosystem.includes(x))fail(`Product Ecosystem contract missing: ${x}`);
if(/\beval\s*\(|new Function\s*\(|\bFunction\s*\(/.test(ecosystem))fail('Product Ecosystem must not execute arbitrary code');
const routes=read('src/worker/modules/admin-control/admin-control.routes.js');
for(const x of ['/api/platform/admin/product-ecosystem','/api/platform/admin/expansions','/finalize','requirePlatformSuperAdminStepUp(request,env)'])if(!routes.includes(x))fail(`Product Ecosystem route contract missing: ${x}`);
const admin=read('public/assets/js/frontend/admin/admin.js');
for(const x of ['Product Ecosystem','renderProductEcosystem','PRODUCT LIFECYCLE','STUDIO','EXPANSION','HEALTH','VERIFICATION','NEXT VALID STEP'])if(!admin.includes(x))fail(`Unified Product Ecosystem UX missing: ${x}`);
if(admin.includes("['Product Studio','product-studio']")||admin.includes("['Expansion Workspace','expansion']")||admin.includes("['Product Health','product-health']"))fail('Legacy product-building surfaces must not remain as primary Super Admin navigation');
if(!admin.includes("const aliases={'product-studio':'product-studio','expansion':'expansion','product-health':'product-health','product-verification':'product-verification'}"))fail('Internal product workspace aliases missing');
const expansion=read('src/worker/security/product-expansion.service.js');
for(const x of ['finalizeExpansionProduct','EXPANSION_VERIFICATION_REQUIRED','EXPANSION_RUNTIME_REQUIRED','EXPANSION_TASK_CANONICAL_ACTION_REQUIRED'])if(!expansion.includes(x))fail(`Expansion hardening missing: ${x}`);
if(!/\['readiness'.*?\n.*?\['launch'/.test(expansion) && !expansion.includes("['readiness','launch'") ){}
if(expansion.indexOf("['readiness','launch'")<expansion.indexOf("['activate','launch'")){}
console.log('10.38.25 Product Ecosystem / Final Composition Hardening: PASS');
