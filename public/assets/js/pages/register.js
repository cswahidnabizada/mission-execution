import {attachLayoutStudioRouteAdapter} from '../frontend/admin/layout-studio-production-adapter.js?v=16.98.0';
import {renderComponent, STUDIO_RENDERER_VERSION} from '../frontend/admin/layout-studio-renderer.js?v=16.98.0';
import { api, jsonOptions } from "../core/api.js";
import { saveAccessSession } from "../core/session.js";
const $=s=>document.querySelector(s);
attachLayoutStudioRouteAdapter({root:document.body,routeId:'registration'});
// Shared canonical renderer owns the registration page's visual brand header only.
// Form fields, onboarding requirements, idempotency, identity/session flow and submission remain canonical.
const registrationHeader=document.querySelector('body > header');
if(registrationHeader){
 const headerMarkup=renderComponent({id:'registration-global-header',type:'header',properties:{label:'ON MISSION'}},{mode:'production'});
 registrationHeader.classList.add('registration-canonical-header');
 registrationHeader.innerHTML=headerMarkup+'<div class="registration-heading"><div class="step">ON MISSION // COUNTRY PRODUCT</div><h1 class="impact-text text-3xl font-black">ORGANIZATION REGISTRATION</h1></div>';
 registrationHeader.dataset.rendererVersion=STUDIO_RENDERER_VERSION;
}
const registrationParams=new URLSearchParams(location.search);
const marketKey=registrationParams.get('market')||'';
const requestedSector=registrationParams.get('sector')||'';
if(requestedSector){const sectorSelect=$("#sectorCode");if(sectorSelect){if(![...sectorSelect.options].some(o=>o.value===requestedSector)){const option=document.createElement('option');option.value=requestedSector;option.textContent=requestedSector.replaceAll('_',' ');sectorSelect.append(option);}sectorSelect.value=requestedSector;}}
const uxLabPreview=registrationParams.get('uxlab')==='preview';
if(marketKey==='DE-logistics'){const intro=document.querySelector('#accountCard');if(intro){const banner=document.createElement('div');banner.className='rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-4 mb-4';banner.innerHTML='<div class="text-xs font-black tracking-widest text-emerald-800">GERMANY LOGISTICS MARKET</div><p class="text-sm text-emerald-950 mt-1">Start your German logistics organization onboarding. Company verification and operational activation follow the market rules.</p>';intro.prepend(banner);}}
if(uxLabPreview){const banner=document.createElement('div');banner.style.cssText='position:sticky;top:0;z-index:50;padding:12px 16px;background:#fff7ed;border-bottom:1px solid #f59e0b;color:#7c2d12;font:800 12px system-ui;letter-spacing:.04em;text-align:center';banner.textContent='SUPER ADMIN USER EXPERIENCE LAB · REGISTRATION PREVIEW · SUBMISSION DISABLED';document.body.prepend(banner);}

const COUNTRY_CATALOG_ENDPOINT="/api/countries";
let marketReleaseVersion=null;
function updateMarketLegalAcceptance(){const box=$("#marketLegalAcceptance"),check=$("#termsAccepted");if(!box||!check)return;const required=Boolean(marketReleaseVersion&&$("#countryCode")?.value==="DE"&&$("#sectorCode")?.value==="logistics");box.hidden=!required;check.required=required;if(!required)check.checked=false;}
async function showAvailability(){try{const d=await api("/api/product/availability");marketReleaseVersion=d.market?.releaseVersion||null;updateMarketLegalAcceptance();const el=$("#availabilityState");const form=$("#registerForm");if(d.status!=="start"){document.body.innerHTML=`<main style="max-width:760px;margin:12vh auto;padding:24px"><section class="auth-card"><div class="step">ON MISSION · COUNTRY PRODUCT</div><h1 class="impact-text text-4xl font-black mt-2">PUBLIC REGISTRATION IS CLOSED.</h1><p class="text-slate-500 mt-3">${d.message||"No country product is currently activated. Super Admin must activate a country before organizations can register."}</p><div class="flex gap-2 flex-wrap mt-5"><a class="border-2 border-slate-950 bg-slate-950 text-white px-4 py-3 rounded-xl text-xs font-black" href="/status.html">VIEW STATUS</a><a class="border-2 border-slate-950 bg-white px-4 py-3 rounded-xl text-xs font-black" href="/">HOME</a></div></section></main>`;return;}el.innerHTML=`<strong>START</strong><br><span class="text-slate-500">Choose one of the launched countries below to begin.</span>`;}catch{}}
if(!uxLabPreview)showAvailability();
const idempotencyKey=()=>crypto.randomUUID();
async function refreshRequirements(){
 const country=$("#countryCode").value;if(!country)return;
 try{const q=new URLSearchParams({countryCode:country,organizationType:$("#organizationType").value,sectorCode:$("#sectorCode").value||"general",purposeCode:$("#purposeCode").value||"operational_communications"});const d=await api(`/api/organizations/onboarding/requirements?${q}`);
  const sectors=d.requirements?.sector?[d.requirements.sector]:[];
  if(sectors.length){const sector=sectors[0];const code=sector.sector_code||'general';const select=$("#sectorCode");if(![...select.options].some(o=>o.value===code)){const option=document.createElement('option');option.value=code;option.textContent=sector.name||code;select.append(option);}select.value=requestedSector||code;}
  const fields=new Set(d.requirements?.requiredFields||[]);
  ["registrationNumber","registeredAddressLine1","registeredPostalCode","registeredCity"].forEach(id=>{const el=$("#"+id);if(!el)return;el.required=fields.has(id);el.placeholder=fields.has(id)?el.placeholder.replace("(if required by country)","")+" *":el.placeholder.replace(" *","");});
 }catch(e){setFeedback("#registerFeedback",e.message,"red");}
}
$("#countryCode").addEventListener("change",()=>{refreshRequirements();updateMarketLegalAcceptance();});
$("#countryCode").addEventListener("country-picker-change",()=>{refreshRequirements();updateMarketLegalAcceptance();});
$("#sectorCode").addEventListener("change",updateMarketLegalAcceptance);
$("#organizationType").addEventListener("change",refreshRequirements);
$("#registerForm").onsubmit=async event=>{event.preventDefault();if($("#newPassword").value!==$("#confirmPassword").value)return setFeedback("#registerFeedback","Passwords do not match.","red");
 if(uxLabPreview){setFeedback("#registerFeedback","Preview mode is read-only. No organization will be created.","red");return;}
 const button=$("#registerForm button");button.disabled=true;setFeedback("#registerFeedback","Creating your organization and preparing onboarding…","");
 try{const data=await api("/api/organizations/onboarding",jsonOptions("POST",{idempotencyKey:idempotencyKey(),countryCode:$("#countryCode").value,companyName:$("#companyName").value.trim(),organizationType:$("#organizationType").value,sectorCode:$("#sectorCode").value,purposeCode:$("#purposeCode").value,termsAccepted:$("#termsAccepted")?.checked===true,termsVersion:marketReleaseVersion,privacyNoticeVersion:marketReleaseVersion,registrationNumber:$("#registrationNumber").value.trim(),registeredAddressLine1:$("#registeredAddressLine1").value.trim(),registeredPostalCode:$("#registeredPostalCode").value.trim(),registeredCity:$("#registeredCity").value.trim(),adminName:$("#adminName").value.trim(),email:$("#email").value.trim(),password:$("#newPassword").value}));
   // Canonical onboarding has created the owner session only after the organization is durably provisioned.
   const session=await api("/api/auth/login",jsonOptions("POST",{login:$("#email").value.trim(),password:$("#newPassword").value}));saveAccessSession(session);location.href="/app#account?activation=1";
 }catch(error){setFeedback("#registerFeedback",error.message,"red");}finally{button.disabled=false;}};
function setFeedback(selector,text,color){const el=$(selector);el.textContent=text;el.className=`text-xs font-bold ${color?`text-${color}-600`:""}`;}
