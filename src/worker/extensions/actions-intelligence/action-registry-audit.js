import {RELEASE_VERSION} from '../../core/release.js';
/* ON Mission 10.30.38 — Canonical Action Registry Audit Contract.
 * Read-only engineering contract. It verifies registry completeness against the
 * existing service map without granting authority or executing actions.
 */
import {ACTION_REGISTRY} from "../../application/actions/action-registry.js";
import {ACTION_SERVICE_MAP} from "../../application/actions/action-service-map.js";

export const ACTION_REGISTRY_AUDIT_VERSION=RELEASE_VERSION;

export function auditActionRegistry({registry=ACTION_REGISTRY,serviceMap=ACTION_SERVICE_MAP}={}){
  const problems=[];
  const registryCodes=Object.keys(registry||{}).map(String);
  const serviceCodes=Object.keys(serviceMap||{}).map(String);
  for(const code of registryCodes){
    const d=registry[code]||{};
    if(String(d.id||code)!==code)problems.push(`${code}:stable_identity_mismatch`);
    if(!d.label)problems.push(`${code}:label_missing`);
    if(!d.domain)problems.push(`${code}:domain_missing`);
    if(!serviceMap[code])problems.push(`${code}:service_route_missing`);
  }
  for(const code of serviceCodes)if(!registry[code])problems.push(`${code}:service_route_unregistered`);
  return [...new Set(problems)];
}

export function actionRegistryAuditSummary(){
  const problems=auditActionRegistry();
  const codes=Object.keys(ACTION_REGISTRY);
  return Object.freeze({version:ACTION_REGISTRY_AUDIT_VERSION,total:codes.length,registered:codes.length,serviceMapped:Object.keys(ACTION_SERVICE_MAP).length,problems});
}
