import {canonicalAll,canonicalFirst,authorityUnavailable} from '../core/canonical-db.js';
import {requireCapabilityContract,capabilityContractSummary} from './capability-contract.service.js';

export const CAPABILITY_RESOURCE_CONTRACT_VERSION='13.2.0';

const clean=(v,max=200)=>String(v??'').trim().slice(0,max);
const parse=(v,f={})=>{try{const x=JSON.parse(String(v??''));return x??f}catch{return f}};
const arr=v=>Array.isArray(v)?v:[];

/**
 * Operational contract gateway.
 *
 * This is deliberately a validation/projection boundary, not an authority.
 * Capability contracts remain owned by capability-contract authority and
 * resource truth remains owned by the resource's canonical owner.
 */
export async function getResourceContract(env,{resourceType,resourceKey}={}){
  const type=clean(resourceType,100),key=clean(resourceKey,240);
  if(!type||!key)return null;
  const row=await canonicalFirst(env,`SELECT resource_type,resource_key,label,authority_code,governance_version,metadata_json,owner_capability,risk_class,step_up_required,identity_rule,lifecycle_json,provenance_json,consumer_scope_json,version
    FROM platform_control_plane_resource_contracts
    WHERE resource_type=? AND (resource_key=? OR resource_key='*')
    ORDER BY CASE WHEN resource_key=? THEN 0 ELSE 1 END, updated_at DESC
    LIMIT 1`,[type,key,key],'resource_contract_authority');
  if(!row)return null;
  return normalizeResourceContract(row);
}

export async function requireResourceContract(env,{resourceType,resourceKey,consumerCapability=null,tenantScope=null,requireOwnerCapability=null}={}){
  const contract=await getResourceContract(env,{resourceType,resourceKey});
  if(!contract)throw fail('RESOURCE_CONTRACT_UNAVAILABLE',503,{resourceType,resourceKey});
  if(requireOwnerCapability&&contract.ownerCapability!==requireOwnerCapability){
    throw fail('RESOURCE_OWNER_CAPABILITY_MISMATCH',409,{resourceType,resourceKey,expected:requireOwnerCapability,actual:contract.ownerCapability});
  }
  if(consumerCapability&&!resourceConsumerAllowed(contract,consumerCapability)){
    throw fail('RESOURCE_CONSUMER_NOT_CONTRACTED',403,{resourceType,resourceKey,consumerCapability,ownerCapability:contract.ownerCapability});
  }
  if(tenantScope&&contract.consumerScope?.tenantScope&&contract.consumerScope.tenantScope!==tenantScope&&contract.consumerScope.tenantScope!=='any'){
    throw fail('RESOURCE_TENANT_SCOPE_MISMATCH',403,{resourceType,resourceKey,expected:tenantScope,actual:contract.consumerScope.tenantScope});
  }
  return contract;
}

export async function requireCapabilityOperation(env,{capabilityCode,command,riskClass=null,resources=[],tenantScope=null}={}){
  const capability=await requireCapabilityContract(env,capabilityCode,{riskClass,requiredCommand:command});
  const refs=Array.isArray(resources)?resources.filter(Boolean):[];
  const resolved=[];
  for(const ref of refs){
    const resource=await requireResourceContract(env,{resourceType:ref.resourceType,resourceKey:ref.resourceKey,consumerCapability:capabilityCode,tenantScope});
    resolved.push({resourceType:resource.resourceType,resourceKey:resource.resourceKey,ownerCapability:resource.ownerCapability,riskClass:resource.riskClass,stepUpRequired:resource.stepUpRequired,version:resource.version});
  }
  return Object.freeze({
    version:CAPABILITY_RESOURCE_CONTRACT_VERSION,
    capability:capabilityContractSummary(capability),
    command:String(command||''),
    resources:Object.freeze(resolved),
    tenantScope:tenantScope||capability.tenantScope,
    invariant:Object.freeze({
      capabilityCommandContracted:true,
      resourcesContracted:true,
      noAuthorityTransfer:true,
      ownerCapabilityRemainsCanonical:true
    })
  });
}

export async function listResourceContracts(env,{resourceType=null,ownerCapability=null,limit=100}={}){
  const n=Math.min(200,Math.max(1,Number(limit)||100));
  const where=[];const args=[];
  if(resourceType){where.push('resource_type=?');args.push(clean(resourceType,100));}
  if(ownerCapability){where.push('owner_capability=?');args.push(clean(ownerCapability,100));}
  const rows=await canonicalAll(env,`SELECT resource_type,resource_key,label,authority_code,governance_version,metadata_json,owner_capability,risk_class,step_up_required,identity_rule,lifecycle_json,provenance_json,consumer_scope_json,version FROM platform_control_plane_resource_contracts ${where.length?`WHERE ${where.join(' AND ')}`:''} ORDER BY resource_type,resource_key LIMIT ?`,[...args,n],'resource_contract_authority');
  return rows.map(normalizeResourceContract);
}

function normalizeResourceContract(row){
  return Object.freeze({
    resourceType:String(row.resource_type),resourceKey:String(row.resource_key),label:String(row.label||row.resource_key),authorityCode:String(row.authority_code||''),
    governanceVersion:String(row.governance_version||''),metadata:parse(row.metadata_json,{}),ownerCapability:String(row.owner_capability||''),riskClass:String(row.risk_class||'medium'),stepUpRequired:Number(row.step_up_required)===1,
    identityRule:row.identity_rule?String(row.identity_rule):null,lifecycle:parse(row.lifecycle_json,{}),provenance:parse(row.provenance_json,{}),consumerScope:parse(row.consumer_scope_json,{}),version:String(row.version||'1')
  });
}

function resourceConsumerAllowed(contract,capability){
  const scope=contract.consumerScope||{};
  const allowed=arr(scope.capabilities);
  if(!allowed.length)return true;
  return allowed.includes('*')||allowed.includes(capability);
}

function fail(code,status=409,extra={}){const error=Object.assign(new Error(code),{code,status});Object.assign(error,extra);return error;}
