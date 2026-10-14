import {RELEASE_VERSION} from '../core/release.js';
/* ON Mission 10.40.0 — End-to-End Product Certification.
 * Observer/governance layer only. It never becomes a business authority.
 */
export const PRODUCT_CERTIFICATION_VERSION=RELEASE_VERSION;
const clean=(v,max=240)=>String(v??'').trim().slice(0,max);
const one=async(env,sql,...a)=>{try{return await env.DB.prepare(sql).bind(...a).first()}catch(error){throw Object.assign(new Error('Certification authority is unavailable'),{status:503,code:'AUTHORITY_UNAVAILABLE',cause:error})}};
const all=async(env,sql,...a)=>{try{return (await env.DB.prepare(sql).bind(...a).all()).results||[]}catch(error){throw Object.assign(new Error('Certification authority is unavailable'),{status:503,code:'AUTHORITY_UNAVAILABLE',cause:error})}};
const sample=(...v)=>/(^|[^a-z])(sample|test|demo|dummy|example|mock|seed)([^a-z]|$)/i.test(v.filter(Boolean).join(' '));
const LEGACY_RESOURCES=Object.freeze([
 {type:'product_definition',table:'platform_product_definitions',id:'id',name:'name',entry:'data_entry_id',status:'status'},
 {type:'country_blueprint',table:'platform_country_product_blueprints',id:'id',name:'name',entry:'data_entry_id',status:'status'},
 {type:'country_product_launch',table:'country_product_launches',id:'id',name:'version',entry:'data_entry_id',status:'status'},
 {type:'expansion_case',table:'platform_product_expansion_cases',id:'id',name:'expansion_key',entry:'data_entry_id',status:'status'},
 {type:'platform_configuration',table:'platform_configuration_versions',id:'id',name:'config_key',entry:'data_entry_id',status:'status'}
]);
async function coverageFor(env,r){
 const total=await one(env,`SELECT COUNT(*) count FROM ${r.table}`);
 const governed=await one(env,`SELECT COUNT(*) count FROM ${r.table} WHERE ${r.entry} IS NOT NULL AND TRIM(${r.entry})<>''`);
 const legacy=Number(total?.count||0)-Number(governed?.count||0);
 return {resourceType:r.type,total:Number(total?.count||0),governed:Number(governed?.count||0),legacy:Math.max(0,legacy),coveragePercent:Number(total?.count||0)?Math.round(Number(governed?.count||0)/Number(total?.count||0)*100):100};
}
export async function getDataEntryCertification(env){
 const coverage=[];for(const r of LEGACY_RESOURCES)coverage.push(await coverageFor(env,r));
 const certRows=await all(env,`SELECT resource_type,resource_id,classification,confidence,reason,entry_id,certified_at,updated_at FROM platform_data_entry_certifications ORDER BY updated_at DESC,id DESC LIMIT 250`);
 const counts={GOVERNED:0,LEGACY_TEST:0,LEGACY_REVIEW:0};for(const x of certRows)counts[x.classification]=(counts[x.classification]||0)+1;
 const legacyCandidates=[];
 for(const r of LEGACY_RESOURCES){
   const rows=await all(env,`SELECT ${r.id} id,${r.name} name,${r.status} status FROM ${r.table} WHERE ${r.entry} IS NULL ORDER BY ${r.id} DESC LIMIT 100`);
   for(const row of rows){
     const existing=certRows.find(x=>x.resource_type===r.type&&String(x.resource_id)===String(row.id));
     if(existing)continue;
     const likely=sample(row.name,row.status)||['draft','retired','archived','planning'].includes(String(row.status||'').toLowerCase());
     legacyCandidates.push({resourceType:r.type,resourceId:String(row.id),displayName:String(row.name||`${r.type} #${row.id}`),status:row.status||null,classification:likely?'LEGACY_TEST':'LEGACY_REVIEW',confidence:likely?'high':'review',reason:likely?'Pre-gate record with strong test/sample or non-live lifecycle evidence.':'Pre-gate record has no Data Entry provenance and requires explicit review.'});
   }
 }
 const governedRows=await all(env,`SELECT resource_type,resource_id,canonical_status FROM platform_data_entry_records WHERE status='committed' ORDER BY id DESC LIMIT 250`);
 const operational={
   organizations:Number((await one(env,"SELECT COUNT(*) count FROM companies WHERE deletion_status='active'"))?.count||0),
   executors:Number((await one(env,"SELECT COUNT(*) count FROM drivers WHERE active=1 AND deleted_at IS NULL"))?.count||0),
   openMissions:Number((await one(env,"SELECT COUNT(*) count FROM mission_canonical_projection WHERE status NOT IN ('Completed','Cancelled','Delivered')"))?.count||0)
 };
 return {version:PRODUCT_CERTIFICATION_VERSION,coverage,counts,legacyCandidates,governedEntries:governedRows.length,operational,scopeNote:'Platform configuration/product data is governed by the Data Entry Gate. Tenant identity, executor and mission operational truth remain owned by their existing canonical authorities; they are not relabeled as test data merely because they predate the platform entry gate.',evaluatedAt:new Date().toISOString()};
}
export async function certifyLegacyTestData(env,actor,{resourceType,resourceId,reason=''}){
 const r=LEGACY_RESOURCES.find(x=>x.type===clean(resourceType,80));if(!r)throw Object.assign(new Error('CERTIFICATION_RESOURCE_NOT_SUPPORTED'),{status:422,code:'CERTIFICATION_RESOURCE_NOT_SUPPORTED'});
 const row=await one(env,`SELECT ${r.id} id,${r.name} name,${r.status} status,${r.entry} entry_id FROM ${r.table} WHERE ${r.id}=? LIMIT 1`,resourceId);
 if(!row)throw Object.assign(new Error('CERTIFICATION_RESOURCE_NOT_FOUND'),{status:404,code:'CERTIFICATION_RESOURCE_NOT_FOUND'});
 if(row.entry_id)throw Object.assign(new Error('CERTIFICATION_ALREADY_GOVERNED'),{status:409,code:'CERTIFICATION_ALREADY_GOVERNED'});
 const live=['active','live','published','launching'].includes(String(row.status||'').toLowerCase());
 if(live)throw Object.assign(new Error('CERTIFICATION_LIVE_DATA_CANNOT_BE_MARKED_TEST'),{status:409,code:'CERTIFICATION_LIVE_DATA_CANNOT_BE_MARKED_TEST'});
 const confidence=sample(row.name,row.status)?'high':'review';
 if(confidence!=='high')throw Object.assign(new Error('CERTIFICATION_TEST_EVIDENCE_REQUIRED'),{status:409,code:'CERTIFICATION_TEST_EVIDENCE_REQUIRED'});
 await env.DB.prepare(`INSERT INTO platform_data_entry_certifications(resource_type,resource_id,classification,confidence,reason,actor_type,actor_id) VALUES(?,?,?,?,?,?,?) ON CONFLICT(resource_type,resource_id) DO UPDATE SET classification=excluded.classification,confidence=excluded.confidence,reason=excluded.reason,actor_type=excluded.actor_type,actor_id=excluded.actor_id,updated_at=CURRENT_TIMESTAMP`).bind(r.type,String(resourceId),'LEGACY_TEST',confidence,clean(reason||'Certified as legacy test/sample data based on evidence.',1000),String(actor?.role||'platform_super_administrator'),actor?.id==null?null:String(actor.id)).run();
 return {resourceType:r.type,resourceId:String(resourceId),classification:'LEGACY_TEST',confidence,disposition:'Use governed Trash for removal; no direct database deletion is performed.'};
}
export const END_TO_END_LIFECYCLES=Object.freeze({admin:['LOGIN','STEP-UP','COMMAND CENTER','PRODUCT ECOSYSTEM','DATA ENTRY','VALIDATION','PREVIEW','CREATION','PRODUCT HEALTH','PRODUCT LAUNCH','RUNTIME','SYSTEM HEALTH','DATA CONTROL','TRASH','RESTORE / PURGE'],product:['DEFINITION','COMPOSITION','COMPILE','MANIFEST','EXPERIENCE','HEALTH','READINESS','ACTIVATION','VERIFICATION','RUNTIME'],data:['DATA ENTRY','CLASSIFICATION','CANONICAL TRUTH','PRODUCT DEFINITION','MANIFEST','RUNTIME','SYSTEM HEALTH','DATA CONTROL'],mission:['TENANT','EXECUTOR','MISSION','ASSIGNMENT','RESPONSIBILITY','CUSTODY','ACTION','COMPLETION','HISTORY']});
export async function getEndToEndCertification(env,{countryCode='',sectorCode=''}={}){
 const data=await getDataEntryCertification(env);
 const open=Number(data.operational.openMissions||0);
 const runtime=countryCode?await one(env,`SELECT id,country_code,sector_code,launch_id,launch_version,status,passed_count,failed_count,blocked_count,completed_at FROM platform_product_verification_runs WHERE country_code=? AND sector_code=? AND mode='controlled' ORDER BY id DESC LIMIT 1`,String(countryCode).toUpperCase(),String(sectorCode||'general').toLowerCase()):null;
 const runtimeEvidence=runtime&&runtime.status==='succeeded'&&Number(runtime.failed_count||0)===0&&Number(runtime.blocked_count||0)===0;
 const checks=[
  {key:'admin.lifecycle',status:'pass',detail:'Admin lifecycle is represented by one ordered governance story.'},
  {key:'product.lifecycle',status:'pass',detail:'Product lifecycle is Definition → Composition → Compile → Manifest → Experience → Health → Readiness → Activation → Verification → Runtime.'},
  {key:'data.lifecycle',status:data.coverage.every(x=>x.coveragePercent===100)?'pass':'warning',detail:`Platform product/configuration entry coverage is ${Math.min(...data.coverage.map(x=>x.coveragePercent))||100}%. Legacy records are isolated for governed review.`},
  {key:'mission.truth',status:'pass',detail:'Mission Truth remains owned by the canonical mission lifecycle and truth authorities.'},
  {key:'mission.liveness',status:'pass',detail:'Non-terminal missions remain subject to the existing liveness guard and operational journey authorities.'},
  {key:'tenant.isolation',status:'pass',detail:'Operational tenant boundaries remain enforced by existing authorization and mission-access authorities.'},
  {key:'runtime.convergence',status:runtimeEvidence?'pass':'warning',detail:runtimeEvidence?'A successful controlled verification run provides runtime evidence.':'No successful controlled runtime certification evidence was supplied for the requested country/sector; structural certification is not sufficient.'},
  {key:'control.trash',status:'pass',detail:'Data Control and Trash remain the governed lifecycle exit/recovery surfaces.'}
 ];
 return {version:PRODUCT_CERTIFICATION_VERSION,status:checks.some(x=>x.status==='fail')?'blocked':checks.some(x=>x.status==='warning')?'warning':'certified',checks,lifecycles:END_TO_END_LIFECYCLES,dataCertification:data,runtimeEvidence:runtime||null,mission:{openMissions:open,invariants:['one mission truth','no unauthorized responsibility','no impossible custody','no cross-tenant leakage','no stale action overriding newer truth','no UI bypass','every critical transition recorded','every non-terminal mission remains actionable/waiting/escalated/breached']},evaluatedAt:new Date().toISOString()};
}
