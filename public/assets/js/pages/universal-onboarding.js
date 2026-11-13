import {api,jsonOptions} from "../core/api.js?v=16.116.0";
const form=document.querySelector("#universalStartForm"),button=document.querySelector("#submit"),feedback=document.querySelector("#feedback"),result=document.querySelector("#result");
form?.addEventListener("submit",async event=>{
 event.preventDefault();button.disabled=true;feedback.textContent="Checking the universal platform configuration…";result.hidden=true;
 const countryCode=document.querySelector("#countryCode").value.trim().toUpperCase();
 const payload={intent:document.querySelector("#intent").value,accountType:document.querySelector("#accountType").value,countryCode,sectorCode:document.querySelector("#sectorCode").value,preferredLanguage:document.querySelector("#language").value};
 try{
  const classified=await api("/api/platform/public/classify-onboarding",jsonOptions("POST",payload));
  const saved=await api("/api/platform/public/intakes",jsonOptions("POST",{...payload,consentAccepted:document.querySelector("#consent").checked,consentVersion:"ONM-PLATFORM-INTAKE-1",idempotencyKey:crypto.randomUUID().replaceAll("-","")}));
  const c=saved.classification?.classification||classified.result?.classification||{};const country=saved.classification?.country||classified.result?.country||{};
  result.hidden=false;result.innerHTML=`<strong>We have your starting point.</strong><p style="margin-top:8px">Your intention is classified as <b>${escapeHtml(c.intent||payload.intent)}</b>. Recommended workspace: <b>${escapeHtml(c.workspace||"general-workspace")}</b>.</p><p style="margin-top:8px">Country: <b>${escapeHtml(country.name||country.code||"Not selected")}</b>. Operational access: <b>${escapeHtml(country.operationalEligibility||"not evaluated")}</b>.</p><p style="margin-top:8px">Reference: ${escapeHtml(saved.intake?.id||"received")}. Status: ${escapeHtml(saved.intake?.status||"received")}.</p><p class="notice" style="margin-top:10px">This records your onboarding preference only. Account creation, identity verification, subscription, activation code and country/product eligibility remain separate required steps.</p>`;
  feedback.textContent="Your onboarding preference was saved.";
 }catch(error){feedback.textContent=error.message||"Unable to continue. Please try again.";}finally{button.disabled=false;}
});
function escapeHtml(value){return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
