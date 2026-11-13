import {api,jsonOptions} from "../core/api.js?v=16.118.0";
const form=document.querySelector("#universalStartForm"),button=document.querySelector("#submit"),feedback=document.querySelector("#feedback"),result=document.querySelector("#result");
form?.addEventListener("submit",async event=>{
 event.preventDefault();if(!document.querySelector("#consent").checked){feedback.textContent="Please accept the preference notice or continue directly to registration.";return;}
 button.disabled=true;feedback.textContent="Saving your optional preference…";result.hidden=true;
 const payload={intent:document.querySelector("#intent").value,accountType:"individual",sectorCode:"general",preferredLanguage:(navigator.language||"en").slice(0,2).toLowerCase()};
 try{
  const saved=await api("/api/platform/public/intakes",jsonOptions("POST",{...payload,consentAccepted:true,consentVersion:"ONM-PLATFORM-INTAKE-1",idempotencyKey:crypto.randomUUID().replaceAll("-","")}));
  const ref=saved.intake?.id||"received";
  result.hidden=false;result.innerHTML=`<strong>Your starting preference is saved.</strong><p style="margin-top:8px">Next, create your account using ON Mission's existing secure registration. Organization details and verification will be requested only where the selected service and applicable policy require them.</p><p style="margin-top:8px">Reference: ${escapeHtml(ref)}</p><p style="margin-top:16px"><a href="/register.html" style="font-weight:900;color:#126346">Continue to account registration →</a></p>`;
  feedback.textContent="Preference saved. Continue to the existing registration flow.";
 }catch(error){feedback.textContent=error.message||"Unable to continue. Please try again.";}finally{button.disabled=false;}
});
function escapeHtml(value){return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
