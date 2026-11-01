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
  return json({success:true,status:countries.length?'start':'under_development',countries,market:germanyLive?{key:'DE-logistics',countryCode:'DE',sectorCode:'logistics',name:'Germany Logistics',onboardingUrl:'/register.html?market=DE-logistics&country=DE&sector=logistics',releaseVersion:liveVersion.version}:null,message:countries.length?'Choose a launched country to start.':'ON Mission is preparing its first country launch. Country access will appear here only after Super Admin completes and activates the country product.'});
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
