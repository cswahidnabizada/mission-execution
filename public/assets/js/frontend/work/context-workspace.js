import {esc} from '../core/api.js';
import {card,empty,loading,unavailable} from '../components/ui.js';
import {renderMissionWorkbench} from '../../../ui/canonical-mission-workspace.js';
import {contextHref,loadContext,readContextRequest} from './context-work-model.js';

const labels={mission:'MISSION',person:'PERSON',organization:'ORGANIZATION',network:'NETWORK RELATIONSHIP',object:'OBJECT',product:'PRODUCT'};
const value=v=>v===null||v===undefined||v===''?'—':String(v);
const backLabel=href=>href==='#work'?'Back to Work':href==='#network'?'Back to Network':href==='#people'?'Back to People':href==='#objects'?'Back to Objects':'Back';

function stat(label,value,detail=''){return `<article class="hwp-context-stat"><span>${esc(label)}</span><strong>${esc(value)}</strong>${detail?`<small>${esc(detail)}</small>`:''}</article>`;}
function list(rows,render,emptyText){return rows.length?`<div class="hwp-context-list">${rows.map(render).join('')}</div>`:empty(emptyText);}

function organizationView(record){
  const people=record.people||[], network=record.network||{}, product=record.product||{};
  return `<div class="hwp-context-grid">
    ${stat('PEOPLE',String(people.length),'People visible to your current authority')}
    ${stat('TRUSTED NETWORK',String(network.trustedPartners??network.trusted??0),'Active relationships')}
    ${stat('PENDING REQUESTS',String(network.pendingRequests??network.pending??0),'Current collaboration requests')}
    ${stat('PRODUCT',value(product.name||product.productName||'Current'),'Governed product context')}
  </div>
  <div class="hwp-context-columns">
    <section class="hwp-context-card"><div class="hwp-section-head"><div><span class="hwp-kicker">PEOPLE</span><h3>People around the work</h3></div></div>${list(people.slice(0,12),p=>`<a class="hwp-context-row" href="${contextHref('person',p.identityId||p.id,'#context?type=organization')}"><span><strong>${esc(p.displayName||p.email||'Person')}</strong><small>${esc(p.roles?.map(x=>x.label).join(' · ')||p.authRole||'Member')}</small></span><span>→</span></a>`,'No people are available in this context.')}</section>
    <section class="hwp-context-card"><div class="hwp-section-head"><div><span class="hwp-kicker">OPERATING CONTEXT</span><h3>Current organization</h3></div></div><div class="hwp-context-copy"><p>Your organization context connects people, trusted relationships and the active product without creating a second authority.</p><span class="onm-chip">SERVER AUTHORITATIVE</span></div></section>
  </div>`;
}

function personView(record){
  const p=record.person||{};
  return `<div class="hwp-context-grid">${stat('ROLE',value(p.roles?.map(x=>x.label).join(' · ')||p.authRole||'Member'))}${stat('STATUS',p.active===false?'INACTIVE':'ACTIVE')}${stat('ACCESS',record.self?'YOUR ACCOUNT':'ORGANIZATION MEMBER')}${stat('EXECUTOR',p.driverId?'LINKED':'NOT LINKED')}</div>
  <section class="hwp-context-card"><span class="hwp-kicker">PERSON CONTEXT</span><h3>${esc(p.displayName||p.email||'Person')}</h3><p>${esc(p.email||p.login||'')}</p><div class="hwp-context-detail-list"><div><span>Responsibility</span><strong>${esc(p.roles?.map(x=>x.label).join(' · ')||p.authRole||'Member')}</strong></div><div><span>Account</span><strong>${p.active===false?'Inactive':'Active'}</strong></div>${p.driverId?`<div><span>Executor identity</span><strong>${esc(String(p.driverId))}</strong></div>`:''}</div></section>`;
}

function networkView(record){
  const r=record.relationship||{};
  return `<div class="hwp-context-grid">${stat('STATUS',value(r.status),'Canonical relationship state')}${stat('PARTNER',value(r.partner_company_name||r.company_name))}${stat('RELATIONSHIP',value(r.relationship_type||'Trusted network'))}${stat('UPDATED',value(r.updated_at||r.created_at||'Current'))}</div>
  <section class="hwp-context-card"><span class="hwp-kicker">NETWORK RELATIONSHIP</span><h3>${esc(r.partner_company_name||r.company_name||'Organization')}</h3><p>This context explains the relationship. Decisions and mutations remain owned by the canonical Network authority.</p><span class="onm-chip">NETWORK AUTHORITY</span></section>`;
}

function objectView(record){
  const o=record.object||{};
  return `<div class="hwp-context-grid">${stat('TYPE',value(o.type||o.object_type||'Object'))}${stat('MISSION',value(o.reference||o.missionId||'—'))}${stat('STATUS',value(o.missionStatus||o.status||'ACTIVE'))}${stat('CAPABILITY',value(o.capability||'object'))}</div>
  <section class="hwp-context-card"><span class="hwp-kicker">OBJECT CONTEXT</span><h3>${esc(o.reference||o.name||'Object')}</h3><p>${esc(o.description||'Operational object associated with canonical mission work.')}</p><div class="hwp-context-detail-list">${o.weightKg!=null?`<div><span>Weight</span><strong>${esc(`${o.weightKg} kg`)}</strong></div>`:''}${o.volumeM3!=null?`<div><span>Volume</span><strong>${esc(`${o.volumeM3} m³`)}</strong></div>`:''}${o.palletCount!=null?`<div><span>Pallets</span><strong>${esc(String(o.palletCount))}</strong></div>`:''}</div></section>`;
}

function productView(record){
  const c=record.context||{};
  const launch=c.availability||{}, runtime=c.runtime||{};
  return `<div class="hwp-context-grid">${stat('PRODUCT',value(c.name||c.productName||'Current product'))}${stat('STATUS',value(launch.status||'ACTIVE'))}${stat('COUNTRY',value(launch.countryName||launch.countryCode||'Current'))}${stat('RUNTIME',value(runtime.version||'Governed'))}</div>
  <section class="hwp-context-card"><span class="hwp-kicker">PRODUCT CONTEXT</span><h3>${esc(c.name||c.productName||'Current product')}</h3><p>Product configuration and availability are read from the canonical governed product context. Product publishing remains a Control Plane responsibility.</p><span class="onm-chip">PRODUCT AUTHORITY</span></section>`;
}

export async function renderContextWorkspace(el,s){
  const request=readContextRequest();
  if(!request.type){el.innerHTML=empty('Choose a context from Work, Network, People or Objects.');return;}
  el.innerHTML=`<div class="hwp-context-workspace"><section class="hwp-context-hero"><div><span class="hwp-kicker">${esc(labels[request.type])} CONTEXT</span><h1>Understanding the work around you</h1><p>One contextual workspace. Canonical truth stays with the domain authority underneath.</p></div><a class="onm-btn" href="${esc(request.back)}">${esc(backLabel(request.back))}</a></section><div id="contextBody">${loading('Loading canonical context…')}</div></div>`;
  const body=el.querySelector('#contextBody');
  try{
    const model=await loadContext(request,s);
    if(model.type==='mission'){
      body.innerHTML=`<section class="hwp-context-card"><div class="hwp-section-head"><div><span class="hwp-kicker">MISSION CONTEXT</span><h2>${esc(model.title)}</h2><p>${esc(model.subtitle)}</p></div><span class="onm-chip">MISSION AUTHORITY</span></div><div id="missionContextWorkbench">${loading('Opening canonical Mission Workspace…')}</div></section>`;
      await renderMissionWorkbench(body.querySelector('#missionContextWorkbench'),Number(model.id),'');
    } else if(model.type==='organization')body.innerHTML=organizationView(model.record);
    else if(model.type==='person')body.innerHTML=personView(model.record);
    else if(model.type==='network')body.innerHTML=networkView(model.record);
    else if(model.type==='object')body.innerHTML=objectView(model.record);
    else if(model.type==='product')body.innerHTML=productView(model.record);
    if(model.record?.degraded?.length)body.insertAdjacentHTML('afterbegin',`<div class="hwp-degraded">Some optional context is temporarily unavailable: ${esc(model.record.degraded.join(', '))}. Canonical work and authority remain authoritative.</div>`);
  }catch(e){body.innerHTML=unavailable(e.message||'Context authority is unavailable.','retryContext');body.querySelector('#retryContext')?.addEventListener('click',()=>renderContextWorkspace(el,s));}
}
