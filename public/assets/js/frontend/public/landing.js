import {attachLayoutStudioRouteAdapter} from '../admin/layout-studio-production-adapter.js?v=16.10.49';
import {api,esc} from '../core/api.js';
const root=document.getElementById('root');
attachLayoutStudioRouteAdapter({root,routeId:'public-homepage'});
function shell(content){return `<div class="public-experience"><header class="public-top"><a class="brand" href="/"><span class="brand-mark">OM</span><span><b>ON MISSION</b><small>GOVERNED MISSION EXECUTION</small></span></a><div class="onm-toolbar"><a class="onm-btn" href="/status.html">PRODUCT STATUS</a><a class="onm-btn" href="/login.html">SIGN IN</a></div></header>${content}</div>`;}
function unavailable(message,session){root.innerHTML=shell(`<main class="public-main"><section class="onm-surface onm-card public-hero"><div class="onm-eyebrow">COUNTRY PRODUCT</div><h1>Mission Execution is not open for public access yet.</h1><p class="onm-muted">${esc(message||'No country product is currently activated.')}</p><div class="onm-toolbar onm-space-top"><a class="onm-btn onm-btn-primary" href="/status.html">VIEW STATUS</a>${session?'<button class="onm-btn" id="landingLogout">SIGN OUT CURRENT SESSION</button>':''}</div><div class="onm-toolbar onm-space-top"><span class="onm-chip onm-chip-warn">PUBLIC ACCESS CLOSED</span></div></section></main>`);document.querySelector('#landingLogout')?.addEventListener('click',async()=>{const b=document.querySelector('#landingLogout');b.disabled=true;try{await api('/api/auth/logout',{method:'POST'});location.reload()}catch(e){b.disabled=false;b.textContent=e.message||'SIGN OUT FAILED'}});}
async function boot(){
  let availability;
  try{availability=await api('/api/product/availability');}
  catch(e){root.innerHTML=shell(`<main class="public-main"><section class="onm-surface onm-card public-hero"><div class="onm-eyebrow">PRODUCT AVAILABILITY</div><h1>Product availability is temporarily unavailable.</h1><p class="onm-muted">${esc(e.message||'The product availability authority could not be reached.')}</p><div class="onm-toolbar onm-space-top"><button class="onm-btn onm-btn-primary" id="retryAvailability">RETRY</button></div></section></main>`);document.querySelector('#retryAvailability').onclick=()=>location.reload();return;}
  let session=null;try{session=(await api('/api/auth/session?optional=1')).session}catch{}
  if(availability.status!=='start'){unavailable(availability.message,session);return;}
  if(session){location.replace('/app/');return;}
  root.innerHTML=shell(`<main class="public-main">
    <section class="onm-surface onm-card public-hero"><div class="onm-eyebrow">MISSION EXECUTION</div><h1>One governed workspace for operational missions.</h1><p class="onm-muted">Create, assign, execute, prove and complete work around one mission truth—with responsibility, custody, action and evidence kept together.</p><div class="onm-toolbar onm-space-top"><a class="onm-btn onm-btn-primary" href="/register.html">START</a><a class="onm-btn" href="/driver/">FOR EXECUTORS</a></div><div class="onm-toolbar onm-space-top"><span class="onm-chip onm-chip-ok">AVAILABLE</span><span class="onm-chip">${availability.countries?.length||0} LAUNCHED COUNTRIES</span></div></section>
    <section class="onm-grid onm-grid-3 onm-space-top">${[['ORGANIZATIONS','Run governed work','Build organization context, people and mission flow.'],['EXECUTORS','Act on the next valid action','Receive only the responsibility and evidence needed to execute.'],['PARTICIPANTS','Stay in controlled context','Participate without inheriting unauthorized responsibility.']].map(x=>`<section class="onm-surface onm-card"><div class="onm-eyebrow">${x[0]}</div><h2>${x[1]}</h2><p class="onm-muted">${x[2]}</p></section>`).join('')}</section>
    <p class="onm-muted onm-space-top">${esc(availability.message||'Country availability is governed by the active product launch.')}</p>
  </main>`);
}
boot();
