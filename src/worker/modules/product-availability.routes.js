import {json,publicErrorMessage} from '../core/http.js';
import {publicLaunchCountries} from '../security/country-product-launch.service.js';
import {getMarketPackage} from '../security/market-factory.service.js';

export function registerProductAvailabilityRoutes(router){
 router.get('/api/product/availability',async({env})=>{try{
  const launchedCountries=await publicLaunchCountries(env);
  const marketPackage=await getMarketPackage(env,{packageKey:'on-mission:DE'}).catch(()=>null);
  const liveVersion=marketPackage?.versions?.find(v=>Number(v.id)===Number(marketPackage.active_version_id)&&String(v.status).toUpperCase()==='LIVE');
  const germanyLive=Boolean(marketPackage&&String(marketPackage.status).toUpperCase()==='LIVE'&&String(marketPackage.onboarding_mode).toUpperCase()==='OPEN'&&liveVersion&&launchedCountries.some(c=>String(c.code).toUpperCase()==='DE'));
  const countries=launchedCountries.filter(c=>String(c.code).toUpperCase()!=='DE'||germanyLive);
  const latestVersion=marketPackage?.versions?.[0]||null;
  const daftarProfiles=await env.DB.prepare(`SELECT mp.country_code,cc.name country_name,mp.sector_code,mp.status,mp.template_version,mp.telemetry_enabled,mp.minimum_cohort_size,EXISTS(SELECT 1 FROM country_product_launches l WHERE l.country_code=mp.country_code AND l.status='active' AND l.active=1) AS product_active FROM daftar_market_profiles mp JOIN country_catalog cc ON cc.code=mp.country_code WHERE mp.country_code='AF' ORDER BY mp.sector_code`).all();
  const marketDiscovery=[...(marketPackage?[{countryCode:'DE',name:'Germany',availability:germanyLive?'live':'preparation',productActive:germanyLive,availableForOnboarding:germanyLive,sectorCode:'logistics',marketStatus:String(marketPackage.status||'DRAFT').toUpperCase(),releaseStatus:String(latestVersion?.status||'DRAFT').toUpperCase(),onboardingMode:String(marketPackage.onboarding_mode||'CLOSED').toUpperCase()}]:[]),...((daftarProfiles.results||[]).length?[{countryCode:'AF',name:'Afghanistan',availability:(daftarProfiles.results||[]).some(x=>Number(x.product_active)===1)?'pilot':'preparation',productActive:(daftarProfiles.results||[]).some(x=>Number(x.product_active)===1),sectors:(daftarProfiles.results||[]).map(x=>({code:x.sector_code,status:x.status,templateVersion:x.template_version,telemetryEnabled:Number(x.telemetry_enabled)===1,minimumCohortSize:Number(x.minimum_cohort_size)}))}]:[]),...countries.filter(c=>!['DE','AF'].includes(String(c.code).toUpperCase())).map(c=>({countryCode:c.code,name:c.name,availability:'live',productActive:true}))];
  const uniqueMarkets=[...new Map(marketDiscovery.map(m=>[m.countryCode,m])).values()];
  const marketPreview=marketPackage?{key:'DE-logistics',countryCode:'DE',sectorCode:'logistics',name:'Germany Logistics',marketStatus:String(marketPackage.status||'DRAFT').toUpperCase(),releaseStatus:String(latestVersion?.status||'DRAFT').toUpperCase(),releaseVersion:latestVersion?.version||null,onboardingMode:String(marketPackage.onboarding_mode||'CLOSED').toUpperCase(),languages:(latestVersion?.package_json?.languages||[]).map(x=>x.code).filter(Boolean),availableForOnboarding:germanyLive}:null;
  return json({success:true,status:countries.length?'start':'under_development',countries,marketDiscovery:uniqueMarkets,market:germanyLive?{...marketPreview,onboardingUrl:'/register.html?market=DE-logistics&country=DE&sector=logistics'}:null,marketPreview,message:germanyLive?'Germany Logistics onboarding is open.':'Germany Logistics market preparation is visible, but customer onboarding remains closed until the active release and launch policy permit access.'});
 }catch(e){return json({success:false,error:publicErrorMessage(e,'Product availability unavailable')},500);}});
 router.get('/api/product/market-content',async({env,url})=>{try{
  const countryCode=String(url.searchParams.get('countryCode')||'DE').toUpperCase();
  const languageCode=String(url.searchParams.get('languageCode')||'de').toLowerCase();
  const code=String(url.searchParams.get('code')||'').toLowerCase();
  const market=await getMarketPackage(env,{packageKey:`on-mission:${countryCode}`});
  if(!market||String(market.status).toUpperCase()!=='LIVE'||!market.active_version_id)return json({success:false,error:'MARKET_CONTENT_NOT_PUBLISHED'},404);
  const version=(market.versions||[]).find(v=>Number(v.id)===Number(market.active_version_id)&&String(v.status).toUpperCase()==='LIVE');
  if(!version)return json({success:false,error:'MARKET_CONTENT_NOT_PUBLISHED'},404);
  const pkg=version.package_json||{};
  const content=(pkg.content||[]).filter(x=>String(x.code||'').toLowerCase()===code&&String(x.languageCode||'de').toLowerCase()===languageCode);
  if(!content.length)return json({success:false,error:'MARKET_CONTENT_NOT_FOUND'},404);
  return json({success:true,market:{key:market.package_key,countryCode,releaseVersion:version.version},content:content[0]});
 }catch(e){return json({success:false,error:publicErrorMessage(e,'Market content unavailable')},500);}});
}
