import {RELEASE_VERSION} from '../../core/release.js';
/**
 * ON Mission 10.32.12 — Canonical Action Result Contract.
 *
 * Normalizes the application boundary result without becoming a second Truth
 * source. Domain services remain authoritative; this contract only describes
 * what happened at the application boundary and what the client should do next.
 */
export function buildCanonicalActionResult({
  actionCode,
  target=null,
  responseStatus=null,
  domainResult=null,
  executed=false,
  requestId=null,
  durationMs=null,
  stale=false,
  preparation=null
}={}){
  const status=Number(responseStatus||0)||null;
  const errorCode=String(domainResult?.code||domainResult?.error||"").trim()||null;
  const success=Boolean(executed&&status!==null&&status>=200&&status<300&&domainResult?.success!==false);
  const retryability=classifyRetryability({status,errorCode,stale});
  const next=success
    ? {kind:"reconcile",refresh:String(target?.refresh||"none"),required:Boolean(target?.refresh&&target.refresh!=="none")}
    : stale
      ? {kind:"reprepare",reason:"MISSION_CHANGED",automaticMutationReplay:false}
      : {kind:retryability==="read_retryable"?"retry_read":"resolve_failure",automaticMutationReplay:false};
  return Object.freeze({
    version:RELEASE_VERSION,
    actionCode:String(actionCode||""),
    requestId:requestId?String(requestId):null,
    status,
    success,
    executed:Boolean(executed),
    outcome:success?"SUCCEEDED":stale?"STALE":"FAILED",
    retryability,
    durationMs:durationMs==null?null:Math.max(0,Math.round(Number(durationMs)||0)),
    errorCode,
    next,
    authoritative:true,
    truthSource:"authoritative_domain_service",
    domainResult,
    preparation:preparation||null
  });
}

function classifyRetryability({status,errorCode,stale}){
  if(stale||errorCode==="MISSION_CHANGED"||status===409)return "reprepare";
  if([408,425,429,500,502,503,504].includes(status))return "read_retryable";
  if(status!==null&&status>=400&&status<500)return "not_retryable";
  return "unknown";
}
