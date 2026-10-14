import {api} from "/assets/js/core/api.js";
const $=s=>document.querySelector(s), esc=v=>String(v??"").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
function objectCapability(x){return String(x?.type||"").toLowerCase().includes("cargo")?"logistics":"object";}
function renderObjects(data){
 const list=$("#objectsList"),detail=$("#objectDetail"); if(!list||!detail)return;
 const objects=data?.objects||[];
 list.innerHTML=objects.map((x,i)=>`<button class="object-list-item ${i===0?'active':''}" data-object-id="${esc(x.id)}"><span>OBJECT</span><strong>${esc(x.description||x.type||"Object")}</strong><small>${esc(x.reference||"Mission")}</small></button>`).join("")||'<div class="empty">No mission objects are currently recorded.</div>';
 const show=x=>{if(!x){detail.innerHTML='<div class="empty">Select an object.</div>';return;}const cap=objectCapability(x);detail.innerHTML=`<article class="object-card"><div class="ctx-detail-kicker">${esc(x.type||"OBJECT")}</div><h2>${esc(x.description||x.type||"Object")}</h2><p>${cap==='logistics'?'<b>Logistics capability context.</b> Logistics details remain an Object, not a separate platform domain.':'Universal mission object.'}</p><div class="ctx-facts"><div><span>Mission</span><b>${esc(x.reference||x.missionId)}</b></div><div><span>Capability</span><b>${esc(cap==='logistics'?'Logistics':'Object')}</b></div><div><span>Status</span><b>${esc(x.missionStatus||'—')}</b></div><div><span>Weight</span><b>${x.weightKg==null?'—':esc(`${x.weightKg} kg`)}</b></div><div><span>Volume</span><b>${x.volumeM3==null?'—':esc(`${x.volumeM3} m³`)}</b></div><div><span>Pallets</span><b>${x.palletCount==null?'—':esc(x.palletCount)}</b></div></div></article>`;};
 show(objects[0]); list.querySelectorAll('[data-object-id]').forEach(b=>b.onclick=()=>{list.querySelectorAll('.object-list-item').forEach(q=>q.classList.toggle('active',q===b));show(objects.find(x=>String(x.id)===b.dataset.objectId));});
}
async function loadObjects(){try{renderObjects(await api('/api/objects'));}catch(e){const d=$("#objectDetail");if(d)d.innerHTML=`<div class="empty">Objects are unavailable right now.</div>`;}}
window.addEventListener('onmission:universalization-objects',loadObjects);
window.addEventListener('onmission:area-change',e=>{if(e.detail?.area==='objects')loadObjects();});
