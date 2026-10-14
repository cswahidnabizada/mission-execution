import { api,jsonOptions } from "../core/api.js";
import { getSession } from "../core/session.js";
import { escapeHtml } from "../core/dom.js";

const $=s=>document.querySelector(s);
const session=getSession();

if(!session?.role)location.href="/";

$("#contactEmail").value=session.login?.includes("@")?session.login:"";
$("#context").innerHTML=`Signed in as <b>${escapeHtml(session.displayName||session.driverName||session.login||session.role)}</b> · Tenant ${escapeHtml(session.tenantId||"-")} · ${escapeHtml(session.role)}`;

$("#backBtn").onclick=()=>{
  if(document.referrer){
    try{if(new URL(document.referrer).origin===location.origin){history.back();return;}}catch{}
  }
  location.href=session.role==="admin"?"/app":"/app#work";
};

$("#supportForm").onsubmit=async e=>{
  e.preventDefault();
  const feedback=$("#feedback");
  feedback.className="text-sm font-bold text-slate-600";
  feedback.textContent="Sending...";
  try{
    const data=await api("/api/support",jsonOptions("POST",{
      category:$("#category").value,
      contactEmail:$("#contactEmail").value.trim(),
      subject:$("#subject").value.trim(),
      missionReference:$("#missionReference").value.trim(),
      message:$("#message").value.trim()
    }));
    feedback.className="text-sm font-bold text-emerald-700";
    feedback.textContent=`✓ Support request #${data.ticketId} received`;
    e.target.reset();
    $("#contactEmail").value=session.login?.includes("@")?session.login:"";
  }catch(error){
    feedback.className="text-sm font-bold text-red-600";
    feedback.textContent=error.message;
  }
};
