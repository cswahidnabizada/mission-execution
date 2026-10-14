import {canonicalAll,canonicalFirst} from '../core/canonical-db.js';

export const CAPABILITY_CONTRACT_VERSION='12.8.0';
const parse=(v,f)=>{try{const x=JSON.parse(String(v??''));return x??f}catch{return f}};
const clean=(v,max=160)=>String(v??'').trim().slice(0,max);
const rowToContract=row=>row?({
  capabilityCode:String(row.capability_code),version:String(row.version),purpose:String(row.purpose),
  inputs:parse(row.inputs_json,[]),outputs:parse(row.outputs_json,[]),commands:parse(row.commands_json,[]),queries:parse(row.queries_json,[]),resourceTypes:parse(row.resource_types_json,[]),
  riskClass:String(row.risk_class),tenantScope:String(row.tenant_scope),sideEffects:parse(row.side_effects_json,[]),dependencies:parse(row.dependencies_json,[]),preconditions:parse(row.preconditions_json,[]),postconditions:parse(row.postconditions_json,[]),
  failureContract:parse(row.failure_contract_json,{}),verificationContract:parse(row.verification_contract_json,{}),recoveryContract:parse(row.recovery_contract_json,{}),healthContract:parse(row.health_contract_json,{}),observability:parse(row.observability_json,{}),status:String(row.status)
}):null;

export async function getCapabilityContract(env,capabilityCode){
 const code=clean(capabilityCode);
 if(!code)return null;
 const row=await canonicalFirst(env,'SELECT * FROM canonical_capability_contracts WHERE capability_code=? AND status=\'active\' LIMIT 1',[code],'capability_contract_authority');
 return rowToContract(row);
}

export async function listCapabilityContracts(env,{status='active',limit=100}={}){
 const n=Math.min(200,Math.max(1,Number(limit)||100));
 const rows=await canonicalAll(env,'SELECT * FROM canonical_capability_contracts WHERE status=? ORDER BY capability_code LIMIT ?',[clean(status,40),n],'capability_contract_authority');
 return rows.map(rowToContract);
}

export async function requireCapabilityContract(env,capabilityCode,{riskClass=null,requiredCommand=null}={}){
 const contract=await getCapabilityContract(env,capabilityCode);
 if(!contract)throw Object.assign(new Error('CAPABILITY_CONTRACT_UNAVAILABLE'),{status:503,code:'CAPABILITY_CONTRACT_UNAVAILABLE',capabilityCode});
 if(riskClass&&contract.riskClass!==riskClass)throw Object.assign(new Error('CAPABILITY_CONTRACT_RISK_MISMATCH'),{status:409,code:'CAPABILITY_CONTRACT_RISK_MISMATCH',capabilityCode,expected:riskClass,actual:contract.riskClass});
 if(requiredCommand&&!contract.commands.includes(requiredCommand))throw Object.assign(new Error('CAPABILITY_COMMAND_NOT_CONTRACTED'),{status:409,code:'CAPABILITY_COMMAND_NOT_CONTRACTED',capabilityCode,command:requiredCommand});
 return contract;
}

export function capabilityContractSummary(contract){return contract?{capabilityCode:contract.capabilityCode,version:contract.version,riskClass:contract.riskClass,tenantScope:contract.tenantScope,commands:contract.commands,sideEffects:contract.sideEffects,contractVersion:CAPABILITY_CONTRACT_VERSION}:null;}
