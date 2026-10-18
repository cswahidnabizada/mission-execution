import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const fail=[];
const reusable=read('src/worker/security/platform-reusable-data.service.js');
const entry=read('src/worker/security/platform-data-entry.service.js');
const ui=read('public/assets/js/frontend/admin/data-governance.js');
const catalog=read('public/assets/js/frontend/admin/data-catalog.js');
const factory=read('public/assets/js/frontend/admin/product-publisher.js');
const route=read('src/worker/modules/admin-control/admin-build-data.routes.js');
const version=read('VERSION').trim();
if(!['10.64.0','10.67.0','10.68.0','10.70.0','10.71.0','10.71.4','10.71.6','10.71.8','10.71.9','10.72.0','10.73.0','10.74.0','10.75.0','10.76.0','10.76.1','10.77.0','10.78.0','10.79.0','10.81.0','10.82.0','10.83.0','10.85.1','10.85.2','10.87.0','10.88.0','10.89.0','10.90.0','10.91.0','10.92.0','10.93.0','10.94.0','10.95.0','10.97.0','11.02.0','11.03.0','11.04.0','11.04.1','11.05.0','11.05.1','11.06.0','11.07.0','11.08.0','11.08.1','11.09.0','11.10.0','11.11.0','11.12.0','11.13.0','11.14.0','11.15.0','11.16.0','11.17.0','11.18.0','12.0.0','12.0.1','12.1.0','12.2.0','12.3.0','12.4.0','12.4.1','12.5.0','12.5.1','12.5.2','12.5.3','12.6.0','12.7.0','12.8.0','12.9.0','13.0.0','13.1.0','13.2.0','13.3.0','13.4.0','13.5.0','13.6.0','13.7.0','13.8.0','13.9.0','14.0.0','14.2.0','14.3.0','14.4.0','14.5.0','14.6.0','14.7.0','14.8.0','14.9.0','15.0.0','15.0.1','15.1.0','15.2.0','15.3.0','15.5.0','16.0.0','16.2.0','16.4.0','16.5.0','16.6.0','16.7.0','16.8.0','16.9.0','16.9.1','16.9.2','16.9.3','16.9.4','16.10.0','16.10.1','16.10.10','16.10.11','16.10.12','16.10.13','16.10.14','16.10.15','16.10.16','16.10.17','16.10.18','16.10.19','16.10.20','16.10.21','16.10.22','16.10.23','16.10.24','16.10.25','16.10.26','16.10.27','16.10.28','16.10.29','16.10.30','16.10.31','16.10.32','16.10.33','16.10.34','16.10.35','16.10.36','16.10.37','16.10.39','16.10.40','16.10.41','16.10.43','16.10.44','16.10.45','16.10.46','16.10.47','16.10.48','16.10.49','16.10.50','16.10.51','16.10.52','16.10.53','16.10.54','16.10.55'].includes(version)) fail.push(`VERSION is ${version}, expected a supported release identity`);
for(const needle of ['REUSABLE_AUTHORITY_COLUMNS','schemaMismatches','projectionErrors','AUTHORITY_QUERY_UNAVAILABLE']) if(!reusable.includes(needle)) fail.push(`runtime hardening missing: ${needle}`);
if(!reusable.includes("return {data:out,readiness,projectionErrors};")) fail.push('reusable projection does not expose per-authority errors');
if(!entry.includes("dataEntryId:entry.entry_id")) fail.push('canonical Data Entry provenance fence missing');
const componentLine=entry.match(/case 'component':[\s\S]{0,500}/)?.[0]||'';
if(!componentLine.includes('dataEntryId:entry.entry_id')) fail.push('component commit loses Data Entry provenance');
if(!entry.includes("case 'configuration': return createReusableData(env,actor,'configuration',{...p,dataEntryId:entry.entry_id},requestId);")) fail.push('configuration commit loses Data Entry provenance');
if((entry.match(/case 'country_blueprint'/g)||[]).length>1) fail.push('duplicate/unreachable country_blueprint canonical commit branch remains');
for(const needle of ['catalogCommunicationError','unavailableTypes','is-unavailable','CATALOG READINESS']) if(!ui.includes(needle)) fail.push(`Data Entry resilience UX missing: ${needle}`);
if(!catalog.includes('CATALOG READINESS')) fail.push('Data Catalog readiness communication missing');
for(const needle of ['returnView:\'product-publisher\'','dataEntryContext']) if(!factory.includes(needle)) fail.push(`Product Factory context bridge missing: ${needle}`);
if(!route.includes('/api/platform/admin/data-entry/reusable-readiness')) fail.push('readiness route missing');

const tables=['platform_country_product_blueprints','platform_product_country_catalog','platform_reusable_sectors','platform_reusable_languages','platform_reusable_currencies','platform_reusable_regions','platform_reusable_classifications','platform_reusable_policies','consent_policy_versions','organization_role_catalog','canonical_capability_registry','canonical_domain_registry','platform_reusable_responsibilities','platform_storage_registry','external_provider_registry','platform_product_definition_components','platform_product_definitions','platform_reusable_pages','platform_reusable_features','platform_reusable_guidance','platform_reusable_eligibility','plans','plan_product_configuration','platform_reusable_pricing','platform_configuration_versions'];
const columns=new Set(['id','code','name','country_code','active','requires_review','default_subscription_class','created_at','updated_at','description','symbol','domain','policy_type','scope','configuration_json','purpose_code','policy_version','title','policy_text','require_consent','withdrawal_effect','role_code','label','scope_type','system_managed','domain_code','status','version','region_code','provider_code','purpose','residency_mode','provider_type','contract_status','definition_id','product_key','sector_code','component_type','component_key','page_type','language_code','body','rule_json','price_minor','currency','billing_interval','config_key']);
const fakeDb={prepare(sql){return {bind(...args){this.args=args;return this},async all(){
 if(sql.includes('sqlite_master')) return {results:tables.map(name=>({name}))};
 if(sql.startsWith('PRAGMA table_info')) return {results:[...columns].map(name=>({name}))};
 if(sql.includes('FROM platform_reusable_policies')) throw new Error('simulated policy projection failure');
 return {results:[]};
},async first(){return null},async run(){return {meta:{changes:0,last_row_id:1}}}}}};
const fakeEnv={DB:fakeDb};
const {listReusableData}=await import('../../src/worker/security/platform-reusable-data.service.js');
try{const result=await listReusableData(fakeEnv,{limit:250});
 if(!result?.data) fail.push('projection returned no data object');
 if(!result.projectionErrors?.some(x=>x.type==='policy')) fail.push('per-authority query failure was not isolated/reported');
 if(!Array.isArray(result.data.sector)) fail.push('healthy authority projection disappeared when another authority failed');
}catch(e){fail.push(`listReusableData still throws on one authority failure: ${e?.message||e}`)}

if(fail.length){console.error(`FAIL\n${fail.join('\n')}`);process.exit(1)}
console.log('PASS — 10.64.0 Data Entry completion/runtime isolation contract');
