import {json,readJson,publicErrorMessage} from "../../core/http.js";
import {getUniversalPlatformPackage,classifyUniversalOnboarding} from "../../security/universal-platform.service.js";

export function registerUniversalPlatformRoutes(router){
  router.get("/api/platform/public/defaults",async({env})=>{
    try{
      const p=await getUniversalPlatformPackage(env),c=p.configuration;
      return json({success:true,package:{releaseId:p.releaseId,version:p.version,publishedAt:p.publishedAt,name:c.name,principles:c.principles,configurationHierarchy:c.configurationHierarchy,defaultWorkspace:c.defaultWorkspace,onboarding:c.onboarding,capabilityCatalogue:c.capabilityCatalogue,countryAvailability:c.countryAvailability,missionJourney:c.missionJourney}},200,{"Cache-Control":"no-store"});
    }catch(e){return json({success:false,error:publicErrorMessage(e,"Universal platform configuration unavailable")},503,{"Cache-Control":"no-store"});}
  });
  router.post("/api/platform/public/classify-onboarding",async({request,env})=>{
    try{const b=await readJson(request);return json({success:true,result:await classifyUniversalOnboarding(env,b)},200,{"Cache-Control":"no-store"});}
    catch(e){return json({success:false,error:publicErrorMessage(e,"Unable to classify onboarding")},e.status||503,{"Cache-Control":"no-store"});}
  });
  router.post("/api/platform/public/intakes",async({request,env})=>{
    try{
      const b=await readJson(request);
      if(b.consentAccepted!==true||String(b.consentVersion||"")!=="ONM-PLATFORM-INTAKE-1")throw Object.assign(new Error("Please accept the platform intake privacy notice."),{status:422});
      const key=String(b.idempotencyKey||"").trim();
      if(!/^[A-Za-z0-9_-]{16,120}$/.test(key))throw Object.assign(new Error("A valid idempotency key is required."),{status:400});
      const classified=await classifyUniversalOnboarding(env,b),c=classified.classification,intakeId=crypto.randomUUID();
      const productCode=String(b.productCode||"").trim().slice(0,80)||null,preferredLanguage=String(b.preferredLanguage||"en").trim().slice(0,12);
      await env.DB.prepare(`INSERT OR IGNORE INTO platform_onboarding_intakes(intake_id,idempotency_key,intent_code,account_type,country_code,sector_code,product_code,preferred_language,consent_version,lifecycle_status) VALUES(?,?,?,?,?,?,?,?,?,'received')`).bind(intakeId,key,c.intent,c.accountType,c.countryCode,c.sectorCode,productCode,preferredLanguage,"ONM-PLATFORM-INTAKE-1").run();
      const saved=await env.DB.prepare(`SELECT intake_id,intent_code,account_type,country_code,sector_code,product_code,preferred_language,lifecycle_status,created_at FROM platform_onboarding_intakes WHERE idempotency_key=? LIMIT 1`).bind(key).first();
      if(!saved)throw new Error("The onboarding intake could not be confirmed.");
      const samePayload=saved.intent_code===c.intent&&saved.account_type===c.accountType&&(saved.country_code||null)===(c.countryCode||null)&&saved.sector_code===c.sectorCode&&(saved.product_code||null)===productCode&&saved.preferred_language===preferredLanguage;
      if(!samePayload)throw Object.assign(new Error("This idempotency key was already used for a different intake."),{status:409});
      return json({success:true,intake:{id:saved.intake_id,status:saved.lifecycle_status,createdAt:saved.created_at},classification:classified},201,{"Cache-Control":"no-store"});
    }catch(e){return json({success:false,error:publicErrorMessage(e,"Unable to save onboarding intake")},e.status||503,{"Cache-Control":"no-store"});}
  });
}
