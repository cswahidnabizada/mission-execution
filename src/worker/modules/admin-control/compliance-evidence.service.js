import {RELEASE_VERSION} from '../../core/release.js';
import {auditAdminControl} from './admin-control.audit.js';
import {clean,nullable,bad} from './admin-control.utils.js';
import {canonicalAll,canonicalFirst} from '../../core/canonical-db.js';
export async function getComplianceEvidence(env){
  const evidence=(await env.DB.prepare(`SELECT id,evidence_id,evidence_type,control_code,subject_type,subject_id,company_id,country_code,jurisdiction_code,source_table,source_record_id,status,observed_at,expires_at,metadata FROM compliance_evidence_registry ORDER BY observed_at DESC,id DESC LIMIT 250`).all()).results||[];
  const [policies,consent,privacy,holds,files,providers,providerAudits,residency,backups,restores,reconciliations,critical,admin]=await Promise.all([
    canonicalAll(env,`SELECT COUNT(*) count FROM jurisdiction_policies WHERE status='active' UNION ALL SELECT COUNT(*) FROM sector_policies WHERE status='active'`,[], 'compliance_evidence'),
    canonicalFirst(env,`SELECT COUNT(*) count FROM consent_policy_versions WHERE active=1`,[], 'compliance_evidence'),
    canonicalAll(env,`SELECT status,COUNT(*) count FROM privacy_requests GROUP BY status`,[], 'compliance_evidence'),
    canonicalFirst(env,`SELECT COUNT(*) count FROM privacy_legal_holds WHERE active=1`,[], 'compliance_evidence'),
    canonicalFirst(env,`SELECT COUNT(*) count FROM mission_files`,[], 'compliance_evidence'),
    canonicalFirst(env,`SELECT COUNT(*) count FROM external_provider_registry WHERE active=1`,[], 'compliance_evidence'),
    canonicalFirst(env,`SELECT COUNT(*) count FROM external_provider_audit_events`,[], 'compliance_evidence'),
    canonicalFirst(env,`SELECT COUNT(*) count FROM residency_policies WHERE active=1`,[], 'compliance_evidence'),
    canonicalFirst(env,`SELECT COUNT(*) count FROM backup_recovery_points`,[], 'compliance_evidence'),
    canonicalFirst(env,`SELECT COUNT(*) count FROM backup_restore_requests`,[], 'compliance_evidence'),
    canonicalFirst(env,`SELECT COUNT(*) count FROM backup_reconciliation_events`,[], 'compliance_evidence'),
    canonicalAll(env,`SELECT phase,COUNT(*) count FROM critical_audit_events GROUP BY phase`,[], 'compliance_evidence'),
    canonicalFirst(env,`SELECT COUNT(*) count FROM admin_control_audit_events`,[], 'compliance_evidence')
  ]);
  const privacyCounts={}; for(const x of privacy||[]) privacyCounts[x.status]=Number(x.count||0);
  const criticalCounts={}; for(const x of critical||[]) criticalCounts[x.phase]=Number(x.count||0);
  const metrics={
    activeJurisdictionPolicies:Number(policies?.[0]?.count||0),activeSectorPolicies:Number(policies?.[1]?.count||0),
    activeConsentPolicies:Number(consent?.count||0),privacyRequests:Object.values(privacyCounts).reduce((a,b)=>a+b,0),activeLegalHolds:Number(holds?.count||0),
    governedFiles:Number(files?.count||0),activeProviders:Number(providers?.count||0),providerAuditEvents:Number(providerAudits?.count||0),activeResidencyPolicies:Number(residency?.count||0),
    recoveryPoints:Number(backups?.count||0),restoreRequests:Number(restores?.count||0),reconciliationEvents:Number(reconciliations?.count||0),criticalAuditEvents:Object.values(criticalCounts).reduce((a,b)=>a+b,0),adminAuditEvents:Number(admin?.count||0)
  };
  const controlSet=[
    ['country_jurisdiction','jurisdiction','active',metrics.activeJurisdictionPolicies],['sector_policy','policy','active',metrics.activeSectorPolicies],['consent_policy','consent','active',metrics.activeConsentPolicies],
    ['privacy_workflow','privacy_request','active',metrics.privacyRequests],['retention_policy','retention','active',metrics.activeJurisdictionPolicies],['legal_hold','legal_hold','active',metrics.activeLegalHolds],
    ['file_governance','file_governance','active',metrics.governedFiles],['provider_governance','provider_governance','active',metrics.activeProviders],['provider_audit','provider_governance','active',metrics.providerAuditEvents],
    ['residency_policy','residency','active',metrics.activeResidencyPolicies],['backup_recovery','backup_recovery','active',metrics.recoveryPoints+metrics.restoreRequests+metrics.reconciliationEvents],
    ['critical_audit','critical_audit','active',metrics.criticalAuditEvents],['administrative_history','administrative_history','active',metrics.adminAuditEvents]
  ];
  const controls=controlSet.map(([controlCode,type,status,count])=>({controlCode,evidenceType:type,status:count>0?'satisfied':'attention',count}));
  return {evidence:evidence.map(x=>({...x,id:Number(x.id)})),controls,metrics};
}
export async function recordComplianceEvidence(env,actor,data,requestId){
  const types=new Set(['policy','consent','privacy_request','retention','legal_hold','file_governance','provider_governance','residency','backup_recovery','critical_audit','administrative_history','company_compliance']);
  const statuses=new Set(['observed','satisfied','attention','blocked','expired']);
  const type=clean(data.evidenceType,40); const status=clean(data.status,30); const controlCode=clean(data.controlCode,100); const sourceTable=clean(data.sourceTable,100);
  if(!types.has(type)||!statuses.has(status)||!controlCode||!sourceTable)throw bad('Compliance evidence fields are invalid');
  const evidenceId=clean(data.evidenceId,160)||`ce_${crypto.randomUUID()}`;
  const companyId=data.companyId?Number(data.companyId):null;
  await env.DB.prepare(`INSERT OR IGNORE INTO compliance_evidence_registry(evidence_id,evidence_type,control_code,subject_type,subject_id,company_id,country_code,jurisdiction_code,source_table,source_record_id,status,observed_at,expires_at,metadata) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(evidenceId,type,controlCode,clean(data.subjectType,80)||'platform',nullable(data.subjectId,160),companyId,nullable(data.countryCode,2)?.toUpperCase()||null,nullable(data.jurisdictionCode,80),sourceTable,nullable(data.sourceRecordId,160),status,clean(data.observedAt,60)||new Date().toISOString(),nullable(data.expiresAt,60),JSON.stringify({version:RELEASE_VERSION,metadata:data.metadata||{}})).run();
  await auditAdminControl(env,{actor,action:'admin.compliance-evidence.recorded',resourceType:'compliance_evidence',resourceId:null,targetCompanyId:companyId,requestId,metadata:{evidenceId,controlCode,evidenceType:type,status,sourceTable}});
  return (await env.DB.prepare(`SELECT * FROM compliance_evidence_registry WHERE evidence_id=? LIMIT 1`).bind(evidenceId).first());
}
