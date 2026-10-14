/* 10.30.35 compatibility copy: domain presentation remains inherited from 10.30.34; no new authority. */
/* ON Mission 10.30.33 domain contexts runtime. */
/* ON Mission 10.30.18 — Complete Domain Context Components
 * Presentation-only components. Existing services, routes, permissions and
 * guarded mutations remain authoritative.
 */
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const low=v=>String(v??"").trim().toLowerCase();
const num=v=>Number(v||0);
const kind=x=>low(x?.kind||x?.type||"");
const labelFor=(domain,id)=>{
  const maps={
    people:{all:"People",customers:"Customers",partners:"Partners",drivers:"Drivers",trusted:"Trusted partners",non_trusted:"Non-trusted partners"},
    requests:{all:"Requests",sharing:"Sharing mission",foryou:"ForYou",shared:"Currently shared",pending:"Pending",completed:"Completed",declined:"Declined"},
    missions:{all:"All missions",inbound:"Inbound",own:"Own missions",shared:"Shared missions",requested:"Requested missions",foryou:"ForYou missions",completed:"Completed missions",cancelled:"Cancelled missions"}
  };
  return maps[domain]?.[id]||id;
};
const personActions=x=>{
  const k=kind(x);
  if(k==="driver"||k==="executor") return [["open","Open profile"],["edit","Edit profile"],["message","Message"]];
  if(k==="customer") return [["open","Open customer"],["edit","Edit customer"]];
  return [["open","Open partner"],["message","Message"]];
};
function tabs(domain,contexts,selected,counts,onSelect){
  return `<div class="ctx16-tabs">${contexts.map(c=>`<button type="button" class="${selected===c.id?"active":""}" data-ctx16-domain="${domain}" data-ctx16-id="${esc(c.id)}"><span>${esc(c.label)}</span><b>${counts[c.id]||0}</b></button>`).join("")}</div>`;
}
export function renderPeopleContext(host,{contexts,selected,counts,rows,onSelect}){
  if(!host)return;
  const visible=rows||[];
  host.innerHTML=`<section class="ctx16-domain ctx16-people">
    <header class="ctx16-domain-head"><div><span>PEOPLE CONTEXT</span><h2>${esc(labelFor("people",selected))}</h2><p>People are independent operational objects. Their existing management capabilities open in the Workbench.</p></div><strong>${visible.length} records</strong></header>
    ${tabs("people",contexts,selected,counts,onSelect)}
    <div class="ctx16-grid">${visible.slice(0,100).map(x=>{
      const k=kind(x), id=num(x?.id||x?.driverId||x?.customerId||x?.recipientId);
      const actions=personActions(x);
      return `<article class="ctx16-card"><div class="ctx16-card-head"><span class="ctx16-type">${esc(k||"person")}</span><span class="ctx16-status">${esc(x?.status||((k==="driver"||k==="executor")&&num(x?.active)!==0?"Active":"Current"))}</span></div>
        <h3>${esc(x?.name||x?.companyName||x?.company_name||x?.partner_company_name||x?.username||`Person ${id}`)}</h3>
        <p>${esc(x?.city||x?.address||x?.email||x?.username||"Operational relationship")}</p>
        <div class="ctx16-actions">${actions.map(([a,l])=>`<button type="button" data-ctx16-person-action="${a}" data-ctx16-kind="${esc(k)}" data-ctx16-id="${id}">${esc(l)}</button>`).join("")}</div>
      </article>`;
    }).join("")||`<div class="ctx16-empty">No people in <b>${esc(labelFor("people",selected))}</b>.</div>`}</div>
  </section>`;
  host.querySelectorAll("[data-ctx16-id]").forEach(b=>b.addEventListener("click",()=>onSelect?.(b.dataset.ctx16Id)));
}
export function renderRequestContext(host,{contexts,selected,counts,rows,onSelect}){
  if(!host)return;
  const visible=rows||[];
  host.innerHTML=`<section class="ctx16-domain ctx16-requests">
    <header class="ctx16-domain-head"><div><span>REQUEST CONTEXT</span><h2>${esc(labelFor("requests",selected))}</h2><p>Requests remain distinct from missions and people. Decisions use the existing request services and mission state.</p></div><strong>${visible.length} records</strong></header>
    ${tabs("requests",contexts,selected,counts,onSelect)}
    <div class="ctx16-request-list">${visible.slice(0,100).map(x=>{
      const status=low(x?.status||"pending"), id=num(x?.id||x?.requestId), mid=num(x?.mission_id||x?.missionId);
      const actionable=["pending","requested","open"].includes(status);
      return `<article class="ctx16-request"><div><span class="ctx16-type">${esc(x?.request_type||x?.kind||x?.type||"Request")}</span><h3>${esc(x?.reference||x?.title||x?.mission_reference||`Request ${id}`)}</h3><p>${esc(x?.requester_company_name||x?.requester_name||x?.recipient_company_name||"Network participant")}${mid?` · Mission ${mid}`:""}</p></div>
        <div class="ctx16-request-side"><b>${esc(x?.status||"Pending")}</b><div class="ctx16-actions"><button type="button" data-ctx16-request-open="${id}">OPEN</button>${actionable?`<button type="button" class="primary" data-ctx16-request-action="approve" data-ctx16-request-id="${id}">APPROVE</button><button type="button" data-ctx16-request-action="decline" data-ctx16-request-id="${id}">DECLINE</button>`:""}</div></div></article>`;
    }).join("")||`<div class="ctx16-empty">No requests in <b>${esc(labelFor("requests",selected))}</b>.</div>`}</div>
  </section>`;
  host.querySelectorAll("[data-ctx16-id]").forEach(b=>b.addEventListener("click",()=>onSelect?.(b.dataset.ctx16Id)));
}
export function missionContextDescription(id){
  return {
    all:"All missions currently visible to this company.",
    inbound:"Missions entering this company's operational flow.",
    own:"Missions owned by this company.",
    shared:"Missions currently connected through trusted/network execution.",
    requested:"Missions originating from or associated with operational requests.",
    foryou:"Missions exposed through the ForYou distribution flow.",
    completed:"Terminal missions completed successfully.",
    cancelled:"Terminal missions cancelled by an authorized participant."
  }[id]||"Current mission context.";
}
