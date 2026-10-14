/**
 * ON Mission 10.35.5 — Jurisdiction data-plane policy boundary.
 * This is intentionally a configuration boundary: the actual German D1/database
 * binding must be provisioned as German infrastructure before strict production
 * enforcement is enabled. The application never silently treats another region
 * as Germany-compliant.
 */
export function dataPlanePolicy(env,jurisdictionCode){
  const code=String(jurisdictionCode||'').trim().toUpperCase();
  if(!/^[A-Z]{2}$/.test(code)||code==='ZZ') return Object.freeze({jurisdiction:'ZZ',mode:'unresolved',requiredProvider:null,binding:null,fallbackAllowed:false});
  if(code==='DE')return Object.freeze({jurisdiction:'DE',mode:String(env?.GERMANY_DATA_RESIDENCY||'required'),requiredProvider:'GERMAN_DATA_CENTER',binding:String(env?.GERMANY_DATA_DB_BINDING||'DB_DE'),fallbackAllowed:false});
  return Object.freeze({jurisdiction:code,mode:'policy',requiredProvider:'CONFIGURABLE_CLOUD_PROVIDER',binding:String(env?.GLOBAL_DATA_DB_BINDING||'DB'),fallbackAllowed:true});
}

export function assertDataPlanePolicy(env,jurisdictionCode){
  const policy=dataPlanePolicy(env,jurisdictionCode);
  if(policy.jurisdiction==='DE' && policy.mode==='required' && env?.GERMANY_DATA_RESIDENCY_ENFORCE==='true' && !env?.[policy.binding]){
    const e=new Error('GERMAN_DATA_PLANE_NOT_CONFIGURED');e.status=503;throw e;
  }
  return policy;
}
