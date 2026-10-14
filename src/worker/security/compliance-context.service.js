import {RELEASE_VERSION} from '../core/release.js';
import {canonicalFirst,canonicalAll} from '../core/canonical-db.js';
/**
 * ON Mission 10.35.5 — Canonical Compliance Context.
 * Germany-first, deliberately small policy surface. Legal interpretation is
 * configuration; this service does not make legal conclusions.
 */


import {dataPlanePolicy} from './data-residency.service.js';

export async function resolveCanonicalComplianceContext(env,session,{countryCode=null,sectorCode=null,purposeCode='operational_communications',dataClassifications=[]}={}){
  const rawCountry=String(countryCode??session?.countryCode??session?.country_code??'').trim().toUpperCase();
  const normalizedCountry=/^[A-Z]{2}$/.test(rawCountry)?rawCountry:'ZZ';
  if(normalizedCountry==='ZZ'){
    return Object.freeze({
      version:RELEASE_VERSION,
      jurisdiction:Object.freeze({code:null,countryCode:'ZZ',regionCode:null,framework:'JURISDICTION_UNRESOLVED',effectiveVersion:null}),
      sector:Object.freeze({code:null,sectorCode:'general',regulatoryProfile:'unresolved'}),
      organization:Object.freeze({companyId:Number(session?.tenantId||0)||null,policyVersion:null,status:'country_unresolved'}),
      purpose:Object.freeze({code:purposeCode,legalBasis:null,legalBasisDefinition:null}),
      retention:Object.freeze({}),
      dataClassification:Object.freeze(Array.isArray(dataClassifications)?dataClassifications.slice(0,32):[]),
      residency:Object.freeze({code:null,mode:'unresolved',primaryRegion:null,primaryProvider:null,fallbackAllowed:false}),
      actionPolicy:Object.freeze({share_foryou:{allowed:false,reasonCode:'country_unresolved'},request_foryou_mission:{allowed:false,reasonCode:'country_unresolved'},share_network:{allowed:false,reasonCode:'country_unresolved'},accept_network:{allowed:false,reasonCode:'country_unresolved'}}),
      status:'country_unresolved',
      authority:'canonical_compliance_context'
    });
  }
  const orgId=Number(session?.tenantId||0);
  const company=orgId?await canonicalFirst(env,`SELECT country_code,sector_code FROM company_management_profiles WHERE company_id=? LIMIT 1`,[orgId],'canonical_compliance_context'):null;
  const effectiveCountry=String(company?.country_code||normalizedCountry).toUpperCase();
  const jurisdiction=await canonicalFirst(env,`SELECT * FROM jurisdiction_policies WHERE country_code=? AND status='active' ORDER BY effective_version DESC LIMIT 1`,[effectiveCountry],'canonical_compliance_context');
  const organization=orgId?await canonicalFirst(env,`SELECT * FROM organization_compliance_policies WHERE company_id=? LIMIT 1`,[orgId],'canonical_compliance_context'):null;
  const requestedSector=String(sectorCode||organization?.sector_code||company?.sector_code||'general').trim().toLowerCase();
  const sector=await canonicalFirst(env,`SELECT * FROM sector_policies WHERE sector_code=? AND status='active' ORDER BY effective_version DESC,code LIMIT 1`,[requestedSector],'canonical_compliance_context');
  const purpose=await canonicalFirst(env,`SELECT * FROM processing_purposes WHERE code=? AND active=1 LIMIT 1`,[String(purposeCode)],'canonical_compliance_context');
  const residency=organization?.residency_policy_code
    ? await canonicalFirst(env,`SELECT * FROM residency_policies WHERE code=? AND active=1 LIMIT 1`,[String(organization.residency_policy_code)],'canonical_compliance_context')
    : jurisdiction?.code ? await canonicalFirst(env,`SELECT * FROM residency_policies WHERE jurisdiction_code=? AND active=1 ORDER BY version DESC LIMIT 1`,[String(jurisdiction.code)],'canonical_compliance_context') : null;
  const legalBasisCode=String(purpose?.default_legal_basis||'contract');
  const legalBasis=await canonicalFirst(env,`SELECT code,label,description FROM legal_basis_catalog WHERE code=? AND active=1 LIMIT 1`,[legalBasisCode],'canonical_compliance_context');
  const retention=jurisdiction?.code?await canonicalFirst(env,`SELECT code,purpose_code,jurisdiction_code,sector_code,retention_days,action_after_expiry,legal_hold_allowed,version FROM retention_policies WHERE purpose_code=? AND jurisdiction_code=? AND sector_code=? AND active=1 ORDER BY version DESC LIMIT 1`,[String(purpose?.code||purposeCode),String(jurisdiction.code),String(sector?.sector_code||requestedSector||'general')],'canonical_compliance_context'):null;
  const actionRows=jurisdiction?.code&&sector?.code?await canonicalAll(env,`SELECT action_code,allowed,reason_code FROM compliance_action_policies WHERE jurisdiction_code=? AND sector_policy_code=? AND active=1`,[String(jurisdiction.code),String(sector.code)],'canonical_compliance_context'):[];
  const actionPolicy={};
  for(const row of actionRows)actionPolicy[String(row.action_code)]={allowed:Boolean(Number(row.allowed||0)),reasonCode:String(row.reason_code||'policy')};
  for(const code of ['share_foryou','request_foryou_mission','share_network','accept_network'])if(!actionPolicy[code])actionPolicy[code]={allowed:false,reasonCode:'policy_not_configured'};
  const complianceStatus=organization?.status||(!jurisdiction?'policy_unavailable':(!sector||!residency||!retention?'policy_incomplete':'configured'));
  return Object.freeze({
    version:RELEASE_VERSION,
    jurisdiction:Object.freeze({code:jurisdiction?.code||null,countryCode:jurisdiction?.country_code||effectiveCountry,regionCode:jurisdiction?.region_code||null,framework:jurisdiction?.framework_code||'JURISDICTION_UNAVAILABLE',effectiveVersion:jurisdiction?.effective_version||null}),
    sector:Object.freeze({code:sector?.code||null,sectorCode:sector?.sector_code||requestedSector||'general',regulatoryProfile:sector?.regulatory_profile||'unresolved'}),
    organization:Object.freeze({companyId:orgId||null,policyVersion:organization?.policy_version||RELEASE_VERSION,status:complianceStatus}),
    purpose:Object.freeze({code:purpose?.code||purposeCode,legalBasis:legalBasisCode,legalBasisDefinition:legalBasis?Object.freeze({code:legalBasis.code,label:legalBasis.label,description:legalBasis.description}):null}),
    retention:Object.freeze(retention?{code:retention.code,days:retention.retention_days===null||retention.retention_days===undefined?null:Number(retention.retention_days),actionAfterExpiry:retention.action_after_expiry,legalHoldAllowed:Boolean(Number(retention.legal_hold_allowed||0)),version:retention.version}:{}),
    dataClassification:Object.freeze(Array.isArray(dataClassifications)?dataClassifications.slice(0,32):[]),
    residency:Object.freeze({...dataPlanePolicy(env,normalizedCountry),code:residency?.code||null,mode:residency?.mode||'unresolved',primaryRegion:residency?.primary_region||null,primaryProvider:residency?.primary_provider||null,fallbackAllowed:Boolean(Number(residency?.fallback_allowed||0))}),
    actionPolicy:Object.freeze(actionPolicy),
    status:complianceStatus,
    authority:'canonical_compliance_context'
  });
}

export async function classifyData(env,tableName,columnName){
  const row=await canonicalFirst(env,`SELECT classification,purpose_code,retention_policy_code,export_allowed,audit_required,jurisdiction_policy_code FROM data_classification_registry WHERE table_name=? AND column_name=? AND active=1 LIMIT 1`,[String(tableName),String(columnName)],'canonical_data_classification_registry');
  return row||{classification:'INTERNAL',purpose_code:'mission_execution',retention_policy_code:null,export_allowed:0,audit_required:0,jurisdiction_policy_code:null};
}
