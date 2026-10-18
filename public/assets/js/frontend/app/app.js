import {attachLayoutStudioRouteAdapter,resolveLayoutStudioRoute} from '../admin/layout-studio-production-adapter.js?v=16.10.69';
import {renderComponent,STUDIO_RENDERER_VERSION} from '../admin/layout-studio-renderer.js?v=16.10.69';
import {mountShell,syncNav} from '../shell/app-shell.js';
import {canonicalizeAppHash} from '../navigation/registry.js';
import {api,esc} from '../core/api.js';
import {getSituation} from '../situation/store.js';
import {page,card,empty,loading,unavailable,degraded} from '../components/ui.js';
import {renderMissionWorkbench} from '../../../ui/canonical-mission-workspace.js';
import {loadHumanWork,focusMission} from '../work/human-work-model.js';
import {loadHumanDomainWork} from '../work/human-work-domain-model.js';
import {executeCanonicalObjectAction} from '../../core/canonical-action-client.js';
import {loadExecutorWorkContext,loadCompanyOperationsContext} from '../work/role-work-model.js';
import {renderContextWorkspace} from '../work/context-workspace.js';
import {initActivationModule} from '../../core/activation-module.js';

const root=document.getElementById('root');
attachLayoutStudioRouteAdapter({root, getRouteId:()=>resolveLayoutStudioRoute({pathname:location.pathname,hash:location.hash,role:document.documentElement.dataset.onmRole||''})||'tenant-workspace'});

// Shared renderer is used for route context only; canonical workspace behavior remains authoritative.
function canonicalLayoutContext(routeId, title, description){
  return renderComponent({id:`layout-context-${routeId}`,type:'status-panel',properties:{label:title,state:'CANONICAL',description:`${description} Layout Studio provides governed presentation; mission state, permissions and actions remain owned by canonical services.`}},{mode:'production'});
}

async function render({root,s}){
  document.documentElement.dataset.onmRole=String(s.session?.role||'');
  const canonical=canonicalizeAppHash(location.hash);
  if(canonical!==location.hash){history.replaceState({onMission:true,canonical},'',canonical);}
  const key=canonical.replace('#','').split('?')[0]||'home';
  syncNav();
  const surface=root.querySelector('#surface');
  try{
    if(key==='home')return home(surface,s);
    if(key==='work')return work(surface,s);
    if(key==='network')return network(surface,s);
    if(key==='objects')return objects(surface,s);
    if(key==='people')return people(surface,s);
    if(key==='account')return account(surface,s);
    if(key==='context')return renderContextWorkspace(surface,s);
    return home(surface,s);
  }catch(e){
    surface.innerHTML=unavailable(e.message||'The canonical workspace could not be loaded.');
    surface.querySelector('[id^="retry"]')?.addEventListener('click',()=>render({root,s}));
  }
}
function bindRetry(el,fn){
  el.querySelector('[id^="retry"]')?.addEventListener('click',fn);
}
function workStateLabel(state){
  return ({urgent:'URGENT',attention:'NEEDS ATTENTION',waiting:'WAITING',watch:'WATCH',working:'IN PROGRESS',done:'DONE'})[state]||'WORK';
}
function workRow(x,{button=false}={}){
  const href=x.context?.href||`#work?mission=${Number(x.id)}`;
  const tag=`<span class="hwp-pill ${x.state||''}">${esc(workStateLabel(x.state))}</span>`;
  const detail=x.reason.label||`${x.nextState.label||x.status||'Active'}${x.context.details?.pickup||x.context.details?.delivery?` · ${x.context.details?.pickup||'—'} → ${x.context.details?.delivery||'—'}`:''}`;
  if(button)return `<button type="button" class="hwp-queue-item" data-hwp-mission="${Number(x.id)}"><strong>${esc(x.context.reference)}</strong><small>${esc(detail)}</small>${tag}</button>`;
  return `<a class="hwp-row" href="${href}"><span class="hwp-row-main"><strong>${esc(x.context.reference)}</strong><small>${esc(detail)}</small></span><span class="hwp-row-action">${tag}<b aria-hidden="true">→</b></span></a>`;
}
function renderWorkList(rows,emptyText='Nothing needs your attention.'){
  return rows.length?`<div class="hwp-list">${rows.slice(0,8).map(x=>workRow(x)).join('')}</div>`:`<div class="hwp-empty">${esc(emptyText)}</div>`;
}
function focusCard(model){
  const f=focusMission(model);
  if(!f)return `<section class="hwp-focus"><div class="hwp-focus-copy"><span class="hwp-kicker">FOCUS</span><strong>No urgent work right now</strong><p>Your workspace is current. New work will appear here when the canonical system identifies something that needs you.</p></div><span class="hwp-pill working">CURRENT</span></section>`;
  const label=f.reason?.label||'Current operational work requires review.';
  const reference=f.context?.reference||`Mission ${Number(f.id)}`;
  const href=f.availableAction?.href||f.context?.href||`#work?mission=${Number(f.id)}`;
  return `<section class="hwp-focus"><div class="hwp-focus-copy"><span class="hwp-kicker">FOCUS NOW</span><strong>${esc(reference)}</strong><p>${esc(label)}</p></div><a class="onm-btn onm-btn-primary" href="${esc(href)}">OPEN WORK</a></section>`;
}
function humanHero(s){
  const name=String(s.session?.name||s.session?.email||'there').split(' ')[0]||'there';
  const responsibility=s.situation?.responsibility||s.session?.role||'your operational responsibility';
  return `<section class="hwp-hero"><div><span class="hwp-kicker">YOUR WORKSPACE</span><h1>Good to see you, ${esc(name)}.</h1><p>${esc(responsibility)}. Mission Execution keeps the current situation, the work that matters, and the next valid action together.</p></div><span class="hwp-pill working">LIVE WORK</span></section>`;
}
async function loadHumanWorkOrThrow(){
  const model=await loadHumanWork({limit:50});
  if(!model.ready)throw new Error('Operational work could not be read safely.');
  return model;
}
async function renderExecutorContext(el,s){
  if(!['executor','driver'].includes(String(s.session?.role||'')))return;
  const context=await loadExecutorWorkContext({role:s.session.role});
  const o=context?.overview||{};
  const profile=o.profile||{};
  const executor=o.executor||o.driver||{};
  const invitationCount=Number(context.invitationCount||0);
  const situation=profile.situation||'Available';
  el.insertAdjacentHTML('afterbegin',`${canonicalLayoutContext('executor-workspace','EXECUTOR WORKSPACE','Your operational view is connected to the shared Layout Studio renderer.') }<section class="hwp-role-panel executor-work-panel"><div><span class="hwp-kicker">EXECUTOR WORK</span><h2>${esc(executor.name||s.session?.name||'Your work')}</h2><p>Stay ready, see the next mission that needs you, and keep your operational status current.</p></div><div class="hwp-role-actions"><label class="hwp-status-control"><span>STATUS</span><select id="executorSituation" class="onm-input"><option ${situation==='Available'?'selected':''}>Available</option><option ${situation==='Driving'?'selected':''}>Driving</option><option ${situation==='Traffic'?'selected':''}>Traffic</option><option ${situation==='Break'?'selected':''}>Break</option><option ${situation==='Unavailable'?'selected':''}>Unavailable</option></select></label>${invitationCount?`<a class="onm-btn onm-btn-primary" href="#network">${invitationCount} invitation${invitationCount===1?'':'s'} waiting</a>`:'<span class="hwp-role-note">No network invitation is waiting.</span>'}</div></section>`);
  el.querySelector('#executorSituation')?.addEventListener('change',async e=>{const select=e.currentTarget;select.disabled=true;try{const path=s.session.role==='driver'?'/api/driver/me/operational':'/api/executor/me/operational';await api(path,{method:'PATCH',body:{situation:select.value}});}catch(error){alert(error.message||'Executor status could not be updated.');select.value=situation;}finally{select.disabled=false;}});
}
async function renderCompanyOperations(el,s,model){
  const role=String(s.session?.role||'');
  if(!['admin','operator','manager','member'].includes(role))return;
  const context=await loadCompanyOperationsContext({includeNetwork:true});
  const peopleRows=context.people||[];
  const nSummary=context.summary||{};
  const nInvites=(context.invitations||[]).filter(x=>String(x.status||'Pending').toLowerCase()==='pending');
  const attention=Number(model.counts.urgent||0)+Number(model.counts.attention||0);
  const active=Number(model.counts.active||0);
  const degradedNote=context.degraded?'<div class="hwp-degraded">Some organization context is temporarily unavailable. The canonical work queue remains authoritative.</div>':'';
  el.insertAdjacentHTML('afterbegin',`<section class="hwp-role-panel company-operations-panel"><div class="hwp-section-head"><div><span class="hwp-kicker">COMPANY OPERATIONS</span><h2>Your organization at a glance</h2><p>Operational control without leaving the canonical work model.</p></div><a class="onm-btn" href="#people">PEOPLE</a></div>${degradedNote}<div class="hwp-ops-grid"><article><span>WORK</span><b>${active}</b><small>${attention} needing attention</small></article><article><span>PEOPLE</span><b>${peopleRows.length}</b><small>People visible in this organization</small></article><article><span>NETWORK</span><b>${Number(nSummary.tenants||nSummary.trustedPartners||nSummary.trusted||0)}</b><small>Trusted relationships</small></article><article><span>REQUESTS</span><b>${nInvites.length}</b><small>Incoming collaboration requests</small></article></div><div class="hwp-ops-links"><a href="#work">Open operational work →</a><a href="#network">Open collaboration →</a><a href="#people">Open people →</a></div></section>`);
}
async function home(el,s){
  el.innerHTML=`<div class="hwp">${humanHero(s)}<div id="todayWork">${loading('Reading your current work…')}</div></div>`;
  try{
    const model=await loadHumanWorkOrThrow();
    const focus=focusCard(model);
    const guidance=s.product?.runtime?.manifest?.presentation?.guidance;
    const guidanceText=guidance?.workspace||guidance?.default||'';
    el.querySelector('#todayWork').innerHTML=`${model.degraded?'<div class="hwp-degraded">Some optional work context is unavailable. Canonical mission state remains authoritative.</div>':''}
      ${focus}
      <div class="hwp-grid">
        <div class="hwp-stat"><span>Needs attention</span><b>${model.counts.urgent+model.counts.attention}</b><small>Work that may need you now</small></div>
        <div class="hwp-stat"><span>Waiting</span><b>${model.counts.waiting}</b><small>Waiting on a person, event or predecessor</small></div>
        <div class="hwp-stat"><span>In progress</span><b>${model.counts.working}</b><small>Active work without a current alert</small></div>
        <div class="hwp-stat"><span>Watch</span><b>${model.counts.watch}</b><small>Signals to keep in view</small></div>
      </div>
      <div class="hwp-section"><div class="hwp-section-head"><div><h2>Needs your attention</h2><p>Prioritized from canonical attention and liveness signals.</p></div><a class="onm-btn" href="#work">VIEW WORK</a></div>${renderWorkList([...model.urgent,...model.attentionRows,...model.watch],'Nothing currently requires intervention.')}</div>
      <div class="hwp-section"><div class="hwp-section-head"><div><h2>Waiting on</h2><p>These missions are not asking you to guess; they are waiting for a defined dependency.</p></div></div>${renderWorkList(model.waiting,'Nothing is currently waiting.')}</div>
      ${guidanceText?`<div class="hwp-guidance"><strong>Workspace guidance</strong>${esc(guidanceText)}</div>`:''}`;
    await renderExecutorContext(el.querySelector('#todayWork'),s);
    await renderCompanyOperations(el.querySelector('#todayWork'),s,model);
  }catch(e){el.querySelector('#todayWork').innerHTML=unavailable(e.message||'Operational work is unavailable.','retryToday');el.querySelector('#retryToday')?.addEventListener('click',()=>home(el,s));}
}
function workItemTypeLabel(type){
  return ({mission:'MISSION',network:'COLLABORATION',request:'REQUEST'})[type]||'WORK';
}
function renderDomainWorkDetail(el,item,s,refresh){
  const d=item.context?.details||{};
  const primary=item.availableAction?.href||'#network';
  const kind=item.type||'network';
  const isInvitation=kind==='network'&&String(item.id).startsWith('network-invitation:');
  const isTrust=kind==='network'&&String(item.id).startsWith('network-trust:');
  const isRequest=kind==='request';
  const title=item.context?.reference||item.situation||'Work item';
  const reason=item.reason?.label||item.situation||'Review the current work.';
  const actionArea=(()=>{
    if(isInvitation){
      const invitationId=Number(d.networkInvitationId||0);
      const tenantRecipient=String(d.recipientType||'tenant')==='tenant';
      return `<div class="hwp-work-actions"><div class="hwp-action-note">${tenantRecipient?'Choose the receiving executor before accepting this mission invitation.':'This invitation can be accepted directly.'}</div>${tenantRecipient?'<select id="hwpDomainDriver" class="hwp-collab-driver"><option value="">Choose receiving executor…</option></select>':''}<button type="button" class="onm-btn onm-btn-primary" id="hwpDomainAccept">ACCEPT</button><button type="button" class="onm-btn" id="hwpDomainReject">DECLINE</button></div>`;
    }
    if(isTrust){return `<div class="hwp-work-actions"><button type="button" class="onm-btn onm-btn-primary" id="hwpDomainAccept">ACCEPT TRUST</button><button type="button" class="onm-btn" id="hwpDomainReject">DECLINE</button></div>`;}
    if(isRequest){return `<div class="hwp-work-actions"><button type="button" class="onm-btn onm-btn-primary" id="hwpDomainAccept">APPROVE REQUEST</button><button type="button" class="onm-btn" id="hwpDomainReject">DECLINE</button></div>`;}
    return `<a class="onm-btn onm-btn-primary" href="${esc(primary)}">OPEN NETWORK</a>`;
  })();
  const contextType=isInvitation||isTrust||isRequest?'network':(item.context?.type||kind);
  const contextId=item.context?.details?.relationshipId||item.context?.details?.networkInvitationId||item.context?.details?.forYouRequestId||item.context?.id||'';
  const contextHrefValue=contextType?`#context?type=${encodeURIComponent(contextType)}&id=${encodeURIComponent(contextId)}&back=%23work`:null;
  const contextLink=contextHrefValue&&['network','mission','person','organization','object','product'].includes(contextType)?`<a class="onm-btn" href="${esc(contextHrefValue)}">UNDERSTAND CONTEXT</a>`:'';
  el.innerHTML=`<section class="hwp-role-panel hwp-domain-work-detail"><div class="hwp-section-head"><div><span class="hwp-kicker">${esc(workItemTypeLabel(kind))}</span><h2>${esc(title)}</h2><p>${esc(reason)}</p></div><span class="hwp-pill ${esc(item.state||'attention')}">${esc(workStateLabel(item.state))}</span></div><div class="hwp-work-detail-grid"><article><span>SITUATION</span><strong>${esc(item.situation||'Current work')}</strong></article><article><span>RESPONSIBILITY</span><strong>${esc(item.responsibility||'Assigned responsibility')}</strong></article><article><span>SOURCE</span><strong>${esc(item.sourceAuthority||'canonical')}</strong></article><article><span>NEXT STATE</span><strong>${esc(item.nextState?.label||item.status||'Pending')}</strong></article></div>${item.evidence?.length?`<div class="hwp-evidence-strip"><span class="hwp-kicker">EVIDENCE</span><small>${esc(item.evidence[0].label||'Canonical evidence available')}</small></div>`:''}<div class="hwp-work-actions">${contextLink}${actionArea}</div></section>`;
  if(isInvitation&&String(d.recipientType||'tenant')==='tenant'){
    api('/api/organization/people?limit=50&offset=0',{cache:'no-store'}).then(data=>{
      const select=el.querySelector('#hwpDomainDriver');
      if(!select)return;
      const rows=(data.people||data.items||[]).filter(x=>/driver|executor/i.test(String(x.responsibility||x.role||x.type||''))&&String(x.status||'ACTIVE').toUpperCase()!=='INACTIVE');
      select.insertAdjacentHTML('beforeend',rows.map(x=>`<option value="${Number(x.driverId||x.id)}">${esc(x.name||x.email||`Executor ${Number(x.driverId||x.id)}`)}</option>`).join(''));
    }).catch(error=>{const note=el.querySelector('.hwp-action-note');if(note)note.textContent='Executor list is temporarily unavailable. Open Network to review this invitation.';});
  }
  const run=async(code,button)=>{
    button.disabled=true;button.textContent=code.includes('accept')||code.includes('approve')?'WORKING…':'DECLINING…';
    try{
      const context={};
      if(isInvitation){context.networkInvitationId=Number(d.networkInvitationId);const driver=Number(el.querySelector('#hwpDomainDriver')?.value||0);if(String(d.recipientType||'tenant')==='tenant'&&!driver)throw new Error('Choose the receiving executor before accepting this invitation.');if(driver)context.payload={driverId:driver};}
      if(isTrust)context.relationshipId=Number(d.relationshipId);
      if(isRequest)context.forYouRequestId=Number(d.forYouRequestId);
      await executeCanonicalObjectAction(code,context);
      await refresh();
    }catch(e){button.disabled=false;button.textContent=code.includes('accept')||code.includes('approve')?'ACCEPT':'DECLINE';alert(e.message||'Work action failed.');}
  };
  el.querySelector('#hwpDomainAccept')?.addEventListener('click',e=>run(isInvitation?'accept_network':isTrust?'accept_trust':'approve_foryou_request',e.currentTarget));
  el.querySelector('#hwpDomainReject')?.addEventListener('click',e=>run(isInvitation?'reject_network':isTrust?'reject_trust':'decline_foryou_request',e.currentTarget));
}
async function work(el,s){
  el.innerHTML=`<div class="hwp"><section class="hwp-hero"><div><span class="hwp-kicker">WORK</span><h1>Your operational work</h1><p>One place to see what needs you, what is waiting, and what requires a decision. Canonical domain work stays behind the surface.</p><small class="onm-muted">Mission Workspace owns mission truth; Network authority owns collaboration truth; the secured Action Registry owns mutation execution underneath.</small></div><button id="refreshWork" class="onm-btn">REFRESH</button></section>${canonicalLayoutContext('mission-workspace','MISSION WORKSPACE','The mission workbench uses the shared Layout Studio renderer for governed context presentation.')}<div id="workModel" class="hwp-work"><aside class="hwp-queue"><input id="workSearch" class="hwp-search" placeholder="Find work…" autocomplete="off"><div id="workFilters" class="hwp-filters"></div><div id="workQueue" class="hwp-queue-list">${loading('Reading current work…')}</div></aside><section id="workspace" class="hwp-workbench">${empty('Select work to open its canonical context.')}</section></div></div>`;
  let model=null,domain=null,selected='',filter='attention',query='';
  if(['executor','driver'].includes(String(s.session?.role||''))){try{await renderExecutorContext(el.querySelector('.hwp-work'),s);}catch{}}
  const queue=el.querySelector('#workQueue'),filters=el.querySelector('#workFilters'),search=el.querySelector('#workSearch'),workspace=el.querySelector('#workspace');
  const allRows=()=>[...(model?.rows||[]),...(domain?.items||[])];
  const filtered=()=>{let rows=allRows();if(filter!=='all')rows=rows.filter(x=>x.state===filter);if(query){const q=query.toLowerCase();rows=rows.filter(x=>`${x.context?.reference||''} ${x.reason?.label||''} ${x.situation||''} ${x.sourceAuthority||''}`.toLowerCase().includes(q));}return rows;};
  const renderFilters=()=>{const items=[['attention','Needs attention',allRows().filter(x=>x.state==='urgent'||x.state==='attention').length],['waiting','Waiting',allRows().filter(x=>x.state==='waiting').length],['working','In progress',allRows().filter(x=>x.state==='working').length],['watch','Watch',allRows().filter(x=>x.state==='watch').length],['all','All',allRows().filter(x=>!['done'].includes(x.state)).length]];filters.innerHTML=items.map(([k,l,c])=>`<button type="button" class="hwp-filter ${filter===k?'is-active':''}" data-hwp-filter="${k}">${l} · ${c}</button>`).join('');filters.querySelectorAll('[data-hwp-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.hwpFilter;renderQueue();});};
  const renderQueue=()=>{const rows=filtered();queue.innerHTML=rows.length?rows.slice(0,60).map(x=>{const key=String(x.id);return `<button type="button" class="hwp-queue-item ${selected===key?'is-selected':''}" data-hwp-work-id="${esc(key)}"><span class="hwp-queue-type">${esc(workItemTypeLabel(x.type))}</span><strong>${esc(x.context?.reference||x.situation||'Work')}</strong><small>${esc(x.reason?.label||x.nextState?.label||x.status||'Current work')}</small><span class="hwp-pill ${esc(x.state||'working')}">${esc(workStateLabel(x.state))}</span></button>`;}).join(''):'<div class="hwp-empty">No work matches this view.</div>';queue.querySelectorAll('[data-hwp-work-id]').forEach(b=>b.onclick=()=>openWork(String(b.dataset.hwpWorkId)));};
  const refresh=async()=>{try{model=await loadHumanWorkOrThrow();domain=await loadHumanDomainWork(s);renderFilters();renderQueue();}catch(e){queue.innerHTML=unavailable(e.message||'Operational work is unavailable.','retryWork');queue.querySelector('#retryWork')?.addEventListener('click',refresh);}};
  const openWork=async id=>{selected=id;renderQueue();const item=allRows().find(x=>String(x.id)===String(id));if(!item){workspace.innerHTML=empty('This work item is no longer available.');return;}if(item.type==='mission'){workspace.innerHTML=loading('Opening canonical Mission Workspace…');try{const hash=new URLSearchParams(location.hash.split('?')[1]||'');const action=hash.get('action')||'';const id=Number(item.id);await renderMissionWorkbench(workspace,id,action);workspace.scrollIntoView({behavior:'smooth',block:'start'});}catch(e){workspace.innerHTML=unavailable(e.message||'Mission Workspace unavailable.','retryMissionWorkspace');workspace.querySelector('#retryMissionWorkspace')?.addEventListener('click',()=>openWork(id));}}else{renderDomainWorkDetail(workspace,item,s,refresh);workspace.scrollIntoView({behavior:'smooth',block:'start'});}};
  workspace.addEventListener('dmc:back',()=>{selected='';renderQueue();workspace.innerHTML=empty('Select work to open its canonical context.');});
  workspace.addEventListener('dmc:deleted',()=>{selected='';refresh();});
  search.addEventListener('input',()=>{query=search.value.trim();renderQueue();});
  el.querySelector('#refreshWork').onclick=refresh;
  await refresh();
}
async function network(el,s){
  const role=String(s.session?.role||'');
  el.innerHTML=page('Network','People and organizations connected to your work, with governed collaboration decisions in one place.')+`<div id="networkSurface">${loading('Loading collaboration context…')}</div>`;
  try{
    const requests=[api('/api/network/invitations?limit=50',{cache:'no-store'})];
    if(role==='admin')requests.push(api('/api/network/tenant-trust?limit=50&offset=0',{cache:'no-store'}),api('/api/network/execution-partners',{cache:'no-store'}),api('/api/network/summary',{cache:'no-store'}),api('/api/organization/people?limit=50&offset=0',{cache:'no-store'}),api('/api/public/requests?limit=50&offset=0',{cache:'no-store'}));
    const [invites,...rest]=await Promise.all(requests);
    const trust=rest[0]?.relationships||[];
    const partners=rest[1]?.partners||[];
    const summary=rest[2]?.summary||{};
    const people=rest[3]?.people||rest[3]?.items||[];
    const driverProjection=rest[3]?.driverProjection||[];
    const publicRequests=rest[4]?.requests||[];
    const pendingTrust=trust.filter(x=>String(x.status||'').toLowerCase()==='pending'&&Number(x.requested_by_company_id||0)!==Number(s.session?.tenantId||0));
    const pendingMission=(invites.invitations||[]).filter(x=>String(x.status||'Pending').toLowerCase()==='pending');
    const drivers=people.filter(x=>/driver|executor/i.test(String(x.responsibility||x.role||x.type||''))&&String(x.status||'ACTIVE').toUpperCase()!=='INACTIVE');
    const trustRows=trust.slice(0,20).map(x=>`<a class="onm-list-row hwp-context-list-row" href="#context?type=network&id=${Number(x.id)}&back=%23network"><span><strong>${esc(x.partner_company_name||x.company_name||x.name||'Organization')}</strong><small>${esc(x.status||'UNKNOWN')}</small></span><span class="onm-chip ${String(x.status||'').toLowerCase()==='trusted'?'onm-chip-ok':''}">${esc(String(x.status||'').toUpperCase())}</span><span aria-hidden="true">→</span></a>`).join('');
    const partnerRows=partners.slice(0,20).map(x=>`<div class="onm-list-row"><span><strong>${esc(x.name||x.companyName||'Partner')}</strong><small>${esc(x.type||x.recipientType||'Execution partner')}</small></span><span class="onm-chip onm-chip-ok">TRUSTED</span></div>`).join('');
    const invitationRows=pendingMission.map(x=>`<article class="hwp-collab-card"><div><span class="hwp-kicker">MISSION INVITATION</span><strong>${esc(x.reference||x.mission_reference||`Mission ${x.mission_id||x.id}`)}</strong><small>${esc(x.owner_company_name||x.company_name||'Trusted Network partner')} · ${esc(x.message||'Shared execution request')}</small></div><div class="hwp-collab-actions">${String(x.recipient_type||'tenant')==='tenant'?`<select class="hwp-collab-driver" data-driver-select="${Number(x.id)}"><option value="">Choose receiving driver…</option>${drivers.map(d=>`<option value="${Number(d.driverId)}">${esc(d.name||d.email||`Driver ${d.driverId}`)}</option>`).join('')}</select>`:''}<button type="button" class="onm-btn onm-btn-primary" data-network-accept="${Number(x.id)}" data-recipient-type="${esc(x.recipient_type||'tenant')}">ACCEPT</button><button type="button" class="onm-btn" data-network-reject="${Number(x.id)}">DECLINE</button></div></article>`).join('');
    const trustRequests=pendingTrust.map(x=>`<article class="hwp-collab-card"><div><span class="hwp-kicker">TRUST REQUEST</span><strong>${esc(x.partner_company_name||x.company_name||'Organization')}</strong><small>Requesting a governed trusted relationship.</small></div><div class="hwp-collab-actions"><button type="button" class="onm-btn onm-btn-primary" data-trust-accept="${Number(x.id)}">ACCEPT</button><button type="button" class="onm-btn" data-trust-reject="${Number(x.id)}">DECLINE</button></div></article>`).join('');
    const pendingRequests=publicRequests.filter(x=>String(x.status||'').toLowerCase()==='pending');
    const requestRows=pendingRequests.map(x=>`<article class="hwp-collab-card"><div><span class="hwp-kicker">MISSION REQUEST</span><strong>${esc(x.reference||`Mission ${Number(x.mission_id)}`)}</strong><small>${esc(x.requester_company_name||x.executor_name||x.requester_name||'Requester')} · requesting mission access</small></div><div class="hwp-collab-actions"><button type="button" class="onm-btn onm-btn-primary" data-foryou-approve="${Number(x.id)}">APPROVE</button><button type="button" class="onm-btn" data-foryou-decline="${Number(x.id)}">DECLINE</button></div></article>`).join('');
    el.querySelector('#networkSurface').innerHTML=`<div class="hwp-network-grid">
      <section class="hwp-role-panel"><div class="hwp-section-head"><div><span class="hwp-kicker">COLLABORATION INBOX</span><h2>Decisions waiting for you</h2><p>Accepting or declining uses the existing secured Network authority.</p></div><span class="hwp-pill ${pendingMission.length||pendingTrust.length?'attention':'working'}">${pendingMission.length+pendingTrust.length} WAITING</span></div>${invitationRows||trustRequests||requestRows||empty('No collaboration decision is waiting.')}</section>
      <section class="hwp-role-panel"><div class="hwp-ops-grid"><article><span>TRUSTED PARTNERS</span><b>${Number(summary.trustedPartners||summary.trusted||partners.length||0)}</b><small>Active collaboration relationships</small></article><article><span>MISSION REQUESTS</span><b>${pendingMission.length}</b><small>Incoming execution invitations</small></article><article><span>TRUST REQUESTS</span><b>${pendingTrust.length}</b><small>Incoming organization requests</small></article><article><span>MISSION REQUESTS</span><b>${pendingRequests.length}</b><small>ForYou access requests</small></article><article><span>ROLE</span><b>${esc(role==='executor'?'EXECUTOR':'ORGANIZATION')}</b><small>Current collaboration perspective</small></article></div></section>
      <div class="onm-grid onm-grid-2">${role==='admin'?card(`<div class="onm-eyebrow">TRUSTED RELATIONSHIPS</div><h2>Organizations</h2><div class="onm-list onm-space-top">${trustRows||empty('No organization relationships yet.')}</div>`):''}${role==='admin'?card(`<div class="onm-eyebrow">EXECUTION PARTNERS</div><h2>Trusted executors</h2><div class="onm-list onm-space-top">${partnerRows||empty('No trusted execution partners yet.')}</div>`):''}</div>
    </div>`;
    const respond=async(id,action,button)=>{
      button.disabled=true;button.textContent=action==='accept'?'ACCEPTING…':'DECLINING…';
      try{
        const context={networkInvitationId:Number(id)};
        if(action==='accept'&&button.dataset.recipientType==='tenant'){
          if(!drivers.length)throw new Error('No active receiving executor is available. Add or activate an executor before accepting this mission.');
          const picker=el.querySelector(`[data-driver-select="${Number(id)}"]`);
          const driverId=Number(picker?.value||0);if(!driverId)throw new Error('Choose the receiving executor before accepting this mission.');context.payload={driverId};
        }
        await executeCanonicalObjectAction(action==='accept'?'accept_network':'reject_network',context);
        await network(el,s);
      }catch(e){button.disabled=false;button.textContent=action==='accept'?'ACCEPT':'DECLINE';alert(e.message||'Collaboration action failed.');}
    };
    el.querySelectorAll('[data-network-accept]').forEach(b=>b.onclick=()=>respond(b.dataset.networkAccept,'accept',b));
    el.querySelectorAll('[data-network-reject]').forEach(b=>b.onclick=()=>respond(b.dataset.networkReject,'reject',b));
    const trustAction=async(id,action,b)=>{b.disabled=true;try{await executeCanonicalObjectAction(action==='accept'?'accept_trust':'reject_trust',{relationshipId:Number(id)});await network(el,s);}catch(e){b.disabled=false;alert(e.message||'Trust action failed.');}};
    el.querySelectorAll('[data-trust-accept]').forEach(b=>b.onclick=()=>trustAction(b.dataset.trustAccept,'accept',b));
    el.querySelectorAll('[data-trust-reject]').forEach(b=>b.onclick=()=>trustAction(b.dataset.trustReject,'reject',b));
    el.querySelectorAll('[data-foryou-approve]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{await executeCanonicalObjectAction('approve_foryou_request',{forYouRequestId:Number(b.dataset.foryouApprove)});await network(el,s);}catch(e){b.disabled=false;alert(e.message||'Request approval failed.');}});
    el.querySelectorAll('[data-foryou-decline]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{await executeCanonicalObjectAction('decline_foryou_request',{forYouRequestId:Number(b.dataset.foryouDecline)});await network(el,s);}catch(e){b.disabled=false;alert(e.message||'Request decline failed.');}});
  }catch(e){el.querySelector('#networkSurface').innerHTML=unavailable(e.message||'Network authority is unavailable.');bindRetry(el,()=>network(el,s));}
}
async function objects(el,s){
  el.innerHTML=page('Objects','Universal objects operated on by missions. Capability-specific types appear only when enabled.')
    +`<div id="objectsSurface">${loading('Loading object authority…')}</div>`;
  try{const d=await api('/api/objects');const rows=d.objects||d.items||[];el.querySelector('#objectsSurface').innerHTML=card(`<div class="onm-list">${rows.slice(0,100).map(x=>`<a class="onm-list-row hwp-context-list-row" href="#context?type=object&id=${encodeURIComponent(String(x.id))}&back=%23objects"><span><strong>${esc(x.name||x.reference||`Object ${x.id}`)}</strong><small>${esc(x.type||x.object_type||'Object')}</small></span><span class="onm-chip">${esc(x.status||'ACTIVE')}</span><span aria-hidden="true">→</span></a>`).join('')||empty('No objects are currently available.')}`);}
  catch(e){el.querySelector('#objectsSurface').innerHTML=unavailable(e.message||'Object authority is unavailable.');bindRetry(el,()=>objects(el,s));}
}
async function people(el,s){
  el.innerHTML=page('People','People, responsibilities, access and trust in this organization.')
    +`<div id="peopleSurface">${loading('Loading people authority…')}</div>`;
  try{const d=await api('/api/organization/people');const rows=d.people||d.items||[];el.querySelector('#peopleSurface').innerHTML=card(`<div class="onm-list">${rows.map(x=>`<a class="onm-list-row hwp-context-list-row" href="#context?type=person&id=${encodeURIComponent(String(x.identityId||x.id))}&back=%23people"><span><strong>${esc(x.displayName||x.name||x.email||'Person')}</strong><small>${esc(x.roles?.map(r=>r.label).join(' · ')||x.authRole||x.responsibility||x.role||'Member')}</small></span><span class="onm-chip">${esc(x.active===false?'INACTIVE':'ACTIVE')}</span><span aria-hidden="true">→</span></a>`).join('')||empty('No people are available in this workspace.')}`);}
  catch(e){el.querySelector('#peopleSurface').innerHTML=unavailable(e.message||'People authority is unavailable.');bindRetry(el,()=>people(el,s));}
}
async function account(el,s){
  const shouldOpen=new URLSearchParams(location.hash.split('?')[1]||'').get('activation')==='1';
  const setupChrome=shouldOpen?`<div class="organization-setup-renderer" data-studio-renderer-version="${STUDIO_RENDERER_VERSION}">${renderComponent({id:'organization-setup-context',type:'section',properties:{label:'ON MISSION // ORGANIZATION SETUP',title:'Get your organization ready',description:'Review the next required trust, access and product-readiness steps. Activation state and required actions remain controlled by the canonical account authorities.'}})}</div>`:'';
  el.innerHTML=setupChrome+page('Account','Identity, organization, readiness, billing, privacy and security in one governed account context.')
    +`<div class="onm-grid onm-grid-2">
      ${card(`<div class="onm-eyebrow">IDENTITY</div><h2>${esc(s.session?.name||s.session?.email||'Account')}</h2><p class="onm-muted">${esc(s.session?.email||'')}</p><span class="onm-chip">${esc(s.session?.role==='driver'?'executor':s.session?.role||'member')}</span>`)}
      ${card(`<div class="onm-eyebrow">ORGANIZATION</div><h2>${esc(s.situation?.organization?.name||'Personal workspace')}</h2><p class="onm-muted">${esc(s.situation?.responsibility||'Access is derived from your current situation.')}</p><a class="onm-btn" href="#context?type=organization&back=%23account">UNDERSTAND ORGANIZATION</a>`)}
      ${card(`<div class="onm-eyebrow">PRODUCT</div><h2>${esc(s.situation?.subscription?.planName||s.situation?.subscription?.plan_code||'Current product')}</h2><p class="onm-muted">Product configuration remains server-authoritative.</p><a class="onm-btn" href="#context?type=product&back=%23account">UNDERSTAND PRODUCT</a>`)}
      ${card(`<div class="onm-eyebrow">PRIVACY & SECURITY</div><h2>Protected account</h2><p class="onm-muted">Privacy, security and notification controls remain governed by their canonical authorities.</p><div class="onm-toolbar"><span class="onm-chip">PRIVACY</span><span class="onm-chip">SECURITY</span><span class="onm-chip">NOTIFICATIONS</span></div>`)}
    </div>
    <section class="onm-section" aria-label="Account readiness"><div id="accountActivation"></div></section>`;
  await initActivationModule('#accountActivation',{autoOpen:shouldOpen,mode:'full'});
}
mountShell({root,render});
