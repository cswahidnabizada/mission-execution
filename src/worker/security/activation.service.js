import {resolveUserSituation} from "./user-situation.service.js";
import {resolveUserClassification} from "./user-access.service.js";
import {listOpenActivationRequests,reconcileActivationReviewRequests} from "./activation-review.service.js";

export const ACTIVATION_VERSION="1.0.0";

export async function resolveActivation(env,session){
  // Resolve the expensive canonical User Situation once. Classification reuses
  // the same immutable read model instead of querying subscription/verification
  // state a second time for every activation refresh.
  const situation=await resolveUserSituation(env,session);
  const classification=await resolveUserClassification(env,session,{situation});
  await reconcileActivationReviewRequests(env,session,situation);
  const reviewRequests=await listOpenActivationRequests(env,session);
  const readiness=situation?.readyToGo===true;
  const next=nextTask({situation,classification,reviewRequests});
  return Object.freeze({
    version:ACTIVATION_VERSION,
    active:Boolean(!readiness || next?.kind),
    readyToGo:readiness,
    badge:readiness?"READY TO GO":"ACTIVATION REQUIRED",
    title:readiness?"ON Mission is active":(next?.title||"Complete activation"),
    message:readiness?"Your account is active. New operational work will appear when it requires you.":(next?.message||"Complete the next required step to activate your account."),
    current:String(classification?.readiness?.current||"read_only"),
    next:next||null,
    trust:{verified:Boolean(situation?.verification?.verified),reviewStatus:situation?.verification?.reviewStatus||null,trustKeyStatus:situation?.verification?.trustKeyStatus||null},
    access:{state:situation?.accessState||"not_applicable",accountState:situation?.account?.state||null,actor:situation?.actor?.type||null,restrictions:Array.isArray(situation?.restrictions)?situation.restrictions:[]},
    billing:{planCode:situation?.planCode||null,subscriptionClass:situation?.subscriptionClass||null,subscriptionRequired:situation?.subscriptionRequired===true,eligibleForSubscription:situation?.eligibleForSubscription===true,accessState:situation?.accessState||null,period:situation?.period||null,usage:situation?.usage||null,limits:situation?.limits||null,capacity:situation?.capacity||null},
    steps:activationSteps({situation,classification}),
    actions:situation?.actions||{},
    reviewRequests,
    verificationDetails:situation?.verification||null,
    accountDetails:situation?.account||null,
    classification:Object.freeze({actor:classification?.actor||null,identity:classification?.identity||null,membership:classification?.membership||null})
  });
}

function nextTask({situation,classification,reviewRequests=[]}){
  if(Array.isArray(situation?.restrictions)&&situation.restrictions.length)return task("restriction","Resolve account restriction","A current account restriction must be resolved before work can continue.","/","Review restriction");
  if(Array.isArray(reviewRequests)&&reviewRequests.length){
    const r=reviewRequests[0];
    if(r.userCompletedAt)return task("review_waiting","Waiting for platform review","Your requested activation update has been submitted. A platform administration must complete the review before a new Trust Key can be issued.","/app#account?activation=1","View review status",r.id,r.fields);
    return task("review_request","Complete requested update",r.message||"A platform review requested an activation update.","/app#account?activation=1","Review requested update",r.id,r.fields);
  }
  const missing=Array.isArray(classification?.readiness?.missing)?classification.readiness.missing:[];
  if(missing.length){const m=missing[0];return taskFor(m,situation);}
  if(situation?.account?.state!=="active")return task("account","Reactivate account","Your account needs to be active before protected work can continue.","/", "Reactivate account");
  if(Array.isArray(situation?.restrictions)&&situation.restrictions.length)return task("restriction","Resolve account restriction","A current account restriction must be resolved before work can continue.","/","Review restriction");
  if(situation?.verification?.verified!==true)return task("verification","Complete ON Mission Trust","Finish the required verification checks and Trust Key activation.","/app#account?activation=1","Open verification");
  const billingRequired=situation?.subscriptionRequired===true && situation?.subscriptionClass!=="exempt";
  if(billingRequired && situation?.accessState==="subscription_required")return task("billing","Activate your subscription","An active subscription is required before this account can work.","/app#account?activation=1","Open billing");
  if(billingRequired && ["payment_required","period_expired","grace"].includes(String(situation?.accessState||"")))return task("billing","Review billing","Your billing period needs attention before continued work.","/app#account?activation=1","Review billing");
  return null;
}

function taskFor(m,situation){
  const code=String(m?.code||"");
  if(code==="verification")return task("verification","Complete ON Mission Trust",m.label||"Complete required verification.",m.action||"/app#account?activation=1","Open verification");
  if(code.includes("entitlement")||code.includes("subscription"))return task("billing","Activate your subscription",m.label||"Activate an available plan.",m.action||"/app#account?activation=1","Open billing");
  if(code==="restriction")return task("restriction","Resolve account restriction",m.label||"Resolve the active account restriction.",m.action||"/","Review restriction");
  if(code.includes("membership"))return task("membership","Restore workspace access",m.label||"Establish the required workspace membership.",m.action||"/","Open workspace");
  if(code.includes("profile"))return task("profile","Complete your operational profile",m.label||"Complete your operational profile.",m.action||"/app#account","Open account");
  if(code==="active_account")return task("account","Reactivate account",m.label||"Reactivate the account.",m.action||"/","Reactivate account");
  return task(code||"activation","Complete activation",m.label||"Complete the next required step.",m.action||"/","Continue");
}
function task(kind,title,message,href,label,requestId=null,fields=[]){return Object.freeze({kind,title,message,href,label,...(requestId?{requestId,fields}: {})});}
function activationSteps({situation,classification}){
  const checks=Array.isArray(situation?.verification?.checks)?situation.verification.checks:[];
  const by=Object.fromEntries(checks.map(x=>[String(x.type||x.check_type||""),String(x.status||"")]));
  const verified=Boolean(situation?.verification?.verified);
  return [
    {code:"identity",label:"Identity",status:classification?.identity?.verified?"complete":"current"},
    {code:"verification",label:"ON Mission Trust",status:verified?"complete":by.email==="verified"||by.phone==="verified"||by.country==="verified"?"current":"current"},
    {code:"access",label:"Access",status:verified&&situation?.account?.state==="active"?"complete":"locked"},
    {code:"billing",label:"Billing",status:(situation?.accessState==="active"||situation?.subscriptionClass==="exempt"||situation?.accessState==="grace")?"complete":"current"},
    {code:"ready",label:"Ready to work",status:situation?.readyToGo?"complete":"locked"}
  ];
}
