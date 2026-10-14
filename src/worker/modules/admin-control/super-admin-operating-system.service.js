/* ON Mission 11.04.0 — Super Admin Operating System projection.
 * Read/orchestration surface only. It does not own domain truth or execute domain mutations.
 * Canonical authorities remain responsible for Product, Country, Tenant, Mission, Data,
 * Release, Authorization, Recovery and operational truth.
 */
import {RELEASE_VERSION} from '../../core/release.js';
import {safeAll,safeFirst} from './admin-control.utils.js';
import {ACTION_REGISTRY} from '../../application/actions/action-registry.js';
import {ACTION_SERVICE_MAP} from '../../application/actions/action-service-map.js';
import {auditActionRegistry} from '../../extensions/actions-intelligence/action-registry-audit.js';
import {searchMissionsForPlatformAdministrator,getPlatformAdministratorMissionSummary} from '../missions/platform-admin-query.service.js';
import {getAgenticControl,listAgentDecisions,listAgentOutcomes} from '../../extensions/agentic-layer/agentic-governance.service.js';
import {searchResourceExplorer,PLATFORM_RESOURCE_EXPLORER_VERSION} from '../../security/platform-resource-explorer.service.js';

export const SUPER_ADMIN_OPERATING_SYSTEM_VERSION='11.04.0';

const AUTHORITY_BY_DOMAIN=Object.freeze({
  navigation:'Canonical navigation / Human Work Model',
  mission_data:'Mission Authority',
  assignment:'Assignment Authority',
  network:'Network / Relationship Authority',
  foryou:'Distribution Authority',
  mission_flow:'Mission Lifecycle Authority',
  delivery_proof:'Evidence Authority',
  exception:'Exception Authority',
  communication:'Communication Authority',
  availability:'Executor Availability Authority',
  responsibility:'Responsibility Authority',
  management:'Mission Management Authority',
  people:'People / Executor Authority',
  customer_data:'Customer Authority',
  custody:'Custody Authority'
});

const ACTION_WORKSPACE=Object.freeze({
  open_mission:'missions',check_assignment:'missions',edit_mission:'missions',edit_mission_data:'missions',
  review_network:'missions',review_foryou:'missions',share_foryou:'missions',share_network:'missions',
  assign_driver:'missions',change_driver:'missions',accept_network:'missions',request_foryou_mission:'missions',
  cancel_foryou_request:'missions',reject_network:'missions',approve_foryou_request:'missions',decline_foryou_request:'missions',
  advance_execution:'missions',confirm_arrival:'missions',confirm_pickup:'missions',start_transit:'missions',start_operation:'missions',
  capture_delivery_proof:'missions',confirm_delivery:'missions',complete_mission:'missions',complete_operation:'missions',
  report_exception:'missions',resolve_exception:'missions',navigate:'missions',message:'missions',message_executor:'roles',
  review_availability:'roles',reclaim_execution:'missions',start_navigation:'missions',request_current_location:'missions',
  share_current_location:'missions',resolve_traffic:'missions',resolve_waiting:'missions',cancel_mission:'missions',delete_mission:'missions',
  edit_driver:'roles',edit_customer:'companies',delete_customer:'companies',edit_driver_operational_profile:'roles',
  toggle_driver_status:'roles',remove_driver:'roles',request_trust:'companies',accept_trust:'companies',reject_trust:'companies',
  suspend_trust:'companies',add_customer_location:'companies',archive_customer:'companies',repost_foryou:'missions',
  restart_network:'missions',withdraw_foryou:'missions',withdraw_network:'missions',reactivate_mission:'missions',
  start_custody_recovery:'recovery-reconciliation',abort_custody_transfer:'recovery-reconciliation',
  start_custody_resolution:'recovery-reconciliation',confirm_custody_release:'recovery-reconciliation',
  finalize_custody_transfer:'recovery-reconciliation',accept_custody:'recovery-reconciliation',reassign_custody_receiver:'recovery-reconciliation',
  review_completion_blocker:'missions'
});

function clean(v,n=160){return String(v??'').replace(/[\u0000-\u001f]/g,' ').trim().slice(0,n)}
function json(v,fallback={}){try{return v?JSON.parse(v):fallback}catch{return fallback}}
function rowResource(type,row,fields={}){return Object.freeze({type,id:row?.id==null?null:String(row.id),name:clean(fields.name||row?.name||row?.reference||row?.entry_id||row?.operation_key||row?.configuration_id||`${type} ${row?.id??''}`,180),status:clean(fields.status||row?.status||'UNKNOWN',80),subtitle:clean(fields.subtitle||'',220),updatedAt:row?.updated_at||row?.created_at||null,workspace:fields.workspace||null,authority:fields.authority||null,actions:fields.actions||[]})}

export function getCanonicalAdminActionMatrix(){
  const problems=auditActionRegistry();
  return Object.freeze([...Object.entries(ACTION_REGISTRY).map(([code,definition])=>{
    const route=ACTION_SERVICE_MAP[code]||null;
    const domain=String(definition?.domain||route?.domain||'unknown');
    return Object.freeze({
      code,label:clean(definition?.label||code,120),domain,
      authority:AUTHORITY_BY_DOMAIN[domain]||`${domain.replaceAll('_',' ')} authority`,
      workspace:ACTION_WORKSPACE[code]||'missions',
      serviceMapped:Boolean(route),
      routeKind:route?.kind||null,
      roles:Array.isArray(definition?.roles)?definition.roles:[],
      confirmation:Boolean(definition?.confirmation),
      safeByDefault:definition?.safeByDefault!==false,
      canonical:true,
      executableByControlPlane:false,
      executionBoundary:'Canonical Action Application Service / authoritative domain route'
    });
  })].sort((a,b)=>a.domain.localeCompare(b.domain)||a.label.localeCompare(b.label)));
}

export async function searchSuperAdminResources(env,query,{limit=24}={}){
  const result=await searchResourceExplorer(env,{q:query,limit});
  return {query:result.query,results:result.results.map(r=>({...r,explorerVersion:PLATFORM_RESOURCE_EXPLORER_VERSION})),unavailableAuthorities:result.unavailableAuthorities||[],domains:result.domains||[]};
}

export async function getSuperAdminOperatingSnapshot(env){
  const reads=await Promise.all([
    safeFirst(()=>env.DB.prepare(`SELECT COUNT(*) count FROM companies WHERE deletion_status='active'`).first(),'organizations'),
    safeFirst(()=>env.DB.prepare(`SELECT COUNT(*) count FROM country_product_launches WHERE active=1 AND status='active'`).first(),'live-products'),
    safeFirst(()=>getPlatformAdministratorMissionSummary(env),'active-missions'),
    safeFirst(()=>env.DB.prepare(`SELECT COUNT(*) count FROM platform_admin_operations WHERE status IN ('preparing','executing','verifying')`).first(),'operations'),
    safeFirst(()=>env.DB.prepare(`SELECT COUNT(*) count FROM verification_profiles WHERE review_status='pending'`).first(),'verification'),
    safeFirst(()=>env.DB.prepare(`SELECT COUNT(*) count FROM platform_data_entry_records WHERE status IN ('preview','validated')`).first(),'data-entry'),
    safeAll(()=>env.DB.prepare(`SELECT id,operation_key,action_code,resource_type,resource_id,status,created_at,updated_at FROM platform_admin_operations ORDER BY id DESC LIMIT 12`).all(),'operation-journal'),
    safeAll(()=>env.DB.prepare(`SELECT id,event_id,action,resource_type,resource_id,actor_role,created_at FROM admin_control_audit_events ORDER BY id DESC LIMIT 12`).all(),'platform-history'),
    safeAll(()=>env.DB.prepare(`SELECT id,country_code,version,status,active,updated_at FROM country_product_launches ORDER BY id DESC LIMIT 12`).all(),'release-lifecycle'),
    safeAll(()=>getAgenticControl(env),'agentic-control'),
    safeAll(()=>listAgentDecisions(env,{limit:12}),'agentic-decisions'),
    safeAll(()=>listAgentOutcomes(env,{limit:12}),'agentic-outcomes')
  ]);
  const unavailable=reads.filter(x=>x.warning).map(x=>({authority:x.warning,code:'AUTHORITY_UNAVAILABLE'}));
  const val=k=>{const r=reads.find(x=>x.warning===k||x.data?.count!==undefined&&false);return r};
  const first=(index)=>{const value=reads[index]?.data;if(typeof value==='number')return value;return value?.count==null?null:Number(value?.count||0)};
  const operations=(reads[6].data||[]).map(r=>({...r,id:Number(r.id),resourceId:r.resource_id==null?null:String(r.resource_id)}));
  const history=(reads[7].data||[]).map(r=>({...r,id:Number(r.id),resourceId:r.resource_id==null?null:String(r.resource_id)}));
  const releases=(reads[8].data||[]).map(r=>({...r,id:Number(r.id),active:Boolean(r.active),stage:r.status==='active'?'LIVE':String(r.status||'').toUpperCase()}));
  const agenticControl=reads[9]?.warning?null:reads[9]?.data||null;
  const agenticDecisions=reads[10]?.warning?[]:(reads[10]?.data||[]);
  const agenticOutcomes=reads[11]?.warning?[]:(reads[11]?.data||[]);
  if(reads[9]?.warning)unavailable.push({authority:'agentic-control',code:'AUTHORITY_UNAVAILABLE'});
  const health=unavailable.length?'AUTHORITY_UNAVAILABLE':first(3)>0?'ATTENTION':'PROTECTED';
  const attention=[];
  if(first(4)>0)attention.push({type:'verification',title:`${first(4)} verification review${first(4)===1?'':'s'} pending`,status:'ATTENTION',label:'OPEN',workspace:'verification'});
  if(first(5)>0)attention.push({type:'data-entry',title:`${first(5)} data entries require completion`,status:'ATTENTION',label:'OPEN',workspace:'data-entry'});
  if(first(3)>0)attention.push({type:'operations',title:`${first(3)} administrative operation${first(3)===1?'':'s'} in flight`,status:'IN PROGRESS',label:'OPEN',workspace:'system-health'});
  return Object.freeze({version:SUPER_ADMIN_OPERATING_SYSTEM_VERSION,release:RELEASE_VERSION,authoritative:false,readOnlyProjection:true,health,unavailableAuthorities:unavailable,platform:{organizations:first(0),liveProducts:first(1),activeMissions:first(2),operationsInFlight:first(3),pendingVerification:first(4),dataEntryAttention:first(5)},attention,operations,history,releases,agentic:{control:agenticControl,decisions:agenticDecisions,outcomes:agenticOutcomes,authority:'Agentic Governance Authority',mutationBoundary:'Governance commands only; canonical mission/action authorities remain operational truth'},actionMatrix:getCanonicalAdminActionMatrix(),architecture:{controlPlane:'orchestration + projection',truth:'canonical domain authorities',commands:'canonical Action Registry / secured domain routes',authorization:'server-side canonical authorization',evidence:'canonical audit + operation authorities',mutationBoundary:'No Control Plane-specific SQL mutation authority'}});
}
