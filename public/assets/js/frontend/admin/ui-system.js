/* ON Mission 10.72.0 — shared UI semantics */
export const UI_STATUS=Object.freeze({HEALTHY:'HEALTHY',READY:'READY',LIVE:'LIVE',ACTIVE:'ACTIVE',IN_PROGRESS:'IN PROGRESS',ATTENTION:'ATTENTION',BLOCKED:'BLOCKED',FAILED:'FAILED',DEGRADED:'DEGRADED',UNAVAILABLE:'UNAVAILABLE',PENDING:'PENDING',NOT_CONFIGURED:'NOT CONFIGURED',NOT_APPLICABLE:'NOT APPLICABLE'});
export const statusTone=value=>{const s=String(value||'').toUpperCase();if(['HEALTHY','READY','LIVE','ACTIVE','PROTECTED','VERIFIED','CATALOG','GOVERNED','CONTROLLED','AUDIT','RECOVERY'].includes(s))return'ok';if(['CANONICAL','COMMERCIAL','FOUNDATION','READ ONLY','SESSION CONTEXT','AVAILABLE','CONFIGURED'].includes(s))return'neutral';if(['ATTENTION','IN PROGRESS','PENDING','PREPARING','DRAFT','VALIDATED','CHECK','REVIEW'].includes(s))return'warn';return'bad'};
export const displayValue=(value,{unknown='UNAVAILABLE'}={})=>value===null||value===undefined||value===''?unknown:String(value);
export const escapeHtml=value=>String(value??'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\\':'&#92;','"':'&quot;'}[c]));

export const workspaceStateMeta=Object.freeze({loading:{label:'LOADING',tone:'neutral'},empty:{label:'EMPTY',tone:'neutral'},unavailable:{label:'UNAVAILABLE',tone:'bad'},attention:{label:'ATTENTION',tone:'warn'},ready:{label:'READY',tone:'ok'},healthy:{label:'HEALTHY',tone:'ok'}});
export function workspaceStateLabel(state){return workspaceStateMeta[String(state||'').toLowerCase()]?.label||String(state||'AVAILABLE').toUpperCase()}
