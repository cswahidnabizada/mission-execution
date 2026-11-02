import {attachLayoutStudioRouteAdapter} from '../admin/layout-studio-production-adapter.js?v=16.89.0';
import {renderPage} from '../admin/layout-studio-renderer.js?v=16.89.0';
import {api,esc} from '../core/api.js';
const root=document.getElementById('root');
attachLayoutStudioRouteAdapter({root,routeId:'public-homepage'});
const shell=content=>`<div class="public-experience"><div class="public-main">${content}</div></div>`;
const baseTokens={'color.primary':'#2357d9','color.surface':'#ffffff','color.text':'#172033','color.muted':'#65718a','radius.card':'12px'};
function page(components,ids='public-homepage'){
 const composition={id:ids,title:'Public homepage',kind:'public-homepage',componentIds:components.map(c=>c.id)};
 return renderPage(composition,components,{mode:'production',rendererVersion:'16.10.54'});
}
function header(){return {id:'global-header',type:'header',tokenRefs:['color.text','color.surface'],properties:{label:'ON MISSION'},required:true}}
function footer(label='Governed mission execution · Verified outcomes'){return {id:'global-footer',type:'footer',tokenRefs:['color.muted'],properties:{label},required:true}}
function card(id,label,title,description){return {id,type:'card',tokenRefs:['color.surface','radius.card'],properties:{label,title,description},required:false}}
function unavailable(message,session){
 const components=[header(),{id:'availability-closed',type:'status-panel',tokenRefs:['color.text','color.surface'],properties:{label:'COUNTRY PRODUCT',state:'PUBLIC ACCESS CLOSED',description:'Mission Execution is not open for public access yet. '+String(message||'No country product is currently activated.')},required:true},{id:'status-action',type:'button',tokenRefs:['color.primary'],properties:{label:'VIEW STATUS',href:'/status.html'},required:true},footer('Availability and market launch are governed by the active product release.')];
 root.innerHTML=shell(page(components,'public-homepage-closed'));
 if(session){const actions=document.createElement('div');actions.className='onm-toolbar onm-space-top';actions.innerHTML='<button class="onm-btn" id="landingLogout">SIGN OUT CURRENT SESSION</button>';root.querySelector('.ls-renderer-page')?.append(actions);document.querySelector('#landingLogout')?.addEventListener('click',async()=>{const b=document.querySelector('#landingLogout');b.disabled=true;try{await api('/api/auth/logout',{method:'POST'});location.reload()}catch(e){b.disabled=false;b.textContent=e.message||'SIGN OUT FAILED'}})}
}
async function boot(){
 let availability;
 try{availability=await api('/api/product/availability')}
 catch(e){
  const components=[header(),{id:'availability-error',type:'status-panel',tokenRefs:['color.text','color.surface'],properties:{label:'PRODUCT AVAILABILITY',state:'TEMPORARILY UNAVAILABLE',description:e.message||'The product availability authority could not be reached.'},required:true},{id:'retry-availability',type:'button',tokenRefs:['color.primary'],properties:{label:'RETRY',href:'/status.html'},required:true},footer()];
  root.innerHTML=shell(page(components,'public-homepage-error'));
  const retry=document.createElement('button');retry.className='ls-render-button';retry.textContent='Retry';retry.addEventListener('click',()=>location.reload());root.querySelector('[data-component-id="retry-availability"]')?.replaceChildren(retry);return;
 }
 let session=null;try{session=(await api('/api/auth/session?optional=1')).session}catch{}
 if(session&&availability.status==='start'){location.replace('/app/');return}
 if(availability.status!=='start'&&availability.marketPreview){
  const market=availability.marketPreview;
  const components=[header(),{id:'germany-market-hero',type:'hero',tokenRefs:['color.primary','color.text'],properties:{eyebrow:'ON MISSION · DEUTSCHLAND',title:'Germany Logistics',description:'Eine Plattform für gesteuerte Logistikmissionen: planen, zuweisen, ausführen, nachweisen und sicher abschließen. / One governed workspace to plan, assign, execute, prove and complete logistics missions.',cta:'CUSTOMER ONBOARDING NOT YET OPEN',href:'/status.html'},required:true},
   {id:'germany-market-state',type:'status-panel',tokenRefs:['color.text','color.surface'],properties:{label:'GERMANY LOGISTICS MARKET',state:market.marketStatus+' · '+market.releaseStatus,description:'The Germany Logistics market is initialized and being prepared by ON Mission. Public registration remains closed until legal, security, residency, product and release checks are approved.'},required:true},
   card('germany-organizations','ORGANIZATIONS','Organization workspace','Company setup, verified access and governed team administration.'),card('germany-execution','MISSION EXECUTION','One mission truth','Plan, assign, execute, verify and recover logistics work with accountable ownership and evidence.'),
   {id:'germany-sign-in',type:'button',tokenRefs:['color.primary'],properties:{label:session?'OPEN YOUR WORKSPACE':'SIGN IN',href:session?'/app/':'/login.html'},required:true},
   footer('Germany Logistics · Controlled market preparation')];
  root.innerHTML=shell(page(components,'germany-logistics-market-preview'));return;
 }
 if(availability.status!=='start'){unavailable(availability.message,session);return}
 if(session){location.replace('/app/');return}
 const components=[header(),
  {id:'hero-main',type:'hero',tokenRefs:['color.primary','color.text'],properties:{eyebrow:availability.market?'GERMANY LOGISTICS MARKET':'MISSION EXECUTION',title:availability.market?'Start your Germany logistics onboarding.':'One governed workspace for operational missions.',description:availability.market?'Register your logistics organization in Germany, configure your team and begin managing missions through one governed operating platform.':'Create, assign, execute, prove and complete work around one mission truth—with responsibility, custody, action and evidence kept together.',cta:'START ORGANIZATION ONBOARDING',href:availability.market?'/register.html?market=DE-logistics&country=DE&sector=logistics':'/register.html'},required:true},
  {id:'executor-entry',type:'button',tokenRefs:['color.primary'],properties:{label:'FOR EXECUTORS',href:'/driver/'},required:true},
  card('organizations','ORGANIZATIONS','Run governed work','Build organization context, people and mission flow.'),
  card('executors','EXECUTORS','Act on the next valid action','Receive only the responsibility and evidence needed to execute.'),
  card('participants','PARTICIPANTS','Stay in controlled context','Participate without inheriting unauthorized responsibility.'),
  {id:'availability-status',type:'status-panel',tokenRefs:['color.text','color.surface'],properties:{label:'PRODUCT AVAILABILITY',state:'AVAILABLE',description:`${availability.countries?.length||0} launched countries. ${availability.message||'Country availability is governed by the active product launch.'}`},required:true},footer()];
 if(availability.market){components.push({id:'market-privacy-link',type:'button',tokenRefs:['color.primary'],properties:{label:'PRIVACY NOTICE',href:'/legal/?code=privacy&lang=de'},required:true},{id:'market-terms-link',type:'button',tokenRefs:['color.primary'],properties:{label:'TERMS & CONDITIONS',href:'/legal/?code=terms&lang=de'},required:true},{id:'market-imprint-link',type:'button',tokenRefs:['color.primary'],properties:{label:'IMPRINT',href:'/legal/?code=imprint&lang=de'},required:true},{id:'market-consent-link',type:'button',tokenRefs:['color.primary'],properties:{label:'CONSENT SETTINGS',href:'/legal/?code=consent&lang=de'},required:true});}
 root.innerHTML=shell(page(components));
}
boot();
