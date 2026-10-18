import {attachLayoutStudioRouteAdapter} from '../admin/layout-studio-production-adapter.js?v=16.10.54';
import {renderPage} from '../admin/layout-studio-renderer.js?v=16.10.54';
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
 if(availability.status!=='start'){unavailable(availability.message,session);return}
 if(session){location.replace('/app/');return}
 const components=[header(),
  {id:'hero-main',type:'hero',tokenRefs:['color.primary','color.text'],properties:{eyebrow:'MISSION EXECUTION',title:'One governed workspace for operational missions.',description:'Create, assign, execute, prove and complete work around one mission truth—with responsibility, custody, action and evidence kept together.',cta:'START',href:'/register.html'},required:true},
  {id:'executor-entry',type:'button',tokenRefs:['color.primary'],properties:{label:'FOR EXECUTORS',href:'/driver/'},required:true},
  card('organizations','ORGANIZATIONS','Run governed work','Build organization context, people and mission flow.'),
  card('executors','EXECUTORS','Act on the next valid action','Receive only the responsibility and evidence needed to execute.'),
  card('participants','PARTICIPANTS','Stay in controlled context','Participate without inheriting unauthorized responsibility.'),
  {id:'availability-status',type:'status-panel',tokenRefs:['color.text','color.surface'],properties:{label:'PRODUCT AVAILABILITY',state:'AVAILABLE',description:`${availability.countries?.length||0} launched countries. ${availability.message||'Country availability is governed by the active product launch.'}`},required:true},footer()];
 root.innerHTML=shell(page(components));
}
boot();
