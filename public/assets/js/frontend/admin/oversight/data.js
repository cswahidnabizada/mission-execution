/* ON Mission 10.74.0 — administrative projection/data loading boundary. */
import { api, state, configList, loadAdminCountries } from './context.js';
export async function refreshAdminData(){
  state.data=await api('/api/platform/admin/control-plane');
  try{const countries=await loadAdminCountries();if(countries.length||!(state.data?.countries||[]).length)state.data.countries=countries;}catch(e){console.error('Admin country catalog failed:',e?.message||e)}
  if(state.data && !Array.isArray(state.data.configurations)) state.data.configurations=configList();
  const endpoints={privacySummary:'/api/platform/admin/privacy/summary',notificationGovernance:'/api/platform/admin/notification-governance',analyticsGovernance:'/api/platform/admin/analytics-governance',externalProviderGovernance:'/api/platform/admin/external-provider-governance',backupRecoveryGovernance:'/api/platform/admin/backup-recovery-governance',complianceEvidence:'/api/platform/admin/compliance-evidence'};
  const results=await Promise.allSettled(Object.entries(endpoints).map(async([key,path])=>[key,await api(path)]));
  const quality=state.data.dataQuality||{status:'healthy',warnings:[]};
  const warnings=new Set(Array.isArray(quality.warnings)?quality.warnings:[]);
  for(const [index,result] of results.entries()){
    const key=Object.entries(endpoints)[index]?.[0]||'control_plane_module';
    if(result.status==='fulfilled'){const [resultKey,value]=result.value;state.data[resultKey]=value;warnings.delete(resultKey);}
    else{warnings.add(key);console.error('Admin Control Plane module failed:',result.reason?.message||result.reason);}
  }
  quality.warnings=[...warnings]; quality.status=quality.warnings.length?'degraded':'healthy'; state.data.dataQuality=quality;
}
