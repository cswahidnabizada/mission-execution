import {formatDate} from "../core/dom.js";
import {api,jsonOptions} from "../core/api.js";
import {getSession,isAdmin} from "../core/session.js";
// Canonical billing surface consumes the User Situation and Activation contracts. Policy compatibility: /api/user/situation remains the canonical situation authority; /api/subscriptions/current returns that same situation plus commercial projections.
const $=s=>document.querySelector(s), plan=$("#currentPlan"), status=$("#currentStatus"), portal=$("#portalBtn"), feedback=$("#feedback"), giftSection=$("#giftSection"), giftCode=$("#giftCode"), giftRedeem=$("#giftRedeem");
let session=null;
if(!getSession()) location.href="/";
document.querySelectorAll("[data-plan]").forEach(b=>b.onclick=()=>checkout(b.dataset.plan,b));
portal.onclick=openPortal; if(giftRedeem)giftRedeem.onclick=redeemGift;
async function load(){
  try{
    session=getSession();
    const d=await api("/api/subscriptions/current"); const c=d.situation||{}; renderPlans(d.plans||[]); renderInvoices(d.invoices||[]); const e=c.subscription||{};
    const p=c.policy||{}; const u=c.usage||{};
    const label=p.plan_code?String(p.plan_code).replace(/_/g," ").replace(/\b\w/g,x=>x.toUpperCase()):"No eligible plan";
    plan.textContent=label;
    const period=c.period?.end?` · current period ends ${formatDate(c.period.end)}`:" · current period unavailable";
    status.textContent=`${String(c.accessState||"unknown").replace(/_/g," ").toUpperCase()} · ${(c.subscriptionClass||"unknown").toUpperCase()}${period}`;
    if(giftSection)giftSection.classList.toggle("hidden",!isAdmin());
    renderUsage(c,u,p);
    const billingEligible=c.subscriptionRequired===true && c.subscriptionClass!=="exempt";
    document.querySelector('#billingNotRequired')?.classList.toggle('hidden',billingEligible);
    document.querySelector('#usageSummary')?.classList.toggle('hidden',!billingEligible);
    if(isAdmin() && e?.stripe_customer_id) portal.classList.remove("hidden");
    document.querySelectorAll("[data-plan]").forEach(b=>b.closest("article").classList.toggle("hidden",!isAdmin()));
    if(c.accessState==="grace") show("Payment needs attention. Review the current period in the Activation Center.","amber");
    else if(c.accessState==="payment_required"||c.accessState==="period_expired") show("Billing action is required. Use the Activation Center or manage billing below.","red");
  }catch(e){show(e.message,"red");}
  const q=new URLSearchParams(location.search).get("checkout");
  if(q==="success")show("✓ Checkout completed. Stripe is confirming your subscription.","green");
  if(q==="cancelled")show("Checkout cancelled. No plan change was made.","amber");
}
function renderUsage(c,u,p){
  const section=document.querySelector("#usageSummary"); if(!section)return;
  const cap=c.capacity||{};const missions=cap.missions||{};const drivers=cap.activeDrivers||{};
  const missionText=missions.limit!=null?`${Number(missions.used||0)} / ${Number(missions.limit)}`:`${Number(missions.used||0)}`;
  const driverText=drivers.limit!=null?`${Number(drivers.used||0)} / ${Number(drivers.limit)}`:`${Number(drivers.used||0)}`;
  const missionRemain=missions.remaining!=null?` · ${Number(missions.remaining)} remaining`:``;
  const driverRemain=drivers.remaining!=null?` · ${Number(drivers.remaining)} remaining`:``;
  section.innerHTML=`<div><b>${missionText}</b><span>missions this period${missionRemain}</span></div><div><b>${driverText}</b><span>active drivers${driverRemain}</span></div>`;
}
function renderPlans(plans){const wrap=document.querySelector('.subscription-plans');if(!wrap)return;wrap.innerHTML=plans.map(p=>`<article class="plan-card ${p.code==='business'?'business':''}"><div class="text-xs font-black text-slate-500">${String(p.code).toUpperCase()}</div><h3 class="text-3xl font-black mt-2">${escapeHtml(p.name)}</h3><div class="text-xl font-black mt-3">${escapeHtml(p.currency)} ${(Number(p.priceMinor||0)/100).toFixed(2)} <span class="text-xs">/ ${escapeHtml(p.billingInterval)}</span></div><ul class="mt-5 space-y-2 text-sm">${Object.entries(p.limits||{}).map(([k,v])=>`<li>✓ ${escapeHtml(k.replaceAll('_',' '))}: ${escapeHtml(v)}</li>`).join('')||'<li>✓ Configured capability set</li>'}</ul><button data-plan="${escapeHtml(p.code)}" class="checkout-btn mt-6">${p.stripeConfigured?'CHOOSE PLAN':'BILLING SETUP REQUIRED'}</button></article>`).join('')||'<div class="text-sm font-bold">No subscription plans are currently eligible for this organization.</div>';wrap.querySelectorAll('[data-plan]').forEach(b=>b.onclick=()=>checkout(b.dataset.plan,b));wrap.querySelectorAll('[data-plan]').forEach(b=>{if(b.textContent.includes('SETUP'))b.disabled=true;});}
function renderInvoices(invoices){const existing=document.querySelector('#invoiceSection');if(existing)existing.remove();const main=document.querySelector('main');if(!main)return;const section=document.createElement('section');section.id='invoiceSection';section.className='subscription-gift';section.innerHTML=`<h2 class="impact-text text-xl font-black">INVOICES</h2><div class="table-wrap mt-4"><table class="table"><thead><tr><th>Invoice</th><th>Status</th><th>Total</th><th>Issued</th></tr></thead><tbody>${invoices.map(i=>`<tr><td>${escapeHtml(i.invoice_number||i.provider_invoice_id)}</td><td>${escapeHtml(i.status)}</td><td>${escapeHtml(i.currency)} ${(Number(i.total_minor||0)/100).toFixed(2)}</td><td>${escapeHtml(i.issued_at||'—')}</td></tr>`).join('')||'<tr><td colspan=4>No invoices yet.</td></tr>'}</tbody></table></div>`;main.appendChild(section);}
function escapeHtml(v){return String(v??'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\\':'&#92;','"':'&quot;'}[c]));}
