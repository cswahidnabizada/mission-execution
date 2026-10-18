/* ON Mission 10.72.0 — shared governance operational state projection.
 * Presentation only. Existing governance authorities remain canonical.
 */
import {statusTone,escapeHtml} from './ui-system.js?v=16.10.59';

const asArray=v=>Array.isArray(v)?v:[];
const present=(data,key)=>Object.prototype.hasOwnProperty.call(data||{},key)&&data[key]!==undefined&&data[key]!==null;
const countActive=(rows,key='active')=>asArray(rows).filter(x=>x?.[key]===true||Number(x?.[key])===1).length;

export function governanceReadiness(data={}){
  const modules=[];
  const add=(key,label,source,items,status,detail,action)=>modules.push({key,label,source,items,status,detail,action});
  const privacy=data.privacySummary;
  if(present(data,'privacySummary')){
    const c=privacy?.counts||{}; const open=Number(c.received||0)+Number(c.processing||0)+Number(c.restricted||0);
    add('privacy','Privacy requests','Privacy Administration',open,open?'attention':'ready',open?`${open} request${open===1?'':'s'} require processing.`:'No open privacy requests.','privacy-rights');
  }else add('privacy','Privacy requests','Privacy Administration',null,'unavailable','Privacy authority did not return a state projection.','privacy-rights');

  const consent=asArray(data.consentPolicies);
  if(present(data,'consentPolicies')) { const active=countActive(consent); add('consent','Consent policy','Consent & Privacy',active,active?'ready':'attention',active?`${active} active polic${active===1?'y':'ies'}.`:'No active consent policies; configure and verify the required policy before launch.','consent'); }
  else add('consent','Consent policy','Consent & Privacy',null,'unavailable','Consent policy authority did not return a state projection.','consent');

  const residency=asArray(data.residency);
  if(present(data,'residency')) { const active=countActive(residency); add('residency','Residency','Residency Policy',active,active?'ready':'attention',active?`${active} active residency polic${active===1?'y':'ies'}.`:'No active residency policies configured; jurisdiction readiness is not proven.','residency'); }
  else add('residency','Residency','Residency Policy',null,'unavailable','Residency authority did not return a state projection.','residency');

  const pg=data.externalProviderGovernance;
  if(present(data,'externalProviderGovernance')){
    const providers=asArray(pg?.providers),policies=asArray(pg?.policies); const active=providers.filter(x=>x?.active===true||Number(x?.active)===1); const approved=active.filter(x=>['approved','configured'].includes(String(x.contract_status||'').toLowerCase()));
    add('providers','Providers','Provider Governance',active.length,active.length>0&&approved.length===active.length?'ready':'attention',active.length?`${approved.length}/${active.length} active providers are contract-approved or configured.`:'No active providers are configured; provider readiness is not proven.', 'providers');
  }else add('providers','Providers','Provider Governance',null,'unavailable','Provider governance authority did not return a state projection.','providers');

  const analytics=data.analyticsGovernance;
  if(present(data,'analyticsGovernance')) { const active=countActive(analytics?.policies); add('analytics','Analytics governance','Analytics Governance',active,active?'ready':'attention',active?'Governance metadata is available; tenant results remain isolated.':'No active analytics governance policies; review configuration before launch.','analytics-governance'); }
  else add('analytics','Analytics governance','Analytics Governance',null,'unavailable','Analytics governance authority did not return a state projection.','analytics-governance');

  const notifications=data.notificationGovernance;
  if(present(data,'notificationGovernance')) { const active=countActive(notifications?.policies); add('notifications','Notification governance','Notification Governance',active,active?'ready':'attention',active?'Notification policy metadata is available.':'No active notification policies; notification readiness is not proven.','notifications'); }
  else add('notifications','Notification governance','Notification Governance',null,'unavailable','Notification governance authority did not return a state projection.','notifications');

  const backup=data.backupRecoveryGovernance;
  if(present(data,'backupRecoveryGovernance')){
    const backups=asArray(backup?.backups),restores=asArray(backup?.restoreRequests); const pending=restores.filter(x=>['requested','authorized','ready','executing'].includes(String(x.execution_status||'').toLowerCase())).length;
    add('backup','Backup & recovery','Backup / Recovery Governance',backups.length,pending?'attention':'ready',pending?`${pending} restore request${pending===1?'':'s'} require operational attention.`:`${backups.length} backup polic${backups.length===1?'y':'ies'} projected.`,'backup-recovery');
  }else add('backup','Backup & recovery','Backup / Recovery Governance',null,'unavailable','Backup and recovery authority did not return a state projection.','backup-recovery');

  const evidence=data.complianceEvidence;
  if(present(data,'complianceEvidence')){
    const m=evidence?.metrics||{}; const weak=Number(m.activeResidencyPolicies||0)===0||Number(m.activeProviders||0)===0;
    add('evidence','Compliance evidence','Evidence & Audit',Number(m.evidenceRecords||0),weak?'attention':'ready',weak?'One or more governance foundations have no active records.':'Governance evidence projection is available.','audit');
  }else add('evidence','Compliance evidence','Evidence & Audit',null,'unavailable','Compliance evidence authority did not return a state projection.','audit');

  const unavailable=modules.filter(x=>x.status==='unavailable');
  const attention=modules.filter(x=>x.status==='attention');
  const overall=unavailable.length?'UNAVAILABLE':attention.length?'ATTENTION':'PROTECTED';
  return {modules,overall,unavailable,attention};
}

export function renderGovernanceReadiness(snapshot,{navigate}={}){
  const s=snapshot||{modules:[],overall:'UNAVAILABLE'};
  return `<section class="card section governance-readiness"><header class="section-head"><div><span class="eyebrow">10.56 · GOVERNANCE POSTURE</span><h2>Security, privacy &amp; data-boundary readiness</h2><p class="sub">Live administrative projections from the existing canonical governance authorities. Empty is never treated as healthy when an authority is unavailable.</p></div><span class="pill ${statusTone(s.overall)}">${escapeHtml(s.overall)}</span></header><div class="governance-readiness-grid">${s.modules.map(m=>`<article class="governance-readiness-card"><div class="workspace-index-top"><span class="workspace-icon">${escapeHtml(m.label.slice(0,1))}</span><div><h3>${escapeHtml(m.label)}</h3><span class="pill ${statusTone(m.status)}">${escapeHtml(m.status.toUpperCase())}</span></div></div><p>${escapeHtml(m.detail)}</p><div class="workspace-governance-meta"><span>${escapeHtml(m.source)}</span><span>${m.items==null?'NO PROJECTION':escapeHtml(String(m.items))+' RECORDS'}</span></div><button class="btn muted" data-governance-open="${escapeHtml(m.action)}">OPEN</button></article>`).join('')}</div></section>`;
}
