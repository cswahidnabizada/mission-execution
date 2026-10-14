import {canOrganizationLifecycleTransition,isOrganizationLifecycleStatus,organizationLifecycleSuccessors} from '../core/canonical-product-readiness-registry.js';
import {prepareAdminControlAudit} from './admin-control-audit.service.js';
function bad(message,status=400){const e=new Error(message);e.status=status;return e;}
function clean(v,max=240){return String(v??'').trim().slice(0,max);}
export async function getOrganizationLifecycle(env,companyId){
  const id=Number(companyId||0); if(!id) throw bad('Company id is required');
  const row=await env.DB.prepare(`SELECT c.id company_id,c.deletion_status,cmp.status,cmp.status_reason,cmp.status_version,cmp.status_updated_at,cmp.status_changed_by_type,cmp.status_changed_by_id FROM companies c LEFT JOIN company_management_profiles cmp ON cmp.company_id=c.id WHERE c.id=? LIMIT 1`).bind(id).first();
  if(!row) throw bad('Organization not found',404);
  const history=(await env.DB.prepare(`SELECT transition_id,from_status,to_status,transition_kind,reason_code,reason,actor_type,actor_id,request_id,expected_status_version,resulting_status_version,metadata,created_at FROM organization_lifecycle_transitions WHERE company_id=? ORDER BY id DESC LIMIT 100`).bind(id).all()).results||[];
  return {companyId:id,status:row.status,statusReason:row.status_reason||null,statusVersion:Number(row.status_version||1),statusUpdatedAt:row.status_updated_at,changedBy:{type:row.status_changed_by_type||null,id:row.status_changed_by_id||null},allowedNext:organizationLifecycleSuccessors(row.status),history};
}
export async function transitionOrganizationLifecycle(env,{companyId,toStatus,actor,reasonCode,reason,requestId,expectedStatusVersion,metadata={}}){
  const id=Number(companyId||0); const to=clean(toStatus,40).toUpperCase(); const rc=clean(reasonCode,100);
  if(!id||!isOrganizationLifecycleStatus(to)||!rc) throw bad('Organization lifecycle transition fields are invalid');
  const current=await env.DB.prepare(`SELECT c.id,c.deletion_status,cmp.status,cmp.status_version FROM companies c LEFT JOIN company_management_profiles cmp ON cmp.company_id=c.id WHERE c.id=? LIMIT 1`).bind(id).first();
  if(!current) throw bad('Organization not found',404);
  if(current.deletion_status!=='active'&&to!=='ARCHIVED') throw bad('Deleted organization may only be archived',409);
  const from=String(current.status||'DRAFT').toUpperCase(); const version=Number(current.status_version||1);
  if(from===to) return getOrganizationLifecycle(env,id);
  if(!canOrganizationLifecycleTransition(from,to)) throw bad(`Invalid organization lifecycle transition: ${from} → ${to}`,409);
  if(expectedStatusVersion!==undefined&&expectedStatusVersion!==null&&Number(expectedStatusVersion)!==version) throw bad('Organization lifecycle is stale; refresh and retry',409);
  const nextVersion=version+1; const transitionId=`org_${id}_${version}_${crypto.randomUUID()}`; const actorType=clean(actor?.role||actor?.type||'system',80); const actorId=actor?.id==null?null:String(actor.id);
  const update=env.DB.prepare(`UPDATE company_management_profiles SET status=?,status_reason=?,status_version=?,status_updated_at=CURRENT_TIMESTAMP,status_changed_by_type=?,status_changed_by_id=?,updated_at=CURRENT_TIMESTAMP WHERE company_id=? AND status=? AND status_version=?`).bind(to,clean(reason),nextVersion,actorType,actorId,id,from,version);
  const event=env.DB.prepare(`INSERT INTO organization_lifecycle_transitions(transition_id,company_id,from_status,to_status,transition_kind,reason_code,reason,actor_type,actor_id,request_id,expected_status_version,resulting_status_version,metadata) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(transitionId,id,from,to,'transition',rc,clean(reason),actorType,actorId,requestId||null,version,nextVersion,JSON.stringify(metadata||{}));
  const audit=prepareAdminControlAudit(env,{actor:actor||{role:actorType,id:actorId},action:'admin.organization.lifecycle.transitioned',resourceType:'organization_lifecycle',resourceId:id,targetCompanyId:id,requestId,metadata:{fromStatus:from,toStatus:to,reasonCode:rc,resultingStatusVersion:nextVersion}});
  const batch=await env.DB.batch([update,event,audit]);
  if(!Number(batch?.[0]?.meta?.changes||0)) throw bad('Organization lifecycle changed concurrently; refresh and retry',409);
  return getOrganizationLifecycle(env,id);
}
