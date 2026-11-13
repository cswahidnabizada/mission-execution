import assert from "node:assert/strict";
import {resolveEffectivePlatformConfiguration,classifyUniversalOnboarding} from "../../src/worker/security/universal-platform.service.js";
import {registerUniversalPlatformRoutes} from "../../src/worker/modules/onboarding/universal-platform.routes.js";
const base={schema:"onmission.platform-package.v1",name:"Default",configurationHierarchy:["global","country","sector","product","tenant","mission"],missionJourney:["OBSERVE","EXECUTE"],security:{tenantIsolation:true,serverSideAuthorization:true,failClosed:true,audit:"append_only",configurationVersionPinnedToMission:true,lowerScopesCannotRelaxHigherScopeRestrictions:true},experience:{language:"en",theme:"default"}};
const country={...base,name:"DE overlay",experience:{language:"de",currency:"EUR"}};
function mockEnv(overlays={}){
 const rows={"global:default":{release_id:"global:v1",scope_type:"global",scope_key:"default",version:"1.0.0",configuration_json:JSON.stringify(base),published_at:"2026-01-01"},...Object.fromEntries(Object.entries(overlays).map(([key,value])=>[key,{release_id:`${key}:v1`,scope_type:key.split(":")[0],scope_key:key.split(":").slice(1).join(":"),version:"1.0.0",configuration_json:JSON.stringify(value),published_at:"2026-01-02"}]))};
 return {DB:{prepare(sql){return {bind(...args){return {async first(){if(sql.includes("platform_configuration_releases"))return rows[`${args[0]}:${args[1]}`]||null;if(sql.includes("FROM country_catalog"))return args[0]==="DE"?{code:"DE",name:"Germany",active:1}:null;if(sql.includes("FROM country_product_launches"))return null;throw new Error(`Unexpected SQL: ${sql}`);}};}};}}};
}
const env=mockEnv({"country:DE":country,"sector:DE:logistics":{schema:"onmission.platform-package.v1",workflows:{dispatch:true}}});
const resolved=await resolveEffectivePlatformConfiguration(env,{countryCode:"DE",sectorCode:"logistics"});
assert.equal(resolved.configuration.experience.language,"de");assert.equal(resolved.configuration.experience.currency,"EUR");assert.equal(resolved.configuration.workflows.dispatch,true);assert.equal(resolved.configuration.security.tenantIsolation,true);assert.equal(resolved.releases.length,3);
const classified=await classifyUniversalOnboarding(env,{intent:"logistics_operations",accountType:"business",countryCode:"DE",sectorCode:"logistics"});
assert.equal(classified.classification.workspace,"sector-workspace");assert.equal(classified.country.operationalEligibility,"not_certified");assert.match(classified.package.effectiveVersion,/sector:DE:logistics@1.0.0/);
const weakening=mockEnv({"country:DE":{...base,security:{...base.security,tenantIsolation:false}}});
await assert.rejects(()=>resolveEffectivePlatformConfiguration(weakening,{countryCode:"DE"}),e=>e.status===503&&e.code==="AUTHORITY_UNAVAILABLE");
await assert.rejects(()=>resolveEffectivePlatformConfiguration(env,{countryCode:"DE",sectorCode:"../admin"}),e=>e.status===400);
let intakeRow=null;
const intakeEnv={
 DB:{
  prepare(sql){
   return {
    bind(...args){
     return {
      async first(){
       if(sql.includes("platform_configuration_releases"))return {release_id:"global:v1",scope_type:"global",scope_key:"default",version:"1.0.0",configuration_json:JSON.stringify(base),published_at:"2026-01-01"};
       if(sql.includes("FROM platform_onboarding_intakes"))return intakeRow;
       throw new Error(`Unexpected first query: ${sql}`);
      },
      async run(){
       if(sql.includes("INSERT OR IGNORE INTO platform_onboarding_intakes")){
        if(!intakeRow)intakeRow={intake_id:args[0],idempotency_key:args[1],intent_code:args[2],account_type:args[3],country_code:args[4],sector_code:args[5],product_code:args[6],preferred_language:args[7],consent_version:args[8],lifecycle_status:"received",created_at:"2026-01-03"};
        return {success:true};
       }
       throw new Error(`Unexpected run query: ${sql}`);
      }
     };
    }
   };
  }
 }
};
let intakeHandler;registerUniversalPlatformRoutes({get(){},post(path,handler){if(path==="/api/platform/public/intakes")intakeHandler=handler;}});
const submit=body=>intakeHandler({request:new Request("https://example.test/api/platform/public/intakes",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)}),env:intakeEnv});
const payload={intent:"explore_platform",accountType:"individual",sectorCode:"general",preferredLanguage:"en",consentAccepted:true,consentVersion:"ONM-PLATFORM-INTAKE-1",idempotencyKey:"same-key-12345678"};
const first=await submit(payload);assert.equal(first.status,201);const originalId=(await first.json()).intake.id;
const replay=await submit(payload);assert.equal(replay.status,201);assert.equal((await replay.json()).intake.id,originalId);
const conflict=await submit({...payload,intent:"mission_execution"});assert.equal(conflict.status,409);
console.log("16.116 layered resolution, immutable security invariants and intake idempotency: PASS");
