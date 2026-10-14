import {canonicalFirst,canonicalAll} from '../core/canonical-db.js';
import {RELEASE_VERSION} from '../core/release.js';
import {syncEntryLifecycle} from './platform-data-entry.service.js';
import {withPlatformMutationLease} from './platform-mutation-lease.service.js';
import {recordDataLifecycleEvent,ensureDataLifecycleEvent} from './platform-data-lifecycle.service.js';
import { authorityUnavailable } from '../core/canonical-db.js';
export const PLATFORM_TRASH_VERSION=RELEASE_VERSION;
const fail=(message,status=400,code)=>{const e=new Error(message);e.status=status;e.code=code||message;return e};
const json=(v,f={})=>{try{return JSON.parse(String(v??''))??f}catch{return f}};
const int=(v)=>Number(v||0);
const ageDays=(date)=>Math.max(0,(Date.now()-new Date(String(date||Date.now())).getTime())/86400000);
const looksSample=(...values)=>/(^|[^a-z])(sample|test|demo|dummy|example|mock|seed)([^a-z]|$)/i.test(values.filter(Boolean).join(' '));
const REUSABLE_TRASH_DEFS=Object.freeze({
 country_blueprint:{table:'platform_country_product_blueprints',key:'id',status:'status'},
 product_country:{table:'platform_product_country_catalog',key:'code',active:'active'},
 sector:{table:'platform_reusable_sectors',key:'code',active:'active'},
 language:{table:'platform_reusable_languages',key:'code',active:'active'},
 currency:{table:'platform_reusable_currencies',key:'code',active:'active'},
 region:{table:'platform_reusable_regions',key:'code',active:'active'},
 classification:{table:'platform_reusable_classifications',key:'code',active:'active'},
 policy:{table:'platform_reusable_policies',key:'code',active:'active'},
 residency:{table:'platform_reusable_policies',key:'code',active:'active'},
 retention:{table:'platform_reusable_policies',key:'code',active:'active'},
 consent:{table:'consent_policy_versions',key:'id',active:'active'},
 role:{table:'organization_role_catalog',key:'role_code',active:'active'},
 capability:{table:'canonical_capability_registry',key:'code',status:'status'},
 responsibility:{table:'platform_reusable_responsibilities',key:'code',active:'active'},
 storage:{table:'platform_storage_registry',key:'code',active:'active'},
 provider:{table:'external_provider_registry',key:'id',active:'active'},
 component:{table:'platform_product_definition_components',key:'id',status:'status'},
 page:{table:'platform_reusable_pages',key:'id',status:'status'},
 feature:{table:'platform_reusable_features',key:'code',active:'active'},
 configuration:{table:'platform_configuration_versions',key:'id',active:'active',status:'status'},
 guidance:{table:'platform_reusable_guidance',key:'code',active:'active'},
 plan:{table:'plans',key:'id',active:'active'},
 eligibility:{table:'platform_reusable_eligibility',key:'code',active:'active'},
 pricing:{table:'platform_reusable_pricing',key:'code',active:'active'}
});
const isReusableTrashType=t=>Object.hasOwn(REUSABLE_TRASH_DEFS,t);


async function one(env,sql,...args){return canonicalFirst(env,sql,args,'platform_trash')}
async function all(env,sql,...args){return canonicalAll(env,sql,args,'platform_trash')}
async function recordTrashLifecycleEvidence(env,{trashId=null,trashKey=null,resourceType,resourceId,stage,previousStage=null,action,reasonCode,reason,sourceEntryId=null,canonicalAuthority,actor,dependencySnapshot={},requestId=null}={}){
 try{
  await recordDataLifecycleEvent(env,{resourceType,resourceId,stage,previousStage,action,reasonCode,reason,sourceEntryId,canonicalAuthority,actor,dependencySnapshot,requestId});
  const where=trashId!=null?'id=?':'trash_key=?';
  await env.DB.prepare(`UPDATE platform_trash_items SET evidence_status='complete',evidence_error_code=NULL,evidence_updated_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE ${where}`).bind(trashId!=null?Number(trashId):String(trashKey)).run();
  return {evidenceStatus:'complete'};
 }catch(error){
  const where=trashId!=null?'id=?':'trash_key=?';
  await env.DB.prepare(`UPDATE platform_trash_items SET evidence_status='pending_reconciliation',evidence_error_code=?,evidence_updated_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE ${where}`).bind(clean(error?.code||'TRASH_LIFECYCLE_EVIDENCE_REQUIRED',160),trashId!=null?Number(trashId):String(trashKey)).run();
  return {evidenceStatus:'pending_reconciliation',evidenceErrorCode:error?.code||'TRASH_LIFECYCLE_EVIDENCE_REQUIRED'};
 }
}


function lifecycleForTrashItem(item){
 if(item?.purged_at)return {stage:'PURGED',previousStage:'QUARANTINED',action:'purge',reasonCode:'trash_purge',reason:'Reconciled pending Trash purge lifecycle evidence.'};
 if(item?.restored_at)return {stage:'RESTORED',previousStage:'QUARANTINED',action:'restore',reasonCode:'trash_restore',reason:'Reconciled pending Trash restore lifecycle evidence.'};
 return {stage:'QUARANTINED',previousStage:null,action:'trash',reasonCode:item?.reason_code||'manual_cleanup',reason:'Reconciled pending Trash quarantine lifecycle evidence.'};
}

export async function reconcileTrashEvidence(env,actor,{limit=100}={}){
 const max=Math.min(250,Math.max(1,Number(limit||100)));
 const rows=await all(env,`SELECT * FROM platform_trash_items WHERE evidence_status='pending_reconciliation' ORDER BY evidence_updated_at ASC,id ASC LIMIT ?`,max);
 const results=[];let reconciled=0,blocked=0;
 for(const item of rows){
  if(String(item.evidence_status||'complete')!=='pending_reconciliation')continue;
  try{
   const result=await withPlatformMutationLease(env,{scopeKey:`trash-evidence-reconcile:${Number(item.id)}`,actorType:actor?.role||actor?.type||'platform_super_administrator',actorId:actor?.id||actor?.identityId||null},async()=>{
    const current=await one(env,`SELECT * FROM platform_trash_items WHERE id=? LIMIT 1`,Number(item.id));
    if(!current||String(current.evidence_status||'complete')!=='pending_reconciliation')return {status:'already_resolved'};
    const stage=lifecycleForTrashItem(current);
    const snapshot=json(current.snapshot_json,{});
    const event=await ensureDataLifecycleEvent(env,{resourceType:current.resource_type,resourceId:String(current.resource_id),stage:stage.stage,previousStage:stage.previousStage,action:stage.action,reasonCode:stage.reasonCode,reason:stage.reason,sourceEntryId:snapshot?.data_entry_id||null,canonicalAuthority:current.resource_type,actor,metadata:{reconciled:true,trashId:Number(current.id),trashKey:current.trash_key}});
    const updated=await env.DB.prepare(`UPDATE platform_trash_items SET evidence_status='complete',evidence_error_code=NULL,evidence_updated_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND evidence_status='pending_reconciliation'`).bind(Number(current.id)).run();
    if(Number(updated?.meta?.changes||0)!==1)return {status:'already_resolved',eventId:event.eventId,reused:Boolean(event.reused)};
    return {status:'reconciled',stage:stage.stage,eventId:event.eventId,reused:Boolean(event.reused)};
   });
   if(result.status==='reconciled'){results.push({id:Number(item.id),...result});reconciled++;}
   else results.push({id:Number(item.id),...result});
  }catch(error){
   await env.DB.prepare(`UPDATE platform_trash_items SET evidence_error_code=?,evidence_updated_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND evidence_status='pending_reconciliation'`).bind(clean(error?.code||'TRASH_RECONCILIATION_FAILED',160),Number(item.id)).run();
   results.push({id:Number(item.id),status:'blocked',code:error?.code||'TRASH_RECONCILIATION_FAILED'});blocked++;
  }
 }
 return {requested:rows.length,reconciled,blocked,remaining:Math.max(0,rows.filter(x=>String(x.evidence_status)==='pending_reconciliation').length-reconciled),results};
}

async function countryDeps(env,code){
  const checks=[
    ['companies',`SELECT COUNT(*) count FROM company_management_profiles WHERE country_code=?`,code],
    ['company_management_profiles',`SELECT COUNT(*) count FROM company_management_profiles WHERE country_code=?`,code],
    ['blueprints',`SELECT COUNT(*) count FROM platform_country_product_blueprints WHERE country_code=?`,code],
    ['launches',`SELECT COUNT(*) count FROM country_product_launches WHERE country_code=?`,code],
    ['definitions',`SELECT COUNT(*) count FROM platform_product_definitions WHERE country_code=?`,code],
    ['expansions',`SELECT COUNT(*) count FROM platform_product_expansion_cases WHERE target_country_code=?`,code],
    ['jurisdiction_policies',`SELECT COUNT(*) count FROM jurisdiction_policies WHERE country_code=? AND status='active'`,code]
  ];
  const out={};let total=0;for(const [k,q,c] of checks){const r=await one(env,q,c);out[k]=int(r?.count);total+=out[k]||0;}return {total,byTable:out};
}

async function loadResource(env,type,id){
 const n=Number(id);
 if(type==='tenant') return one(env,`SELECT c.*,cmp.status management_status,cmp.status_reason,cmp.status_version,cmp.country_code,cmp.sector_code FROM companies c LEFT JOIN company_management_profiles cmp ON cmp.company_id=c.id WHERE c.id=? LIMIT 1`,n);
 if(type==='user') return one(env,`SELECT ai.*,c.name company_name FROM auth_identities ai JOIN companies c ON c.id=ai.company_id WHERE ai.id=? LIMIT 1`,n);
 if(type==='country') return one(env,'SELECT * FROM country_catalog WHERE code=? LIMIT 1',String(id).toUpperCase());
 if(type==='country_blueprint') return one(env,'SELECT * FROM platform_country_product_blueprints WHERE id=? LIMIT 1',n);
 if(type==='country_sector') return one(env,`SELECT s.*,b.country_code,b.name blueprint_name FROM platform_country_product_sectors s JOIN platform_country_product_blueprints b ON b.id=s.blueprint_id WHERE s.id=? LIMIT 1`,n);
 if(type==='product_definition') return one(env,'SELECT * FROM platform_product_definitions WHERE id=? LIMIT 1',n);
 if(type==='country_product_launch') return one(env,'SELECT * FROM country_product_launches WHERE id=? LIMIT 1',n);
 if(type==='expansion_case') return one(env,'SELECT * FROM platform_product_expansion_cases WHERE id=? LIMIT 1',n);
 if(type==='ui'||type==='content') return one(env,`SELECT c.*,d.name product_name,d.country_code,d.sector_code FROM platform_product_definition_components c JOIN platform_product_definitions d ON d.id=c.definition_id WHERE c.id=? LIMIT 1`,n);
 if(type==='data_entry') return one(env,'SELECT * FROM platform_data_entry_records WHERE entry_id=? LIMIT 1',String(id));
 if(isReusableTrashType(type)){const d=REUSABLE_TRASH_DEFS[type];return one(env,`SELECT * FROM ${d.table} WHERE ${d.key}=? LIMIT 1`,d.key==='id'?Number(id):String(id));}
 throw fail('TRASH_RESOURCE_TYPE_NOT_SUPPORTED',422,'TRASH_RESOURCE_TYPE_NOT_SUPPORTED');
}

function display(type,row){
 if(type==='tenant')return `Tenant ${row?.name||row?.id||''} · #${row?.id||''}`;
 if(type==='user')return `User ${row?.display_name||row?.login||row?.id||''} · ${row?.role||''}`;
 if(type==='country')return `${row?.name||row?.code||'Country'} (${row?.code||''})`;
 if(type==='country_blueprint')return `${row?.name||'Country Blueprint'} · ${row?.country_code||''}`;
 if(type==='country_sector')return `${row?.sector_name||row?.sector_code||'Sector'} · ${row?.country_code||''}`;
 if(type==='product_definition')return `${row?.name||row?.product_key||'Product Definition'} · ${row?.country_code||''}`;
 if(type==='country_product_launch')return `Launch ${row?.version||row?.id||''} · ${row?.country_code||''}`;
 if(type==='expansion_case')return `${row?.expansion_key||'Expansion'} · ${row?.target_country_code||''}`;
 if(type==='ui'||type==='content')return `${row?.component_type||type} · ${row?.component_key||row?.id||''}`;
 if(type==='data_entry')return `${row?.entry_type||'Data Entry'} · ${row?.entry_id||''}`;
 if(isReusableTrashType(type))return `${row?.name||row?.label||row?.title||row?.code||row?.id||type} · ${row?.code||row?.id||''}`;
 return String(row?.id||'');
}

async function dependencies(env,type,row){
 if(type==='tenant'){const qs=[['users',`SELECT COUNT(*) count FROM auth_identities WHERE company_id=?`],['drivers',`SELECT COUNT(*) count FROM drivers WHERE company_id=?`],['missions',`SELECT COUNT(*) count FROM mission_canonical_projection WHERE company_id=?`],['files',`SELECT COUNT(*) count FROM mission_files WHERE company_id=?`],['subscriptions',`SELECT COUNT(*) count FROM subscriptions WHERE company_id=?`],['billing',`SELECT COUNT(*) count FROM billing_identities WHERE company_id=?`]];const byTable={};let total=0;for(const [k,q] of qs){const r=await one(env,q,row.id);byTable[k]=int(r?.count);total+=byTable[k]}return {total,byTable,disposable:false};}
 if(type==='user'){const qs=[['missions',`SELECT COUNT(*) count FROM mission_canonical_projection m JOIN mission_active_assignment_projection a ON a.mission_id=m.id AND a.company_id=m.company_id AND a.assignment_type='owner_driver' AND a.assignee_type='driver' AND a.assignee_id=(SELECT driver_id FROM auth_identities WHERE id=?) WHERE m.company_id=?`],['driver',`SELECT COUNT(*) count FROM drivers WHERE id=(SELECT driver_id FROM auth_identities WHERE id=?)`],['platform_users',`SELECT COUNT(*) count FROM platform_users WHERE principal_type='tenant' AND principal_id=?`],['verification',`SELECT COUNT(*) count FROM verification_profiles WHERE (identity_type='tenant' AND identity_id=?)`]];const byTable={};let total=0;for(const [k,q] of qs){const r=k==='missions'?await one(env,q,row.id,row.company_id):await one(env,q,row.id);byTable[k]=int(r?.count);total+=byTable[k]}return {total,byTable,disposable:total===0};}
 if(type==='country') return countryDeps(env,row.code);
 if(type==='country_blueprint') return {launches:int((await one(env,'SELECT COUNT(*) count FROM country_product_launches WHERE country_blueprint_id=? AND status<>\'retired\'',row.id))?.count),definitions:int((await one(env,`SELECT COUNT(*) count FROM platform_product_definitions d JOIN country_product_launches l ON l.id=d.launch_id WHERE l.country_blueprint_id=? AND d.status<>\'retired\'`,row.id))?.count),sectors:int((await one(env,'SELECT COUNT(*) count FROM platform_country_product_sectors WHERE blueprint_id=?',row.id))?.count),languages:int((await one(env,'SELECT COUNT(*) count FROM platform_country_product_languages WHERE blueprint_id=?',row.id))?.count),contents:int((await one(env,'SELECT COUNT(*) count FROM platform_country_product_contents WHERE blueprint_id=?',row.id))?.count),legalRequirements:int((await one(env,'SELECT COUNT(*) count FROM platform_country_product_legal_requirements WHERE blueprint_id=?',row.id))?.count)};
 if(type==='country_sector') return {definitions:int((await one(env,'SELECT COUNT(*) count FROM platform_product_definitions WHERE country_code=? AND sector_code=? AND status<>\'retired\'',row.country_code,row.sector_code))?.count),launches:int((await one(env,`SELECT COUNT(*) count FROM country_product_launches l JOIN platform_country_product_blueprints b ON b.id=l.country_blueprint_id JOIN platform_country_product_sectors s ON s.blueprint_id=b.id WHERE s.id=? AND l.status<>\'retired\'`,row.id))?.count)};
 if(type==='product_definition') return {activeLaunches:int((await one(env,`SELECT COUNT(*) count FROM country_product_launches WHERE id=? AND status='active' AND active=1`,row.launch_id))?.count),children:int((await one(env,'SELECT COUNT(*) count FROM platform_product_definitions WHERE base_definition_id=? AND status<>\'retired\'',row.id))?.count)};
 if(type==='country_product_launch') return {active:Number(row.active)===1?1:0,definitions:int((await one(env,'SELECT COUNT(*) count FROM platform_product_definitions WHERE launch_id=? AND status<>\'retired\'',row.id))?.count)};
 if(type==='expansion_case') return {activeLaunches:int((await one(env,`SELECT COUNT(*) count FROM country_product_launches WHERE id=CAST(json_extract(metadata_json,'$.launchId') AS INTEGER) AND status='active' AND active=1`,row.id))?.count),status:row.status};
 if(isReusableTrashType(type)){
   const id=row?.code??row?.id; const checks=[];
   if(type==='product_country')checks.push(['blueprints',`SELECT COUNT(*) count FROM platform_country_product_blueprints WHERE country_code=? AND status<>'archived'`,id],['launches',`SELECT COUNT(*) count FROM country_product_launches WHERE country_code=? AND status<>'retired'`,id],['definitions',`SELECT COUNT(*) count FROM platform_product_definitions WHERE country_code=? AND status<>'retired'`,id],['expansions',`SELECT COUNT(*) count FROM platform_product_expansion_cases WHERE target_country_code=? AND status NOT IN ('retired','archived')`,id]);
   if(type==='sector')checks.push(['definitions',`SELECT COUNT(*) count FROM platform_product_definitions WHERE sector_code=? AND status<>'retired'`,id]);
   if(type==='language')checks.push(['blueprints',`SELECT COUNT(*) count FROM platform_country_product_blueprints WHERE default_language_code=? AND status<>'archived'`,id],['pages',`SELECT COUNT(*) count FROM platform_reusable_pages WHERE language_code=? AND status NOT IN ('blocked','retired')`,id],['guidance',`SELECT COUNT(*) count FROM platform_reusable_guidance WHERE language_code=? AND active=1`,id]);
   if(type==='currency')checks.push(['plans',`SELECT COUNT(*) count FROM plan_product_configuration WHERE currency=? AND status='active'`,String(id).toUpperCase()],['pricing',`SELECT COUNT(*) count FROM platform_reusable_pricing WHERE currency=? AND active=1`,String(id).toUpperCase()]);
   if(type==='region')checks.push(['storage',`SELECT COUNT(*) count FROM platform_storage_registry WHERE region_code=? AND active=1`,id]);
   if(type==='page')checks.push(['live_products',`SELECT COUNT(*) count FROM country_product_launches WHERE country_code=? AND status='active' AND active=1`,row.country_code||'']);
   if(type==='storage')checks.push(['provider',`SELECT COUNT(*) count FROM external_provider_registry WHERE code=? AND active=1`,row.provider_code||'']);
   if(type==='pricing')checks.push(['plans',`SELECT COUNT(*) count FROM plan_product_configuration WHERE currency=? AND status='active'`,String(row.currency||'').toUpperCase()]);
   if(type==='role')checks.push(['assignments',`SELECT COUNT(*) count FROM platform_user_roles WHERE role_code=? AND active=1`,String(row.role_code||id)]);
   if(type==='capability')checks.push(['provider_capabilities',`SELECT COUNT(*) count FROM external_provider_capabilities WHERE capability_code=? AND active=1`,String(row.code||id)]);
   if(type==='responsibility')checks.push(['role',`SELECT COUNT(*) count FROM organization_role_catalog WHERE role_code=? AND active=1`,String(row.role_code||'')]);
   if(type==='provider')checks.push(['provider_capabilities',`SELECT COUNT(*) count FROM external_provider_capabilities WHERE provider_code=? AND active=1`,String(row.code||'')]);
   if(type==='storage')checks.push(['storage_references',`SELECT COUNT(*) count FROM external_provider_capabilities WHERE provider_code=? AND active=1`,String(row.provider_code||'')]);
   if(type==='plan')checks.push(['subscriptions',`SELECT COUNT(*) count FROM subscriptions WHERE plan_id=? AND status NOT IN ('cancelled','terminated')`,Number(row.id)]);
   if(type==='consent')checks.push(['active_consent_usage',`SELECT COUNT(*) count FROM consent_policy_versions WHERE id=? AND active=1`,Number(row.id)]);
   const byTable={};let total=0;for(const [k,q,v] of checks){const r=await one(env,q,v);byTable[k]=int(r?.count);total+=byTable[k]||0;}
   const committed=await one(env,`SELECT COUNT(*) count FROM platform_data_entry_records WHERE canonical_resource_type=? AND canonical_resource_id=? AND status='committed'`,type,String(id));byTable.committed_provenance=int(committed?.count);total+=byTable.committed_provenance;
   return {total,byTable,disposable:total===0};
 }
 return {};
}

async function canTrash(env,type,row,deps){
 if(type==='tenant') return {ok:String(row.deletion_status)==='active'&&String(row.management_status||'active')!=='active' ? true : true,reason:'Tenant quarantine is reversible and preserves operational records. Permanent tenant erasure remains policy-governed.'};
 if(type==='user') return {ok:Number(row.active)===1 || Number(row.deleted_at?0:1)===0,reason:'User access can be quarantined without deleting historical operational Truth.'};
 if(type==='country') return {ok:deps.total===0,reason:deps.total?'Country has live or historical dependent records. Quarantine is still allowed; permanent purge must wait until dependencies are removed.':'No known dependent records.'};
 if(type==='country_blueprint') {const nested=(deps.sectors||0)+(deps.languages||0)+(deps.contents||0)+(deps.legalRequirements||0);return {ok:!deps.launches&&!deps.definitions&&!nested,reason:deps.launches||deps.definitions?'Blueprint has product launch/definition dependencies.':nested?'Blueprint still owns country foundation records; trash nested records first to preserve restore semantics.':'Blueprint has no product or nested foundation dependencies.'};}
 if(type==='country_sector') return {ok:!deps.definitions&&!deps.launches,reason:deps.definitions||deps.launches?'Sector is used by a non-retired product.':'Sector is unused by non-retired products.'};
 if(type==='product_definition') return {ok:!deps.activeLaunches&&!deps.children&&['draft','retired'].includes(String(row.status)),reason:deps.activeLaunches?'Definition is attached to an active launch.':deps.children?'Definition has active descendants.':`Definition status ${row.status} is not safely disposable.`};
 if(type==='country_product_launch') return {ok:!deps.active&&!deps.definitions&&['draft','retired'].includes(String(row.status)),reason:deps.active?'Launch is active.':deps.definitions?'Launch still owns non-retired definitions.':`Launch status ${row.status} is not safely disposable.`};
 if(type==='expansion_case') return {ok:!deps.activeLaunches&&!['live','launching'].includes(String(row.status)),reason:deps.activeLaunches?'Expansion has an active launch.':`Expansion status ${row.status} is not disposable while live/launching.`};
 if(type==='ui'||type==='content') return {ok:['draft','blocked'].includes(String(row.status)),reason:`Component status ${row.status} is not safely disposable.`};
 if(type==='data_entry') return {ok:['preview','rejected','cancelled'].includes(String(row.status)),reason:`Data entry status ${row.status} is not safely disposable; committed provenance is retained.`};
 if(isReusableTrashType(type)){if(type==='role'&&Number(row?.system_managed)===1)return {ok:false,reason:'System-managed roles cannot be quarantined through the generic Resources boundary.'};const active=row?.active!==undefined?Number(row.active)===1:['draft','blocked'].includes(String(row?.status||'draft'));const committed=Number(deps?.byTable?.committed_provenance||0);const nonProvenance=Math.max(0,Number(deps?.total||0)-committed);return {ok:active&&nonProvenance===0,reason:committed?'Committed Data Entry provenance remains attached; quarantine is reversible but permanent purge is blocked.':nonProvenance?'Canonical dependencies must be removed or governed first.':'Resource is in an independently recoverable canonical state.'};}
 return {ok:false,reason:'Unsupported resource.'};
}

export async function listTrash(env,{includePurged=false,limit=100}={}){
 const sql=`SELECT * FROM platform_trash_items ${includePurged?'':'WHERE purged_at IS NULL'} ORDER BY trashed_at DESC,id DESC LIMIT ?`;
 const rows=await all(env,sql,Math.min(250,Math.max(1,Number(limit||100))));
 return rows.map(r=>({...r,id:int(r.id),snapshot:json(r.snapshot_json),dependencies:json(r.dependency_snapshot_json),legal_hold:Number(r.legal_hold)===1}));
}

export async function listCleanupCandidates(env,{limit=150}={}){
 const out=[];
 const tenants=await all(env,`SELECT c.id,c.name,c.created_at,COALESCE(cmp.updated_at,c.created_at) updated_at,c.deletion_status,cmp.legal_name,cmp.trading_name,cmp.status management_status FROM companies c LEFT JOIN company_management_profiles cmp ON cmp.company_id=c.id WHERE c.deletion_status='active' ORDER BY c.id`);
 for(const t of tenants){const deps=await dependencies(env,'tenant',t);if((looksSample(t.name,t.legal_name,t.trading_name)||String(t.management_status||'')==='suspended')&&ageDays(t.updated_at)>=7)out.push({resource_type:'tenant',resource_id:String(t.id),display_name:display('tenant',t),classification:looksSample(t.name,t.legal_name,t.trading_name)?'sample_likely':'stale_tenant',confidence:looksSample(t.name,t.legal_name,t.trading_name)?'high':'review',reason:looksSample(t.name,t.legal_name,t.trading_name)?'Tenant identity contains sample/test/demo evidence.':'Tenant is suspended/stale and requires Super Admin review before quarantine.',dependency_count:deps.total,evidence:deps});}
 const users=await all(env,`SELECT ai.id,ai.company_id,ai.login,ai.email,ai.display_name,ai.role,ai.active,ai.updated_at FROM auth_identities ai WHERE ai.active=1 ORDER BY ai.id`);
 for(const u of users){if(ageDays(u.updated_at)>=30&&looksSample(u.login,u.email,u.display_name)){const deps=await dependencies(env,'user',u);out.push({resource_type:'user',resource_id:String(u.id),display_name:display('user',u),classification:'sample_likely',confidence:'high',reason:'User identity contains sample/test/demo evidence and has no active mission dependency.',dependency_count:deps.total,evidence:deps});}}
 const countries=await all(env,`SELECT code,name,active,created_at,updated_at FROM country_catalog ORDER BY name`);
 for(const c of countries){const deps=await countryDeps(env,c.code);if(Number(c.active)!==1||(deps.total===0&&looksSample(c.code,c.name))){out.push({resource_type:'country',resource_id:c.code,display_name:`${c.name} (${c.code})`,classification:'reference_catalog',confidence:'review',reason:'Country catalog entries are shared reference data. They are not treated as sample data automatically; review dependencies and product intent before quarantine.',dependency_count:deps.total,evidence:deps});}}
 const blueprints=await all(env,`SELECT b.* FROM platform_country_product_blueprints b ORDER BY b.updated_at DESC`);
 for(const b of blueprints){const deps=await dependencies(env,'country_blueprint',b);if(['draft','researching','preparing','archived'].includes(String(b.status))&&ageDays(b.updated_at)>=7&&deps.launches===0&&deps.definitions===0&&(deps.sectors+deps.languages+deps.contents+deps.legalRequirements)===0)out.push({resource_type:'country_blueprint',resource_id:String(b.id),display_name:display('country_blueprint',b),classification:looksSample(b.name,b.notes)?'sample_likely':(b.status==='archived'?'abandoned':'stale_draft'),confidence:looksSample(b.name,b.notes)?'high':'high',reason:looksSample(b.name,b.notes)?'Blueprint name/notes look like sample, test or demo data and it has no non-retired product dependency.':'Blueprint has no non-retired product dependency and has not changed recently.',dependency_count:0,evidence:deps});}
 const sectors=await all(env,`SELECT s.*,b.country_code,b.name blueprint_name FROM platform_country_product_sectors s JOIN platform_country_product_blueprints b ON b.id=s.blueprint_id ORDER BY s.updated_at DESC`);
 for(const s of sectors){const deps=await dependencies(env,'country_sector',s);if(['draft','blocked'].includes(String(s.status))&&ageDays(s.updated_at)>=7&&deps.definitions===0&&deps.launches===0)out.push({resource_type:'country_sector',resource_id:String(s.id),display_name:display('country_sector',s),classification:looksSample(s.sector_code,s.sector_name,s.notes)?'sample_likely':'stale_draft',confidence:'high',reason:looksSample(s.sector_code,s.sector_name,s.notes)?'Sector name/code/notes look like sample, test or demo data and it is unused.':'Sector entry is draft/blocked, stale and unused by any non-retired product.',dependency_count:0,evidence:deps});}
 const defs=await all(env,`SELECT * FROM platform_product_definitions WHERE status='draft' ORDER BY updated_at DESC`);
 for(const d of defs){const deps=await dependencies(env,'product_definition',d);if(ageDays(d.updated_at)>=7&&deps.activeLaunches===0&&deps.children===0)out.push({resource_type:'product_definition',resource_id:String(d.id),display_name:display('product_definition',d),classification:looksSample(d.product_key,d.name,d.description)?'sample_likely':'stale_draft',confidence:'high',reason:looksSample(d.product_key,d.name,d.description)?'Product definition looks like sample, test or demo data and has no active launch or descendants.':'Draft product definition is stale, has no active launch and no active descendants.',dependency_count:0,evidence:deps});}
 const exps=await all(env,`SELECT * FROM platform_product_expansion_cases WHERE status IN ('planning','preparing','composing','blocked','retired') ORDER BY updated_at DESC`);
 for(const e of exps){const deps=await dependencies(env,'expansion_case',e);if(ageDays(e.updated_at)>=7&&deps.activeLaunches===0)out.push({resource_type:'expansion_case',resource_id:String(e.id),display_name:display('expansion_case',e),classification:looksSample(e.expansion_key,e.metadata_json)?'sample_likely':'abandoned',confidence:'high',reason:looksSample(e.expansion_key,e.metadata_json)?'Expansion looks like sample, test or demo data and has no active launch dependency.':'Expansion is not live/launching and has no active launch dependency.',dependency_count:0,evidence:deps});}
 return out.slice(0,Math.min(250,Math.max(1,Number(limit||150))));
}

export async function trashResource(env,actor,{resourceType,resourceId,reasonCode='manual_cleanup',candidateReason='',requestId=''}){
 const scopeKey=`trash-resource:${clean(resourceType,100)}:${String(resourceId??'')}`;
 return withPlatformMutationLease(env,{scopeKey,actorType:actor?.role||actor?.type||'platform_super_administrator',actorId:actor?.id||actor?.identityId||null},async()=>{
 const row=await loadResource(env,resourceType,resourceId);if(!row)throw fail('TRASH_RESOURCE_NOT_FOUND',404,'TRASH_RESOURCE_NOT_FOUND');
 const deps=await dependencies(env,resourceType,row);const decision=await canTrash(env,resourceType,row,deps);if(!decision.ok)throw fail(`Cannot move to trash: ${decision.reason}`,409,'TRASH_BLOCKED');
 const existing=await one(env,`SELECT id FROM platform_trash_items WHERE resource_type=? AND resource_id=? AND purged_at IS NULL AND restored_at IS NULL ORDER BY id DESC LIMIT 1`,resourceType,String(resourceId));if(existing)throw fail('RESOURCE_ALREADY_IN_TRASH',409,'RESOURCE_ALREADY_IN_TRASH');
 const snapshot=JSON.stringify(row);const depJson=JSON.stringify({...deps,decision,candidateReason});const key=`trash_${resourceType}_${String(resourceId)}_${crypto.randomUUID()}`;
 if(resourceType==='tenant'){await transitionOrganizationLifecycle(env,{companyId:Number(resourceId),toStatus:'SUSPENDED',reasonCode:reasonCode||'manual_cleanup',reason:candidateReason||'Moved to governed Trash',requestId,actor});await env.DB.prepare(`UPDATE auth_identities SET active=0,updated_at=CURRENT_TIMESTAMP WHERE company_id=?`).bind(Number(resourceId)).run();}
 else if(resourceType==='user') await env.DB.prepare(`UPDATE auth_identities SET active=0,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(Number(resourceId)).run();
 else if(resourceType==='country') await env.DB.prepare(`UPDATE country_catalog SET active=0,updated_at=CURRENT_TIMESTAMP WHERE code=?`).bind(String(resourceId).toUpperCase()).run();
 else if(resourceType==='country_blueprint') await env.DB.prepare(`UPDATE platform_country_product_blueprints SET status='archived',updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(Number(resourceId)).run();
 else if(resourceType==='product_definition') await env.DB.prepare(`UPDATE platform_product_definitions SET status='retired',updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(Number(resourceId)).run();
 else if(resourceType==='country_product_launch') await env.DB.prepare(`UPDATE country_product_launches SET status='retired',active=0,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(Number(resourceId)).run();
 else if(resourceType==='expansion_case') await env.DB.prepare(`UPDATE platform_product_expansion_cases SET status='retired',stage='history',updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(Number(resourceId)).run();
 else if(resourceType==='country_sector') await env.DB.prepare(`DELETE FROM platform_country_product_sectors WHERE id=?`).bind(Number(resourceId)).run();
 else if(resourceType==='ui'||resourceType==='content') await env.DB.prepare(`UPDATE platform_product_definition_components SET status='blocked',updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(Number(resourceId)).run();
 else if(resourceType==='data_entry') await env.DB.prepare(`UPDATE platform_data_entry_records SET status='cancelled',updated_at=CURRENT_TIMESTAMP,rejection_code='TRASHED',rejection_message='Moved to governed Trash' WHERE entry_id=?`).bind(String(resourceId)).run();
 else if(isReusableTrashType(resourceType)){const d=REUSABLE_TRASH_DEFS[resourceType];if(d.active)await env.DB.prepare(`UPDATE ${d.table} SET active=0,updated_at=CURRENT_TIMESTAMP WHERE ${d.key}=?`).bind(d.key==='id'?Number(resourceId):String(resourceId)).run();else if(d.status)await env.DB.prepare(`UPDATE ${d.table} SET status='blocked',updated_at=CURRENT_TIMESTAMP WHERE ${d.key}=?`).bind(d.key==='id'?Number(resourceId):String(resourceId)).run();}
 await env.DB.prepare(`INSERT INTO platform_trash_items(trash_key,resource_type,resource_id,display_name,reason_code,confidence,source_status,source_active,snapshot_json,dependency_snapshot_json,created_by_type,created_by_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).bind(key,resourceType,String(resourceId),display(resourceType,row),reasonCode,deps.total===0?'high':'review',row.status??null,row.active==null?null:Number(row.active),snapshot,depJson,String(actor?.role||actor?.type||'platform_super_administrator'),String(actor?.id||'' )||null).run();
 await syncEntryLifecycle(env,resourceType,resourceId,'TRASH').catch(error=>{throw authorityUnavailable('platform_trash_lifecycle',error);});
 if(resourceType==='expansion_case'){
   const meta=json(row.metadata_json,{});
   const childLaunchId=Number(meta.launchId||0); const childDefinitionId=Number(meta.definitionId||0);
   if(childLaunchId){try{await trashResource(env,actor,{resourceType:'country_product_launch',resourceId:childLaunchId,reasonCode:'pre_live_product',candidateReason:'Owned by expansion case '+row.expansion_key,requestId});}catch(e){if(e?.code!=='RESOURCE_ALREADY_IN_TRASH')throw e;}}
   if(childDefinitionId){try{await trashResource(env,actor,{resourceType:'product_definition',resourceId:childDefinitionId,reasonCode:'pre_live_product',candidateReason:'Owned by expansion case '+row.expansion_key,requestId});}catch(e){if(e?.code!=='RESOURCE_ALREADY_IN_TRASH')throw e;}}
 }
 const evidence=await recordTrashLifecycleEvidence(env,{trashKey:key,resourceType,resourceId:String(resourceId),stage:'QUARANTINED',previousStage:String(row.status|| (row.active===1?'ACTIVE':'COMMITTED')).toUpperCase(),action:'trash',reasonCode,reason:candidateReason,sourceEntryId:row?.data_entry_id||null,canonicalAuthority:resourceType,actor,dependencySnapshot:deps,requestId});
 return {trashKey:key,resourceType,resourceId:String(resourceId),displayName:display(resourceType,row),dependencies:deps,evidenceStatus:evidence.evidenceStatus,evidenceErrorCode:evidence.evidenceErrorCode||null};
 });
}
async function purgeSafe(env,item){
 const row=await loadResource(env,item.resource_type,item.resource_id);if(!row){if(item.resource_type==='country_sector')return {deleted:true,alreadyAbsent:true};return {deleted:false,alreadyAbsent:true};}
 const deps=await dependencies(env,item.resource_type,row);const decision=await canTrash(env,item.resource_type,row,deps);if(!decision.ok)throw fail(`Permanent deletion blocked: ${decision.reason}`,409,'TRASH_PURGE_BLOCKED');
 if(item.resource_type==='tenant') throw fail('Permanent tenant deletion is handled by the canonical privacy erasure authority; historical operational Truth is policy-preserved.',409,'TENANT_PURGE_REQUIRES_PRIVACY_ERASURE');
 else if(item.resource_type==='user'){const dep=await dependencies(env,'user',row);if(dep.total)throw fail('Permanent deletion blocked: user still has dependent records.',409,'TRASH_PURGE_BLOCKED');await env.DB.prepare("DELETE FROM platform_users WHERE principal_type='tenant' AND principal_id=?").bind(Number(item.resource_id)).run();await env.DB.prepare('DELETE FROM auth_identities WHERE id=? AND active=0').bind(Number(item.resource_id)).run();}
 else if(item.resource_type==='country') await env.DB.prepare('DELETE FROM country_catalog WHERE code=? AND active=0').bind(String(item.resource_id).toUpperCase()).run();
 else if(item.resource_type==='country_blueprint') await env.DB.prepare(`DELETE FROM platform_country_product_blueprints WHERE id=? AND status='archived'`).bind(Number(item.resource_id)).run();
 else if(item.resource_type==='product_definition') await env.DB.prepare(`DELETE FROM platform_product_definitions WHERE id=? AND status='retired'`).bind(Number(item.resource_id)).run();
 else if(item.resource_type==='country_product_launch') await env.DB.prepare(`DELETE FROM country_product_launches WHERE id=? AND status='retired' AND active=0`).bind(Number(item.resource_id)).run();
 else if(item.resource_type==='expansion_case') await env.DB.prepare(`DELETE FROM platform_product_expansion_cases WHERE id=? AND status='retired'`).bind(Number(item.resource_id)).run();
 else if(item.resource_type==='ui'||item.resource_type==='content') await env.DB.prepare(`DELETE FROM platform_product_definition_components WHERE id=? AND status='blocked'`).bind(Number(item.resource_id)).run();
 else if(item.resource_type==='data_entry') await env.DB.prepare(`DELETE FROM platform_data_entry_records WHERE entry_id=? AND status IN ('preview','rejected','cancelled')`).bind(String(item.resource_id)).run();
 else if(item.resource_type==='country_sector') return {deleted:false,alreadyAbsent:false};
 else if(isReusableTrashType(item.resource_type)){const d=REUSABLE_TRASH_DEFS[item.resource_type];const committed=Number((await one(env,`SELECT COUNT(*) count FROM platform_data_entry_records WHERE canonical_resource_type=? AND canonical_resource_id=? AND status='committed'`,item.resource_type,String(item.resource_id)))?.count||0);if(committed)throw fail('TRASH_PURGE_PROVENANCE_PROTECTED',409,'TRASH_PURGE_PROVENANCE_PROTECTED');await env.DB.prepare(`DELETE FROM ${d.table} WHERE ${d.key}=?`).bind(d.key==='id'?Number(item.resource_id):String(item.resource_id)).run();}
 return {deleted:true};
}

export async function restoreTrash(env,actor,id){
 const scopeKey=`trash-item:${Number(id)}`;
 return withPlatformMutationLease(env,{scopeKey,actorType:actor?.role||actor?.type||'platform_super_administrator',actorId:actor?.id||actor?.identityId||null},async()=>{
 const item=await one(env,'SELECT * FROM platform_trash_items WHERE id=? AND purged_at IS NULL AND restored_at IS NULL LIMIT 1',Number(id));if(!item)throw fail('TRASH_ITEM_NOT_FOUND',404,'TRASH_ITEM_NOT_FOUND');
 const row=json(item.snapshot_json);if(item.resource_type==='tenant') {const target=String(row.management_status||'ACTIVE').toUpperCase();await transitionOrganizationLifecycle(env,{companyId:Number(item.resource_id),toStatus:['ACTIVE','RESTRICTED','VERIFIED','ONBOARDING','PENDING_VERIFICATION','DRAFT'].includes(target)?target:'ACTIVE',reasonCode:'trash_restore',reason:'Restored from governed Trash',actor});await env.DB.prepare(`UPDATE auth_identities SET active=1,updated_at=CURRENT_TIMESTAMP WHERE company_id=? AND login NOT LIKE 'deleted-%@invalid.onmission'`).bind(Number(item.resource_id)).run();}
 else if(item.resource_type==='user') await env.DB.prepare(`UPDATE auth_identities SET active=?,login=CASE WHEN login LIKE 'deleted-%@invalid.onmission' THEN COALESCE(json_extract(?, '$.login'),login) ELSE login END,email=COALESCE(json_extract(?, '$.email'),email),display_name=COALESCE(json_extract(?, '$.display_name'),display_name),updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(Number(item.source_active??1),item.snapshot_json,item.snapshot_json,item.snapshot_json,Number(item.resource_id)).run();
 else if(item.resource_type==='country') await env.DB.prepare(`UPDATE country_catalog SET active=?,updated_at=CURRENT_TIMESTAMP WHERE code=?`).bind(Number(item.source_active??row.active??1),String(item.resource_id).toUpperCase()).run();
 else if(item.resource_type==='country_blueprint') await env.DB.prepare(`UPDATE platform_country_product_blueprints SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(String(item.source_status||row.status||'draft'),Number(item.resource_id)).run();
 else if(item.resource_type==='product_definition') await env.DB.prepare(`UPDATE platform_product_definitions SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(String(item.source_status||row.status||'draft'),Number(item.resource_id)).run();
 else if(item.resource_type==='country_product_launch') await env.DB.prepare(`UPDATE country_product_launches SET status=?,active=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(String(item.source_status||row.status||'draft'),Number(item.source_active||0),Number(item.resource_id)).run();
 else if(item.resource_type==='expansion_case') await env.DB.prepare(`UPDATE platform_product_expansion_cases SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(String(item.source_status||row.status||'planning'),Number(item.resource_id)).run();
 else if(item.resource_type==='ui'||item.resource_type==='content') await env.DB.prepare(`UPDATE platform_product_definition_components SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(String(item.source_status||row.status||'draft'),Number(item.resource_id)).run();
 else if(item.resource_type==='data_entry') await env.DB.prepare(`UPDATE platform_data_entry_records SET status=?,rejection_code=NULL,rejection_message=NULL,updated_at=CURRENT_TIMESTAMP WHERE entry_id=?`).bind(String(item.source_status||row.status||'preview'),String(item.resource_id)).run();
 else if(item.resource_type==='country_sector') {const exists=await loadResource(env,'country_sector',item.resource_id);if(!exists){await env.DB.prepare(`INSERT INTO platform_country_product_sectors(id,blueprint_id,sector_code,sector_name,notes,required,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)`).bind(Number(row.id),Number(row.blueprint_id),String(row.sector_code),String(row.sector_name),String(row.notes||''),Number(row.required??1),String(row.status||'draft'),String(row.created_at||new Date().toISOString()),String(row.updated_at||new Date().toISOString())).run();}}
 else if(isReusableTrashType(item.resource_type)){if(item.resource_type==='role'&&Number(row.system_managed)===1)throw fail('SYSTEM_MANAGED_ROLE_PROTECTED',409,'SYSTEM_MANAGED_ROLE_PROTECTED');const d=REUSABLE_TRASH_DEFS[item.resource_type];if(d.active)await env.DB.prepare(`UPDATE ${d.table} SET active=?,updated_at=CURRENT_TIMESTAMP WHERE ${d.key}=?`).bind(Number(item.source_active??row.active??1),d.key==='id'?Number(item.resource_id):String(item.resource_id)).run();else if(d.status)await env.DB.prepare(`UPDATE ${d.table} SET status=?,updated_at=CURRENT_TIMESTAMP WHERE ${d.key}=?`).bind(String(item.source_status||row.status||'draft'),d.key==='id'?Number(item.resource_id):String(item.resource_id)).run();}
 await env.DB.prepare(`UPDATE platform_trash_items SET restored_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND purged_at IS NULL AND restored_at IS NULL`).bind(Number(id)).run();await syncEntryLifecycle(env,item.resource_type,item.resource_id,String(item.source_status||row.status||'RESTORED')).catch(error=>{throw authorityUnavailable('platform_trash_lifecycle',error);});const evidence=await recordTrashLifecycleEvidence(env,{trashId:Number(id),resourceType:item.resource_type,resourceId:item.resource_id,previousStage:'QUARANTINED',stage:'RESTORED',action:'restore',reasonCode:'trash_restore',reason:'Resource restored from governed Trash.',sourceEntryId:row?.data_entry_id||null,canonicalAuthority:item.resource_type,actor,requestId:null});return {restored:true,id:Number(id),resourceType:item.resource_type,resourceId:item.resource_id,evidenceStatus:evidence.evidenceStatus,evidenceErrorCode:evidence.evidenceErrorCode||null};
 });
}
export async function purgeTrash(env,actor,id){
 const scopeKey=`trash-item:${Number(id)}`;
 return withPlatformMutationLease(env,{scopeKey,actorType:actor?.role||actor?.type||'platform_super_administrator',actorId:actor?.id||actor?.identityId||null},async()=>{
 const item=await one(env,'SELECT * FROM platform_trash_items WHERE id=? AND purged_at IS NULL AND restored_at IS NULL LIMIT 1',Number(id));if(!item)throw fail('TRASH_ITEM_NOT_FOUND',404,'TRASH_ITEM_NOT_FOUND');if(Number(item.legal_hold)===1)throw fail('TRASH_LEGAL_HOLD',409,'TRASH_LEGAL_HOLD');
 const result=await purgeSafe(env,item);if(!result.deleted)throw fail('TRASH_PURGE_BLOCKED',409,'TRASH_PURGE_BLOCKED');
 await env.DB.prepare(`UPDATE platform_trash_items SET purged_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND purged_at IS NULL AND restored_at IS NULL`).bind(Number(id)).run();await syncEntryLifecycle(env,item.resource_type,item.resource_id,'PURGED').catch(error=>{throw authorityUnavailable('platform_trash_lifecycle',error);});const evidence=await recordTrashLifecycleEvidence(env,{trashId:Number(id),resourceType:item.resource_type,resourceId:item.resource_id,previousStage:'QUARANTINED',stage:'PURGED',action:'purge',reasonCode:'trash_purge',reason:'Resource permanently purged after dependency and legal-hold checks.',sourceEntryId:null,canonicalAuthority:item.resource_type,actor});return {purged:true,id:Number(id),resourceType:item.resource_type,resourceId:item.resource_id,evidenceStatus:evidence.evidenceStatus,evidenceErrorCode:evidence.evidenceErrorCode||null};
 });
}
export async function bulkTrashCandidates(env,actor,{limit=150,requestId=''}={}) {
 const candidates=await listCleanupCandidates(env,{limit});
 const results=[];let moved=0,blocked=0,failed=0;
 for(const c of candidates){try{const r=await trashResource(env,actor,{resourceType:c.resource_type,resourceId:c.resource_id,reasonCode:'candidate_bulk_cleanup',candidateReason:c.reason||'Cleanup candidate',requestId});results.push({...r,status:'trashed'});moved++;}catch(e){results.push({resourceType:c.resource_type,resourceId:String(c.resource_id),status:'blocked',code:e?.code||'TRASH_FAILED',message:e?.message||'Unable to move candidate to trash'});blocked++;}}
 return {requested:candidates.length,moved,blocked,failed,results};
}

export async function purgeAllTrash(env,actor,{limit=150}={}) {
 const items=await listTrash(env,{limit});
 const results=[];let purged=0,blocked=0;
 let pending=[...items];
 for(let pass=0;pass<3&&pending.length;pass++){const next=[];let progress=0;for(const item of pending){try{const r=await purgeTrash(env,actor,Number(item.id));results.push({...r,status:'purged'});purged++;progress++;}catch(e){next.push({item,error:e});}}if(!progress){for(const {item,error} of next)results.push({id:Number(item.id),resourceType:item.resource_type,resourceId:String(item.resource_id),status:'blocked',code:error?.code||'TRASH_PURGE_FAILED',message:error?.message||'Unable to purge'});blocked+=next.length;break;}pending=next;}
 return {requested:items.length,purged,blocked,results};
}
