import {api,esc} from '../core/api.js';
const e=document.getElementById('status');
async function load(){
  try{
    const d=await api('/api/product/availability');
    e.innerHTML=`<div class="onm-eyebrow">PRODUCT STATUS</div><h1>${d.status==='start'?'ON MISSION IS AVAILABLE':'PRODUCT IS NOT READY YET'}</h1><p class="onm-muted">${esc(d.message||'')}</p><div class="onm-toolbar onm-space-top">${(d.countries||[]).map(x=>`<span class="onm-chip onm-chip-ok">${esc(x.name||x.country_code)}</span>`).join('')||'<span class="onm-chip">NO LAUNCHED COUNTRIES</span>'}</div><div class="onm-toolbar onm-space-top"><a class="onm-btn" href="/">HOME</a>${d.status==='start'?'<a class="onm-btn onm-btn-primary" href="/register.html">START</a>':''}</div>`;
  }catch(err){e.innerHTML=`<div class="onm-eyebrow">PRODUCT STATUS</div><h1>Status unavailable.</h1><p class="onm-muted">${esc(err.message||'The product availability authority could not be reached.')}</p><div class="onm-toolbar onm-space-top"><button class="onm-btn onm-btn-primary" id="retryStatus">RETRY</button><a class="onm-btn" href="/">HOME</a></div>`;document.getElementById('retryStatus')?.addEventListener('click',load);}
}
load();
