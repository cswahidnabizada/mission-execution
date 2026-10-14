import {api} from "../core/api.js";
import {clearSession,saveAccessSession} from "../core/session.js";
import {escapeHtml,slashDate} from "../core/dom.js";
import {operationalMissionHref} from "../core/operational-mission-route.js";

const $=s=>document.querySelector(s);
let session={},situation={},networkInvitations=[],companyDrivers=[];

function dashboardFor(s){return s.role==="admin"?"/app":s.role==="executor"||s.role==="driver"?"/app#work":"/";}

async function hydrate(){
  try{
    const d=await api("/api/auth/session");
    session=d.session||{};saveAccessSession(session);
    const situationResponse=await api("/api/user/situation");
    situation=situationResponse.situation||{};
    if(session.role==="admin")$("#dashboardBack").href=dashboardFor(session);
    $("#dashboardBack").textContent="← DASHBOARD";
    $("#executorJoin")?.classList.toggle("hidden",session.role!=="executor");
    $("#publicIntro").textContent=session.role==="admin"
      ?"Create a private ForYou access code from a mission workspace and share it directly with the intended participant."
      :"Open a private mission only when the owning tenant has given you its access code.";
    $("#otherHint").textContent=session.role==="admin"
      ?"Private mission codes are shared directly; there is no public marketplace listing."
      :"Access begins with a valid code and remains subject to the owning tenant's approval.";
    return true;
  }catch{clearSession();location.replace("/");return false;}
}

async function load(){
  if(!await hydrate())return;
  networkInvitations=[];companyDrivers=[];
  try{
    const [n,dr]=await Promise.all([
      ["admin","executor"].includes(session.role)?api("/api/network/invitations").catch(()=>({invitations:[]})):Promise.resolve({invitations:[]}),
      session.role==="admin"?api("/api/drivers").catch(()=>({drivers:[]})):Promise.resolve({drivers:[]})
    ]);
    networkInvitations=n.invitations||[];
    companyDrivers=(dr.drivers||[]).filter(x=>Number(x.active??1)===1);
  }catch{}
  renderPrivateEntry();renderNetworkInvitations();
}

function renderPrivateEntry(){
  $("#ownedSection")?.classList.add("hidden");
  $("#otherCount").textContent="0";
  $("#otherMissions").innerHTML='<div class="empty-card">ForYou is private. Use the access-code field above to enter a mission shared with you.</div>';
}

function receivingDriverSelect(id,prefix="network-custody"){
  const options=companyDrivers.map(d=>`<option value="${Number(d.id)}">${escapeHtml(d.name||"Executor")}</option>`).join("");
  return `<label class="custody-receiver-select"><span>Receiving executor</span><select data-${prefix}-driver="${Number(id)}"><option value="">Choose executor</option>${options}</select></label>`;
}

function renderNetworkInvitations(){
  const section=$("#networkInvitationSection");
  section.classList.toggle("hidden",networkInvitations.length===0);
  $("#networkInvitationCount").textContent=networkInvitations.length;
  $("#networkInvitations").innerHTML=networkInvitations.map(x=>`<article class="network-invite-card">
    <div class="network-invite-head"><div><b>${escapeHtml(x.reference||"Mission")}</b><div class="text-[10px] text-slate-500">${escapeHtml(x.owner_company_name||"Trusted partner")} · ${escapeHtml(slashDate(x.mission_date)||x.mission_date||"")}</div></div><span>PRIVATE INVITATION</span></div>
    <div class="network-invite-route"><div class="network-invite-stop"><small>PICKUP</small><b>${escapeHtml(x.pickup_company||"Pickup")}</b></div><span>→</span><div class="network-invite-stop"><small>DELIVERY</small><b>${escapeHtml(x.delivery_company||"Delivery")}</b></div></div>
    ${x.message?`<div class="text-xs text-slate-600 mb-2">${escapeHtml(x.message)}</div>`:""}
    <div class="network-invite-actions action-experience-row">
      <button class="network-invite-accept action-primary" data-network-invite="${Number(x.id)}" data-action="accept">ACCEPT</button>
      <button class="network-invite-reject" data-network-invite="${Number(x.id)}" data-action="reject">REJECT</button>
    </div>
  </article>`).join("");
}

async function resolvePrivateMission(){
  const code=$("#privateAccessCode")?.value?.trim()||"";
  const message=$("#privateRequestMessage")?.value?.trim()||"";
  const result=$("#privateAccessResult");
  if(code.length<8){result.textContent="Enter the private mission access code.";return;}
  result.textContent="Checking private access…";
  try{
    const d=await api("/api/public/access-code/resolve",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({accessCode:code})});
    const m=d.mission;
    result.innerHTML=`<div class="private-access-card"><b>${escapeHtml(m.reference||"Private Mission")}</b><div>${escapeHtml(m.ownerCompanyName||"Authorized tenant")}</div><div class="text-xs text-slate-500">${escapeHtml(m.missionDate||"")}</div><button id="privateRequestButton" class="request-button mt-3">REQUEST MISSION ACCESS</button></div>`;
    $("#privateRequestButton").onclick=async()=>{
      try{
        await api("/api/actions/execute",{method:"POST",headers:{"Content-Type":"application/json","X-Mission-State-Token":String(m.stateToken||"")},body:JSON.stringify({missionId:Number(m.id),actionCode:"request_foryou_mission",stateToken:String(m.stateToken||""),actionPayload:{accessCode:code,message}})});
        result.innerHTML='<div class="private-access-card"><b>Request sent</b><div class="text-xs text-slate-500">The owning tenant must approve access before the mission becomes available in your workspace.</div></div>';
      }catch(e){result.textContent=e.message||"Request failed";}
    };
  }catch(e){result.textContent=e.message||"Invalid or expired access code";}
}

$("#privateAccessButton")?.addEventListener("click",resolvePrivateMission);
$("#networkInvitations")?.addEventListener("click",e=>{
  const b=e.target.closest("[data-network-invite]");if(!b)return;
  const inviteId=Number(b.dataset.networkInvite||0),invite=networkInvitations.find(x=>Number(x.id)===inviteId),missionId=Number(invite?.mission_id||invite?.missionId||0);
  if(!missionId)return;
  const action=b.dataset.action==="accept"?"accept_network":"reject_network";
  location.href=operationalMissionHref(missionId,{role:session.role,view:"actions",action});
});

load();
window.addEventListener("onmission:live-notifications",e=>{if((e.detail?.notifications||[]).length&&!document.querySelector("input:focus,textarea:focus,select:focus"))load();});
