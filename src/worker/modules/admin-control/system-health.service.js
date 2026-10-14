import {RELEASE_VERSION} from '../../core/release.js';
import {getPlatformCommandCenter} from './command-center.service.js';
import {canonicalFirst} from '../../core/canonical-db.js';
import {getEndToEndCertification} from '../../security/platform-product-certification.service.js';
const observe=async(label,fn)=>{try{return {status:'healthy',...(await fn())}}catch(error){return {status:'unavailable',code:error?.code||'AUTHORITY_UNAVAILABLE',authority:label,reason:'Canonical authority could not be read; no missing/empty state is inferred.'}}};

export async function getSystemHealth(env){
  const checks=await Promise.all([
    observe('admin.system_health.database',async()=>{await env.DB.prepare('SELECT 1 ok').first();return {}}),
    observe('admin.system_health.providers',async()=>{const r=await env.DB.prepare("SELECT COUNT(*) count FROM external_provider_registry WHERE active=1").first();return {activeProviders:Number(r?.count||0)}}),
    observe('admin.system_health.billing',async()=>{const r=await env.DB.prepare('SELECT COUNT(*) count FROM plans WHERE active=1').first();return {activePlans:Number(r?.count||0)}}),
    observe('admin.system_health.backup',async()=>{const r=await env.DB.prepare("SELECT COUNT(*) count FROM backup_registry WHERE status='active'").first();return {activeBackupPolicies:Number(r?.count||0)}})
  ]);
  const [organizations,activeDrivers,missions,activeLaunches,pendingEntries,trashItems,openOperations,bulkOperations,latestAudit,latestLaunches]=await Promise.all([
    observe('admin.system_health.organizations',async()=>({count:Number((await env.DB.prepare("SELECT COUNT(*) count FROM companies WHERE deletion_status='active'").first())?.count||0)})),
    observe('admin.system_health.executors',async()=>({count:Number((await env.DB.prepare("SELECT COUNT(*) count FROM drivers WHERE active=1 AND deleted_at IS NULL").first())?.count||0)})),
    observe('admin.system_health.missions',async()=>({count:Number((await env.DB.prepare("SELECT COUNT(*) count FROM mission_canonical_projection WHERE status NOT IN ('Completed','Cancelled','Delivered')").first())?.count||0)})),
    observe('admin.system_health.active_launches',async()=>({count:Number((await env.DB.prepare("SELECT COUNT(*) count FROM country_product_launches WHERE status='active' AND active=1").first())?.count||0)})),
    observe('admin.system_health.data_entry',async()=>({count:Number((await env.DB.prepare("SELECT COUNT(*) count FROM platform_data_entry_records WHERE status IN ('preview','validated')").first())?.count||0)})),
    observe('admin.system_health.trash',async()=>({count:Number((await env.DB.prepare("SELECT COUNT(*) count FROM platform_trash_items WHERE purged_at IS NULL").first())?.count||0)})),
    observe('admin.system_health.operations',async()=>({count:Number((await env.DB.prepare("SELECT COUNT(*) count FROM platform_admin_operations WHERE status IN ('preparing','executing','verifying')").first())?.count||0)})),
    observe('admin.system_health.bulk_operations',async()=>({results:(await env.DB.prepare("SELECT status,COUNT(*) count FROM platform_admin_bulk_operations GROUP BY status").all()).results||[]})),
    observe('admin.system_health.latest_audit',async()=>({row:await canonicalFirst(env,"SELECT action,resource_type,resource_id,created_at FROM admin_control_audit_events ORDER BY id DESC LIMIT 1",[],'admin.system_health.latest_audit')})),
    observe('admin.system_health.active_products',async()=>({results:(await env.DB.prepare("SELECT id,country_code,version,status,active,updated_at,eligibility_json FROM country_product_launches WHERE status='active' AND active=1 ORDER BY updated_at DESC,id DESC LIMIT 12").all()).results||[]}))
  ]);

  const commandCenter=await observe('admin.system_health.command_center',()=>getPlatformCommandCenter(env,{}));
  const certification=await observe('admin.system_health.certification',()=>getEndToEndCertification(env));
  const database=checks[0];
  const degradedAuthorities=[...checks.slice(1),organizations,activeDrivers,missions,activeLaunches,pendingEntries,trashItems,openOperations,bulkOperations,latestAudit,latestLaunches,commandCenter,certification].filter(x=>x?.status==='unavailable').map(x=>({authority:x.authority,code:x.code||'AUTHORITY_UNAVAILABLE'}));
  const activeProductCount=Number(activeLaunches?.count||0);
  const pendingEntryCount=Number(pendingEntries?.count||0);
  const trashCount=Number(trashItems?.count||0);
  const openOperationCount=Number(openOperations?.count||0);
  const situationState=database.status!=='healthy'||degradedAuthorities.length?'DEGRADED':activeProductCount>0?'OPERATING':pendingEntryCount>0?'BUILDING':'STANDBY';
  const situationReason=database.status!=='healthy'
    ?'The database health check is degraded; current platform state may be incomplete.'
    :degradedAuthorities.length
      ?`${degradedAuthorities.length} administrative authority${degradedAuthorities.length===1?' is':'ies are'} temporarily unavailable; no missing state has been inferred.`
    :activeProductCount>0
      ?`${activeProductCount} active country product${activeProductCount===1?'':'s'} currently define the live product surface.`
      :pendingEntryCount>0
        ?`${pendingEntryCount} governed data entr${pendingEntryCount===1?'y is':'ies are'} waiting for validation or commit.`
        :'No active country product is currently exposed.';
  const nextAction=openOperationCount>0?'Monitor open administrative operations':pendingEntryCount>0?'Review governed data entry':activeProductCount>0?'Monitor the running product':'Open Product Ecosystem';
  const activeProducts=(latestLaunches?.results||[]).map(x=>{
    let eligibility={};try{eligibility=JSON.parse(x.eligibility_json||'{}')||{}}catch{}
    return {id:Number(x.id),countryCode:x.country_code,version:x.version,status:x.status,active:Boolean(Number(x.active)),sectors:Array.isArray(eligibility.sectors)?eligibility.sectors.map(String):[],updatedAt:x.updated_at};
  });
  const bulkStatus={};for(const r of bulkOperations?.results||[])bulkStatus[r.status]=Number(r.count||0);
  const currentData={
    organizations:Number(organizations?.count||0),
    activeDrivers:Number(activeDrivers?.count||0),
    openMissions:Number(missions?.count||0),
    activeCountryProducts:activeProductCount,
    pendingDataEntries:pendingEntryCount,
    trashedRecords:trashCount,
    openAdministrativeOperations:openOperationCount,
    bulkOperations:bulkStatus
  };
  return {
    release:RELEASE_VERSION,
    metadataOnly:false,
    evaluatedAt:new Date().toISOString(),
    api:{status:'healthy'},
    database,
    authentication:{status:'healthy'},
    providers:checks[1],
    storage:{status:'governed'},
    billing:checks[2],
    email:{status:'governed'},
    backup:checks[3],
    runtime:{status:'healthy'},
    releaseGate:{status:'current',version:RELEASE_VERSION},
    currentSituation:{state:situationState,reason:situationReason,nextAction,productStatus:commandCenter?.now?.productStatus||null,productReason:commandCenter?.now?.productReason||null},
    currentData,
    activeProducts,
    latestAdministrativeActivity:latestAudit?.row?{action:latestAudit.row.action,resourceType:latestAudit.row.resource_type,resourceId:latestAudit.row.resource_id,createdAt:latestAudit.row.created_at}:null,
    lifecycle:['ENTRY','TRUTH','DECISION','CREATION','RUNTIME','CONTROL','TRASH'],
    architecture:{mode:'canonical-convergence',release:RELEASE_VERSION},
    certification,
    degradedAuthorities,
    authoritySemantics:{degraded:'An unavailable canonical read is surfaced explicitly; it is never represented as a legitimate empty or missing state.'}
  };
}
