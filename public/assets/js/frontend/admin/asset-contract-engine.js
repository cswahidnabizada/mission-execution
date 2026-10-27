/* ON Mission 16.56.0 — Canonical Asset Contract Engine.
 * A normalized UI contract over existing server-owned definitions. This module does not grant authority,
 * persist records, infer lifecycle transitions, or replace domain validation.
 */
export const ASSET_CONTRACT_ENGINE_VERSION = '16.56.0';
export const ASSET_FAMILIES = Object.freeze([
  'Data assets','Logical assets','Visible assets','Operational assets',
  'Service & integration assets','Governance & release assets'
]);
const norm = v => String(v ?? '').trim().toLowerCase().replaceAll('-', '_').replaceAll(' ', '_');
const list = v => Array.isArray(v) ? v : [];
const familyFor = d => {
  const s = `${d?.entryType||''} ${d?.category||''} ${d?.label||''}`.toLowerCase();
  if (/layout|page|component|dashboard|navigation|view|form|feature/.test(s)) return 'Visible assets';
  if (/policy|capability|eligibility|workflow|mission_plan|rule|contract|pricing|plan/.test(s)) return 'Logical assets';
  if (/provider|storage|integration|connection|service|api/.test(s)) return 'Service & integration assets';
  if (/release|approval|audit|certif|manifest|lifecycle|blueprint/.test(s)) return 'Governance & release assets';
  if (/executor|vehicle|equipment|location|customer|organization|resource|company/.test(s)) return 'Operational assets';
  return 'Data assets';
};
export function buildAssetContract(definition, mode='create') {
  if (!definition || !String(definition.entryType||'').trim()) throw new TypeError('ASSET_TYPE_CONTRACT_REQUIRED');
  const fields = list(definition.fields).map(name => {
    const schema = definition.fieldSchemas?.[name] || {};
    return Object.freeze({ name:String(name), schema:Object.freeze({...schema}), required:Boolean(schema.required || ['name','code','title','purposeCode'].includes(name)),
      immutable: mode === 'update' && Boolean(schema.immutable || schema.readOnly || schema.mutable === false),
      relation: schema.relation ? String(schema.relation) : null });
  });
  const unique = new Set();
  for (const f of fields) { if (unique.has(f.name)) throw new TypeError(`ASSET_CONTRACT_DUPLICATE_FIELD:${f.name}`); unique.add(f.name); }
  return Object.freeze({ version:ASSET_CONTRACT_ENGINE_VERSION, type:norm(definition.entryType), label:String(definition.label||definition.entryType),
    family:familyFor(definition), authority:String(definition.authority||'server-defined'), risk:String(definition.risk||'medium'), mode,
    fields:Object.freeze(fields), identity:Object.freeze({ canonicalIdOwnedByServer:true, immutableOnUpdate:['id','canonical_resource_id','tenant_id','created_at','createdAt'] }),
    scope:Object.freeze({ serverAuthoritative:true, tenantIsolationRequired:true, marketScopeRequired:true }),
    relationships:Object.freeze(fields.filter(f=>f.relation).map(f=>Object.freeze({field:f.name,targetType:f.relation,resolveExistingOnly:true,serverValidationRequired:true}))),
    lifecycle:Object.freeze({ authorityOwned:true, transitionsMustBeServerValidated:true, formCompletionDoesNotImplyReadiness:true }),
    commit:Object.freeze({ previewRequired:true, routeBoundAuthorizationRequired:true, idempotencyRequired:mode==='create', concurrencyCheckRequired:mode==='update', canonicalReadbackRequired:true, uncertainOutcomeRequiresReconciliation:true })
  });
}
export function validateAssetContractInput(contract, payload) {
  const errors=[]; const value=payload && typeof payload==='object' && !Array.isArray(payload) ? payload : {};
  const known=new Set(contract.fields.map(f=>f.name));
  for (const key of Object.keys(value)) if (!known.has(key)) errors.push({field:key,code:'FIELD_NOT_IN_CONTRACT'});
  for (const field of contract.fields) {
    const v=value[field.name];
    if (field.required && (v===undefined || v===null || (typeof v==='string'&&!v.trim()))) errors.push({field:field.name,code:'REQUIRED'});
    if (field.immutable && Object.prototype.hasOwnProperty.call(value,field.name)) errors.push({field:field.name,code:'FIELD_IMMUTABLE'});
    if (field.schema.type==='integer' && v!==undefined && v!=='' && (!Number.isSafeInteger(Number(v)) || Number(v)<(field.schema.min??0))) errors.push({field:field.name,code:'INVALID_INTEGER'});
    if (field.schema.type==='enum' && v!==undefined && v!=='' && !list(field.schema.options).includes(v)) errors.push({field:field.name,code:'INVALID_ENUM'});
    if (field.relation && v!==undefined && v!==null && String(v).trim()==='') errors.push({field:field.name,code:'RELATION_REQUIRED'});
  }
  return Object.freeze({valid:errors.length===0,errors:Object.freeze(errors),serverValidationRequired:true});
}
export function assetContractCommitPlan(contract) {
  return Object.freeze(['local_contract_validation','server_preview_and_dependency_validation','route_bound_authorization','canonical_owner_commit','canonical_readback_verification']);
}
