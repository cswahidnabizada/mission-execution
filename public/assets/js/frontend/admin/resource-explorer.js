/* ON Mission 12.3.0 — unified Super Admin Resource Explorer. */
import {api,rawApi,ensureStepUp,esc} from './admin-runtime.js?v=16.10.44';

const ACTION_TYPE={tenant:'tenant',user:'user',country:'country',sector:'sector',component:'ui',data_entry:'data_entry',launch:'country_product_launch',expansion:'expansion_case'};
const ACTION_LABEL={STOP:'STOP',TRASH:'TRASH',PURGE:'PURGE'};
const MANAGEABLE_EDIT=new Set(['tenant','user','country']);
const REUSABLE_TYPES=new Set(['country_blueprint','product_country','sector','language','currency','region','classification','policy','residency','retention','consent','role','capability','responsibility','storage','provider','component','page','feature','configuration','guidance','plan','eligibility','pricing']);

function root(){return document.querySelector('#adminDrawerRoot')}
function statusClass(s){const v=String(s||'').toLowerCase();return ['active','completed','live','ready','verified'].includes(v)?'ok':['blocked','failed','error','uncertain','retired','cancelled'].includes(v)?'bad':'warn'}
function value(v){return v==null||v===''?'—':String(v)}
function escAttr(v){return esc(v).replace(/'/g,'&#39;')}

export async function openResourceExplorer(resource){
  // Resource Explorer is now a compatibility action bridge, not a second UI surface.
  // The canonical UI is the Resources workspace; every caller converges there.
  const r=resource||{};
  window.dispatchEvent(new CustomEvent('onmission:open-workspace',{detail:{workspace:'resource-management',resource:r}}));
}

export async function runResourceAction(resource,action){
  const r=resource||{};
  const mapped=ACTION_TYPE[r.type]||r.type;
  if(!mapped)throw new Error('RESOURCE_ACTION_UNAVAILABLE');
  if(!await ensureStepUp(`resource-${action}:${mapped}:${r.id}`))return {cancelled:true};
  return api('/api/platform/admin/resource-management/action',{method:'POST',headers:{'X-ONM-Explicit-Governed-Action':'1','Idempotency-Key':crypto.randomUUID()},body:{resourceType:mapped,resourceId:r.id,action,reason:`Super Admin Resources: ${String(action).toUpperCase()}`}});
}

export async function restoreResource(resource,trashId){
  if(!trashId)throw new Error('NO_ACTIVE_TRASH_RECORD');
  if(!await ensureStepUp(`resource-restore:${resource?.type}:${resource?.id}`))return {cancelled:true};
  return api(`/api/platform/admin/trash/${encodeURIComponent(trashId)}/restore`,{method:'POST',headers:{'X-ONM-Explicit-Governed-Action':'1'},body:{}});
}

function render(host,data,close){
 const r=data.resource||{};const g=data.graph||{};const actions=r.actions||[];
 const deps=(g.nodes||[]).filter(x=>x.id!==g.root?.id);
 const relGroups={};for(const e of g.edges||[]){const target=e.to?.id===g.root?.id?e.from:e.to;(relGroups[e.relation]??=[]).push(target)}
 host.querySelector('.admin-resource-explorer').innerHTML=`
 <header class="resource-explorer-head"><div><span class="eyebrow">SUPER ADMIN · RESOURCE EXPLORER</span><h2>${esc(r.name||'Resource')}</h2><p class="mini">${esc(r.type||'resource')} · ${esc(r.authority||'Canonical authority')}</p></div><div class="resource-head-actions"><span class="pill ${statusClass(r.status)}">${esc(String(r.status||'UNKNOWN').toUpperCase())}</span><button class="btn muted" data-resource-close>ESC</button></div></header>
 <div class="resource-explorer-body">
  <section class="resource-summary card"><div><span class="eyebrow">CANONICAL RECORD</span><h3>${esc(r.name||'Resource')}</h3><p class="sub">${esc(r.subtitle||'No additional scope metadata.')}</p></div><div class="resource-facts">${Object.entries(r.record||{}).slice(0,12).map(([k,v])=>`<div><span>${esc(k.replaceAll('_',' '))}</span><b>${esc(value(v))}</b></div>`).join('')}</div></section>
  <section class="resource-actions card"><div class="section-head"><div><span class="eyebrow">ONE RECORD · GOVERNED ACTIONS</span><h3>Manage this record</h3><p class="sub">The Explorer orchestrates. Canonical authorities perform every mutation.</p></div></div><div class="actions">${actions.includes('MANAGE')?'<button class="btn primary" data-action="manage">MANAGE</button>':''}${actions.includes('EDIT')?'<button class="btn muted" data-action="edit">EDIT</button>':''}${actions.includes('STOP')?'<button class="btn muted" data-action="stop">STOP</button>':''}${actions.includes('TRASH')?'<button class="btn danger" data-action="trash">DELETE / QUARANTINE</button>':''}${actions.includes('RESTORE')?'<button class="btn muted" data-action="restore">RESTORE</button>':''}${actions.includes('PURGE')?'<button class="btn danger" data-action="purge">PURGE</button>':''}</div><div class="mini resource-boundary">${esc(data.mutationBoundary||'Canonical authority owns mutations.')}</div></section>
  <section class="resource-graph card"><div class="section-head"><div><span class="eyebrow">DEPENDENCY GRAPH</span><h3>What this record depends on — and what depends on it</h3><p class="sub">Select any node to open that canonical record. ${deps.length} connected record${deps.length===1?'':'s'} discovered.</p></div><span class="pill neutral">${deps.length} CONNECTIONS</span></div>${graphMarkup(g)}</section>
  <section class="resource-relations card"><div class="section-head"><div><span class="eyebrow">RELATIONSHIP MAP</span><h3>Dependency details</h3></div></div>${Object.entries(relGroups).map(([rel,nodes])=>`<div class="resource-relation-group"><b>${esc(rel.replaceAll('_',' ').toUpperCase())}</b><div class="resource-relation-list">${nodes.map(n=>`<button class="resource-node-link" data-node-id="${escAttr(n.id)}" data-node-type="${escAttr(n.type)}" data-node-key="${escAttr(n.key)}"><span>${esc(n.label)}</span><small>${esc(n.type)} · ${esc(n.status||'UNKNOWN')}</small></button>`).join('')}</div></div>`).join('')||'<div class="empty">No dependency relationships are currently exposed for this record.</div>'}</section>
 </div>`;
 host.querySelector('[data-resource-close]').onclick=close;
 host.querySelector('[data-action="manage"]')?.addEventListener('click',()=>{const workspace=(REUSABLE_TYPES.has(r.type)||r.type==='component')?'data-studio':(['tenant','user','country'].includes(r.type)?'data-control':r.workspace);close();window.dispatchEvent(new CustomEvent('onmission:open-workspace',{detail:{workspace,resource:r}}))});
 host.querySelector('[data-action="edit"]')?.addEventListener('click',()=>{if(REUSABLE_TYPES.has(r.type)||r.type==='component'){close();window.dispatchEvent(new CustomEvent('onmission:open-workspace',{detail:{workspace:'data-studio',resource:r}}));return}renderEdit(host,data,close)});
 for(const action of ['stop','trash','purge'])host.querySelector(`[data-action="${action}"]`)?.addEventListener('click',()=>mutate(host,data,action,close));host.querySelector('[data-action="restore"]')?.addEventListener('click',()=>restore(host,data,close));
 host.querySelectorAll('[data-node-type]').forEach(b=>b.addEventListener('click',()=>openResourceExplorer({type:b.dataset.nodeType,id:b.dataset.nodeKey||b.dataset.nodeId.split(':').slice(1).join(':')})));
}


async function restore(host,data,close){
 const r=data.resource||{},trashId=r.trashState?.id;if(!trashId){alert('No active Trash record is attached to this resource.');return}
 if(!confirm(`RESTORE ${r.name}? The canonical Trash authority will re-check the snapshot and lifecycle evidence.`))return;
 try{if(!await ensureStepUp(`resource-restore:${r.type}:${r.id}`))return;await api(`/api/platform/admin/trash/${encodeURIComponent(trashId)}/restore`,{method:'POST',headers:{'X-ONM-Explicit-Governed-Action':'1'},body:{}});await openResourceExplorer(r)}catch(e){alert(e.message||'Restore failed. No successful mutation was confirmed.')}
}
function graphMarkup(g){
 const root=g.root||{};const deps=(g.nodes||[]).filter(n=>n.id!==root.id);if(!deps.length)return '<div class="resource-graph-empty">No connected dependencies. The record is currently isolated in the exposed canonical graph.</div>';
 const width=920,height=Math.max(280,Math.ceil(deps.length/3)*92+100);const rootX=70,rootY=height/2;const cols=3;const grouped=deps.reduce((a,n,i)=>{(a[i%cols]??=[]).push(n);return a},[]);
 const pos=new Map();grouped.forEach((list,c)=>list.forEach((n,i)=>{pos.set(n.id,{x:300+c*210,y:65+i*88})}));
 const lines=(g.edges||[]).map(e=>{const t=e.to?.id===root.id?e.from:e.to;const p=pos.get(t?.id);if(!p)return '';return `<line x1="${rootX+150}" y1="${rootY}" x2="${p.x}" y2="${p.y}" class="resource-edge"/><text x="${(rootX+150+p.x)/2}" y="${(rootY+p.y)/2-5}" class="resource-edge-label">${esc(e.relation)}</text>`}).join('');
 const nodes=`<g class="resource-graph-root"><rect x="${rootX}" y="${rootY-32}" width="150" height="64" rx="10"/><text x="${rootX+75}" y="${rootY-4}" text-anchor="middle">${esc(root.label||'Root')}</text><text x="${rootX+75}" y="${rootY+15}" text-anchor="middle" class="resource-node-type">${esc(root.type||'resource')}</text></g>`+deps.map(n=>{const p=pos.get(n.id);return `<g class="resource-graph-node" data-graph-node-type="${escAttr(n.type)}" data-graph-node-key="${escAttr(n.key)}"><rect x="${p.x}" y="${p.y-27}" width="175" height="54" rx="9"/><text x="${p.x+87}" y="${p.y-2}" text-anchor="middle">${esc(n.label||n.key)}</text><text x="${p.x+87}" y="${p.y+16}" text-anchor="middle" class="resource-node-type">${esc(n.type)} · ${esc(n.status||'')}</text></g>`}).join('');
 return `<div class="resource-graph-scroll"><svg class="resource-graph-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Dependency graph">${lines}${nodes}</svg></div>`;
}

function renderEdit(host,data,close){
 const r=data.resource||{};const record=r.record||{};if(!MANAGEABLE_EDIT.has(r.type)){alert('This record is edited in its canonical workspace. No generic database editor is exposed.');return}
 const fields=r.type==='tenant'?['name','legal_name','trading_name','country_code','sector_code']:r.type==='user'?['display_name','email']:['name'];
 const title=`<header class="resource-explorer-head"><div><span class="eyebrow">RESOURCE EXPLORER · EDIT</span><h2>Edit ${esc(r.name)}</h2><p class="mini">Changes are submitted to Data Control's canonical authority.</p></div><button class="btn muted" data-resource-back>BACK</button></header>`;
 host.querySelector('.admin-resource-explorer').innerHTML=title+`<section class="resource-edit-body"><form id="resourceEditForm" class="card section"><div class="resource-edit-grid">${fields.map(k=>`<label class="field"><span>${esc(k.replaceAll('_',' '))}</span><input class="input" name="${escAttr(k)}" value="${escAttr(record[k]??'')}" maxlength="240"></label>`).join('')}</div><div class="actions"><button class="btn primary" type="submit">SAVE CHANGE</button><button class="btn muted" type="button" data-resource-back>CANCEL</button></div></form></section>`;
 host.querySelectorAll('[data-resource-back]').forEach(b=>b.onclick=()=>openResourceExplorer(r));
 host.querySelector('#resourceEditForm').onsubmit=async e=>{e.preventDefault();const payload=Object.fromEntries(new FormData(e.currentTarget).entries());try{if(!await ensureStepUp(`resource-edit:${r.type}:${r.id}`))return;await api('/api/platform/admin/data-control/action',{method:'POST',headers:{'X-ONM-Explicit-Governed-Action':'1'},body:{resourceType:r.type,resourceId:r.id,action:'edit',payload,reason:'Super Admin Resource Explorer edit'}});await openResourceExplorer(r)}catch(x){alert(x.message||'Update failed. No mutation was confirmed.')}};
}

async function mutate(host,data,action,close){
 const r=data.resource||{};const mapped=ACTION_TYPE[r.type]||r.type;if(!ACTION_TYPE[r.type]){alert('This resource uses a domain-specific lifecycle authority. Open MANAGE to perform its governed action.');return}
 const verb=ACTION_LABEL[action]||action.toUpperCase();if(!confirm(`${verb} ${r.name}? The canonical authority will re-check dependencies and policy before mutation.`))return;
 try{if(!await ensureStepUp(`resource-${action}:${mapped}:${r.id}`))return;await api('/api/platform/admin/data-control/action',{method:'POST',headers:{'X-ONM-Explicit-Governed-Action':'1'},body:{resourceType:mapped,resourceId:r.id,action,reason:`Super Admin Resource Explorer: ${verb}`}});await openResourceExplorer(r)}catch(e){alert(e.message||`${verb} failed. No successful mutation was confirmed.`)}
}
