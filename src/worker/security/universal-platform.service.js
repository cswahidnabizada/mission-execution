import {authorityUnavailable,canonicalFirst} from "../core/canonical-db.js";
const INTENTS=new Set(["mission_execution","business_management","digital_daftar","logistics_operations","market_intelligence","explore_platform"]);
const ACCOUNT_TYPES=new Set(["individual","business","organization","service_provider"]);
const SECURITY_INVARIANTS=Object.freeze({tenantIsolation:true,serverSideAuthorization:true,failClosed:true,audit:"append_only",configurationVersionPinnedToMission:true,lowerScopesCannotRelaxHigherScopeRestrictions:true});
const isObject=value=>value!==null&&typeof value==="object"&&!Array.isArray(value);
function mergeConfiguration(base,overlay){
 const result={...base};
 for(const [key,value] of Object.entries(overlay||{})){
  if(isObject(value)&&isObject(result[key]))result[key]=mergeConfiguration(result[key],value);
  else result[key]=value;
 }
 return result;
}
function enforceSecurityInvariants(configuration){
 const security=isObject(configuration.security)?configuration.security:{};
 for(const [key,value] of Object.entries(SECURITY_INVARIANTS)){
  if(key in security&&security[key]!==value)throw authorityUnavailable("universal_platform_security_invariant");
  security[key]=value;
 }
 configuration.security=security;
 return configuration;
}
async function readPublishedRelease(env,scopeType,scopeKey){
 try{return await canonicalFirst(env,`SELECT release_id,scope_type,scope_key,version,configuration_json,published_at FROM platform_configuration_releases WHERE scope_type=? AND scope_key=? AND lifecycle_status='published' ORDER BY published_at DESC LIMIT 1`,[scopeType,scopeKey],"universal_platform_configuration");}
 catch(error){throw error;}
}
function parseRelease(row){
 let configuration;try{configuration=JSON.parse(row.configuration_json);}catch(error){throw authorityUnavailable("universal_platform_configuration_json",error);}
 if(!isObject(configuration)||configuration.schema!=="onmission.platform-package.v1")throw authorityUnavailable("universal_platform_configuration_contract");
 return {releaseId:row.release_id,scopeType:row.scope_type,scopeKey:row.scope_key,version:row.version,publishedAt:row.published_at,configuration};
}
export async function getUniversalPlatformPackage(env){
 const row=await readPublishedRelease(env,"global","default");
 if(!row)throw authorityUnavailable("universal_platform_configuration");
 const release=parseRelease(row);
 if(!Array.isArray(release.configuration.configurationHierarchy)||!Array.isArray(release.configuration.missionJourney))throw authorityUnavailable("universal_platform_configuration_contract");
 return {releaseId:release.releaseId,version:release.version,publishedAt:release.publishedAt,configuration:release.configuration};
}
/** Resolve the published package chain. Context values select configuration only; they never establish identity or authorization. */
export async function resolveEffectivePlatformConfiguration(env,context={}){
 const country=String(context.countryCode||"").trim().toUpperCase();
 const sector=String(context.sectorCode||"").trim().toLowerCase();
 const product=String(context.productCode||"").trim().toLowerCase();
 const tenant=String(context.tenantScopeKey||"").trim();
 if(country&&!/^[A-Z]{2}$/.test(country))throw Object.assign(new Error("Country must be a two-letter ISO code."),{status:400});
 if(sector&&!/^[a-z][a-z0-9_-]{1,39}$/.test(sector))throw Object.assign(new Error("Sector code is invalid."),{status:400});
 if(product&&!/^[a-z][a-z0-9_-]{1,79}$/.test(product))throw Object.assign(new Error("Product code is invalid."),{status:400});
 if(tenant&&!/^[A-Za-z0-9:_-]{3,160}$/.test(tenant))throw Object.assign(new Error("Tenant configuration scope is invalid."),{status:400});
 const scopes=[{type:"global",key:"default"}];
 if(country)scopes.push({type:"country",key:country});
 if(country&&sector)scopes.push({type:"sector",key:`${country}:${sector}`});
 if(country&&sector&&product)scopes.push({type:"product",key:`${country}:${sector}:${product}`});
 if(tenant)scopes.push({type:"tenant",key:tenant});
 const releases=[];
 for(const scope of scopes){const row=await readPublishedRelease(env,scope.type,scope.key);if(row)releases.push(parseRelease(row));else if(scope.type==="global")throw authorityUnavailable("universal_platform_configuration");}
 let configuration={};
 for(const release of releases)configuration=mergeConfiguration(configuration,release.configuration);
 configuration=enforceSecurityInvariants(configuration);
 return {configuration,releases:releases.map(({releaseId,scopeType,scopeKey,version,publishedAt})=>({releaseId,scopeType,scopeKey,version,publishedAt})),effectiveVersion:releases.map(r=>`${r.scopeType}:${r.scopeKey}@${r.version}`).join("|"),securityInvariants:SECURITY_INVARIANTS};
}
export async function classifyUniversalOnboarding(env,input={}){
 const intent=String(input.intent||"explore_platform").trim().toLowerCase(),accountType=String(input.accountType||"individual").trim().toLowerCase(),countryCode=String(input.countryCode||"").trim().toUpperCase(),sectorCode=String(input.sectorCode||"general").trim().toLowerCase(),productCode=String(input.productCode||"").trim().toLowerCase();
 if(!INTENTS.has(intent))throw Object.assign(new Error("Choose a supported platform intention."),{status:400});
 if(!ACCOUNT_TYPES.has(accountType))throw Object.assign(new Error("Choose a supported account type."),{status:400});
 if(countryCode&&!/^[A-Z]{2}$/.test(countryCode))throw Object.assign(new Error("Country must be a two-letter ISO code."),{status:400});
 if(!/^[a-z][a-z0-9_-]{1,39}$/.test(sectorCode))throw Object.assign(new Error("Sector code is invalid."),{status:400});
 const resolved=await resolveEffectivePlatformConfiguration(env,{countryCode,sectorCode,productCode});
 const workspace=intent==="digital_daftar"||intent==="business_management"?"business-workspace":intent==="logistics_operations"?"sector-workspace":intent==="market_intelligence"?"market-intelligence":intent==="mission_execution"?"mission-home":"general-workspace";
 let country={code:countryCode||null,selection:countryCode?"interest_only":"not_provided",operationalEligibility:"not_certified"};
 if(countryCode){const row=await canonicalFirst(env,`SELECT code,name,active FROM country_catalog WHERE code=? LIMIT 1`,[countryCode],"country_catalog");country={code:countryCode,name:row?.name||null,selection:row?"known_country":"interest_only",operationalEligibility:"not_certified"};if(row&&Number(row.active)===1){const launch=await canonicalFirst(env,`SELECT 1 AS ok FROM country_product_launches WHERE country_code=? AND status='active' AND active=1 LIMIT 1`,[countryCode],"country_product_launches");if(launch)country.operationalEligibility="launch_record_active_requires_product_policy";}}
 return {package:{releaseId:resolved.releases[0]?.releaseId||null,version:resolved.releases[0]?.version||null,effectiveVersion:resolved.effectiveVersion,scopes:resolved.releases.map(r=>({type:r.scopeType,key:r.scopeKey,version:r.version}))},classification:{intent,accountType,countryCode:countryCode||null,sectorCode,productCode:productCode||null,workspace},country,access:{registration:"intake_open",operational:"verification_and_activation_required",countryExecution:country.operationalEligibility==="launch_record_active_requires_product_policy"?"requires_full_product_eligibility":"interest_only_or_not_certified"},requiredGates:["identity_verification","subscription_activation","activation_code","capability_eligibility"],notice:"Classification and configuration resolution are routing inputs only. They do not grant identity verification, subscription entitlement, tenant access, country eligibility or mission authorization."};
}
