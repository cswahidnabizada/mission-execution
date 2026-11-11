import { json, readJson } from '../../core/http.js';
import { requirePlatformAdministrator } from '../../security/platform-administrator.js';
import { requirePlatformSuperAdminStepUp } from '../../security/platform-super-administrator.js';
import { auditAdminControl } from '../../security/admin-control-audit.service.js';

const SECTORS=new Set(['general','trade','retail','logistics','fx','labor']);
const STATUSES=new Set(['draft','pilot','active','suspended','retired']);

export function registerDaftarAdminRoutes(router) {
  router.get('/api/platform/admin/daftar/markets',async({request,env})=>{
    try {
      await requirePlatformAdministrator(request,env);
      const rows=await env.DB.prepare(`SELECT mp.id,mp.country_code,cc.name AS country_name,mp.sector_code,mp.status,mp.template_version,mp.telemetry_enabled,mp.minimum_cohort_size,mp.created_at,mp.updated_at,EXISTS(SELECT 1 FROM country_product_launches l WHERE l.country_code=mp.country_code AND l.status='active' AND l.active=1) AS product_market_active FROM daftar_market_profiles mp JOIN country_catalog cc ON cc.code=mp.country_code ORDER BY cc.name,mp.sector_code`).all();
      return json({success:true,markets:rows.results||[]});
    } catch(error) {return fail(error);}
  });

  router.post('/api/platform/admin/daftar/markets',async({request,env,requestId})=>{
    try {
      const actor=await requirePlatformSuperAdminStepUp(request,env);
      const body=await readJson(request,8192);
      const countryCode=String(body.countryCode||'').trim().toUpperCase();
      const sectorCode=String(body.sectorCode||'').trim().toLowerCase();
      const templateVersion=String(body.templateVersion||'1.0.0').trim();
      if(!/^[A-Z]{2}$/.test(countryCode)||!SECTORS.has(sectorCode)||templateVersion!=='1.0.0')throw bad('DAFTAR_MARKET_PROFILE_INVALID',400);
      const country=await env.DB.prepare(`SELECT code FROM country_catalog WHERE code=? AND active=1 LIMIT 1`).bind(countryCode).first();
      if(!country)throw bad('COUNTRY_NOT_ACTIVE',404);
      const result=await env.DB.prepare(`INSERT INTO daftar_market_profiles(country_code,sector_code,status,template_version,telemetry_enabled,minimum_cohort_size) VALUES(?,?,'draft',?,0,5)`).bind(countryCode,sectorCode,templateVersion).run();
      await auditAdminControl(env,{actor,action:'platform.daftar.market_profile.created',resourceType:'daftar_market_profile',resourceId:Number(result.meta.last_row_id),requestId,metadata:{countryCode,sectorCode,templateVersion}});
      return json({success:true,id:Number(result.meta.last_row_id),countryCode,sectorCode,status:'draft'},201);
    } catch(error) {return fail(error);}
  });

  router.get('/api/platform/admin/daftar/fx-quotes',async({request,env,url})=>{
    try {await requirePlatformAdministrator(request,env);const country=String(url.searchParams.get('country')||'AF').toUpperCase();const rows=await env.DB.prepare(`SELECT id,country_code,base_currency,quote_currency,rate_numerator,rate_denominator,source_code,source_reference,observed_at,valid_until,status,created_at FROM daftar_fx_quotes WHERE country_code=? ORDER BY observed_at DESC LIMIT 200`).bind(country).all();return json({success:true,quotes:rows.results||[]});}catch(error){return fail(error);}
  });
  router.post('/api/platform/admin/daftar/fx-quotes',async({request,env,requestId})=>{
    try {const actor=await requirePlatformSuperAdminStepUp(request,env);const body=await readJson(request,8192);const countryCode=String(body.countryCode||'AF').toUpperCase();const base=String(body.baseCurrency||'').toUpperCase();const quote=String(body.quoteCurrency||'').toUpperCase();const numerator=Number(body.rateNumerator),denominator=Number(body.rateDenominator);const source=String(body.sourceCode||'').trim();const reference=String(body.sourceReference||'').trim()||null;const observed=Date.parse(String(body.observedAt||''));const valid=Date.parse(String(body.validUntil||''));if(!/^[A-Z]{2}$/.test(countryCode)||!['AFN','USD','EUR'].includes(base)||!['AFN','USD','EUR'].includes(quote)||base===quote||!Number.isSafeInteger(numerator)||!Number.isSafeInteger(denominator)||numerator<=0||denominator<=0||numerator>1e12||denominator>1e12||!source||source.length>80||!reference||reference.length<8||reference.length>300||!Number.isFinite(observed)||observed<Date.now()-86400000||observed>Date.now()+300000||!Number.isFinite(valid)||valid<=Date.now()||valid>Date.now()+86400000)throw bad('DAFTAR_FX_QUOTE_INVALID',400);const country=await env.DB.prepare(`SELECT code FROM country_catalog WHERE code=? AND active=1 LIMIT 1`).bind(countryCode).first();if(!country)throw bad('COUNTRY_NOT_ACTIVE',404);const id=crypto.randomUUID();await env.DB.prepare(`INSERT INTO daftar_fx_quotes(id,country_code,base_currency,quote_currency,rate_numerator,rate_denominator,source_code,source_reference,observed_at,valid_until,status) VALUES(?,?,?,?,?,?,?,?,?,?,'proposed')`).bind(id,countryCode,base,quote,numerator,denominator,source,reference,new Date(observed).toISOString(),new Date(valid).toISOString()).run();await auditAdminControl(env,{actor,action:'platform.daftar.fx_quote.proposed',resourceType:'daftar_fx_quote',resourceId:id,requestId,metadata:{countryCode,baseCurrency:base,quoteCurrency:quote,sourceCode:source}});return json({success:true,id,status:'proposed'},201);}catch(error){return fail(error);}
  });
  router.post(/^\/api\/platform\/admin\/daftar\/fx-quotes\/(?<quoteId>[A-Fa-f0-9-]{36})\/approve$/,async({request,env,params,requestId})=>{
    try {const actor=await requirePlatformSuperAdminStepUp(request,env);const body=await readJson(request,4096);if(body.confirmSourceReviewed!==true)throw bad('DAFTAR_FX_SOURCE_REVIEW_REQUIRED',422);const quote=await env.DB.prepare(`SELECT id,country_code,base_currency,quote_currency,valid_until,status FROM daftar_fx_quotes WHERE id=? LIMIT 1`).bind(params.quoteId).first();if(!quote)throw bad('DAFTAR_FX_QUOTE_NOT_FOUND',404);if(quote.status!=='proposed'||Date.parse(quote.valid_until)<=Date.now())throw bad('DAFTAR_FX_QUOTE_NOT_APPROVABLE',409);await env.DB.prepare(`UPDATE daftar_fx_quotes SET status='approved' WHERE id=? AND status='proposed'`).bind(params.quoteId).run();await auditAdminControl(env,{actor,action:'platform.daftar.fx_quote.approved',resourceType:'daftar_fx_quote',resourceId:params.quoteId,requestId,metadata:{countryCode:quote.country_code,baseCurrency:quote.base_currency,quoteCurrency:quote.quote_currency}});return json({success:true,id:params.quoteId,status:'approved'});}catch(error){return fail(error);}
  });

  router.get('/api/platform/admin/daftar/unit-conversions',async({request,env,url})=>{
    try {await requirePlatformAdministrator(request,env);const country=String(url.searchParams.get('country')||'AF').toUpperCase();const rows=await env.DB.prepare(`SELECT id,country_code,region_code,unit_code,base_unit_code,multiplier_numerator,multiplier_denominator,status,source_reference,version,approved_by_identity_id,approved_at FROM daftar_unit_conversions WHERE country_code=? ORDER BY region_code,unit_code,id DESC`).bind(country).all();return json({success:true,conversions:rows.results||[]});}catch(error){return fail(error);}
  });
  router.post(/^\/api\/platform\/admin\/daftar\/unit-conversions\/(?<conversionId>\d+)\/approve$/,async({request,env,params,requestId})=>{
    try {const actor=await requirePlatformSuperAdminStepUp(request,env);const id=Number(params.conversionId);const row=await env.DB.prepare(`SELECT * FROM daftar_unit_conversions WHERE id=? LIMIT 1`).bind(id).first();if(!row)throw bad('DAFTAR_UNIT_CONVERSION_NOT_FOUND',404);if(row.status!=='proposed')throw bad('DAFTAR_UNIT_CONVERSION_NOT_PROPOSED',409);const body=await readJson(request,4096);const verifiedSource=String(body.verifiedSourceReference||'').trim();if(body.confirmLocalMetrology!==true||verifiedSource.length<8||verifiedSource.length>300)throw bad('DAFTAR_LOCAL_METROLOGY_CONFIRMATION_REQUIRED',422);await env.DB.prepare(`UPDATE daftar_unit_conversions SET status='approved',source_reference=?,approved_by_identity_id=?,approved_at=CURRENT_TIMESTAMP WHERE id=? AND status='proposed'`).bind(verifiedSource,Number(actor.id||actor.identityId||0)||null,id).run();await auditAdminControl(env,{actor,action:'platform.daftar.unit_conversion.approved',resourceType:'daftar_unit_conversion',resourceId:id,requestId,metadata:{countryCode:row.country_code,regionCode:row.region_code,unitCode:row.unit_code,sourceReference:row.source_reference}});return json({success:true,id,status:'approved',countryCode:row.country_code,regionCode:row.region_code,unitCode:row.unit_code});}catch(error){return fail(error);}
  });

  router.patch(/^\/api\/platform\/admin\/daftar\/markets\/(?<profileId>\d+)$/,async({request,env,params,requestId})=>{
    try {
      const actor=await requirePlatformSuperAdminStepUp(request,env);
      const id=Number(params.profileId);
      const current=await env.DB.prepare(`SELECT * FROM daftar_market_profiles WHERE id=? LIMIT 1`).bind(id).first();
      if(!current)throw bad('DAFTAR_MARKET_PROFILE_NOT_FOUND',404);
      if(current.status==='retired')throw bad('DAFTAR_MARKET_PROFILE_RETIRED',409);
      const body=await readJson(request,8192);
      const status=body.status===undefined?current.status:String(body.status).toLowerCase();const templateVersion=body.templateVersion===undefined?current.template_version:String(body.templateVersion).trim();if(templateVersion!=='1.0.0')throw bad('DAFTAR_TEMPLATE_VERSION_UNAVAILABLE',409);
      const telemetry=body.telemetryEnabled===undefined?Number(current.telemetry_enabled)===1:body.telemetryEnabled===true;
      const cohort=body.minimumCohortSize===undefined?Number(current.minimum_cohort_size):Number(body.minimumCohortSize);
      if(!STATUSES.has(status)||!Number.isInteger(cohort)||cohort<5||cohort>1000)throw bad('DAFTAR_MARKET_PROFILE_INVALID',400);
      if(['pilot','active'].includes(status)){
        const launch=await env.DB.prepare(`SELECT id FROM country_product_launches WHERE country_code=? AND status='active' AND active=1 LIMIT 1`).bind(current.country_code).first();
        if(!launch)throw bad('DAFTAR_COUNTRY_PRODUCT_NOT_ACTIVE',409);
      }
      if(telemetry&&cohort<5)throw bad('DAFTAR_TELEMETRY_COHORT_TOO_SMALL',400);
      await env.DB.prepare(`UPDATE daftar_market_profiles SET status=?,template_version=?,telemetry_enabled=?,minimum_cohort_size=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(status,templateVersion,telemetry?1:0,cohort,id).run();
      await auditAdminControl(env,{actor,action:'platform.daftar.market_profile.updated',resourceType:'daftar_market_profile',resourceId:id,requestId,metadata:{countryCode:current.country_code,sectorCode:current.sector_code,status,telemetryEnabled:telemetry,minimumCohortSize:cohort}});
      return json({success:true,id,countryCode:current.country_code,sectorCode:current.sector_code,status,telemetryEnabled:telemetry,minimumCohortSize:cohort});
    } catch(error) {return fail(error);}
  });
}

function bad(code,status){const e=new Error(code);e.code=code;e.status=status;return e;}
function fail(error){const status=Number(error?.status)||500;const code=String(error?.code||error?.message||'DAFTAR_ADMIN_FAILED');return json({success:false,error:status>=500?'Daftar market control is unavailable.':code.replaceAll('_',' ').toLowerCase(),code},status);}
