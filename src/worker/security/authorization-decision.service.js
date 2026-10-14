/**
 * ON Mission 10.31.79 — Canonical Authorization Decision Engine
 *
 * This is the user-level authorization contract. It decides whether the
 * authenticated subject is eligible to enter an action path. Mission truth,
 * participation, custody, lifecycle and evidence remain authoritative inside
 * the existing secured domain authorization and operation services.
 */
import {resolveUserClassification,READINESS} from './user-access.service.js';
import {resolveProductConfiguration,roleCanAction} from './product-configuration.service.js';

export const AUTHORIZATION_DECISION_VERSION='1.0.0';

const ROLE_REQUIREMENTS=Object.freeze({
  create_mission:'owner_or_admin',
  create_driver:'owner_or_admin',
  delete_mission:'owner_or_admin',
  edit_mission:'owner_or_admin',
  edit_mission_data:'owner_or_admin',
  cancel_mission:'owner_or_admin',
  assign_driver:'owner_or_admin',
  change_driver:'owner_or_admin',
  share_network:'owner_or_admin',
  share_foryou:'owner_or_admin',
  repost_foryou:'owner_or_admin',
  restart_network:'owner_or_admin',
  approve_foryou_request:'owner_or_admin',
  decline_foryou_request:'owner_or_admin'
});

const CAPABILITY_ACTIONS=Object.freeze({
  create_mission:'createMissions',
  create_driver:'createDrivers',
  share_network:'shareNetwork',
  accept_network:'acceptNetwork',
  share_foryou:'shareForYou',
  request_foryou_mission:'requestForYou',
  repost_foryou:'shareForYou',
  restart_network:'shareNetwork'
});

export async function decideUserAuthorization(env,session,{actionCode,readiness='action_ready'}={}){
  const code=String(actionCode||'');
  const classification=await resolveUserClassification(env,session);
  const product=await resolveProductConfiguration(env);
  const reasons=[];
  const checks={
    authenticated:Boolean(classification.identity.authenticated),
    accountActive:classification.account.state==='active',
    unrestricted:classification.restrictions.length===0,
    readiness:readinessSatisfied(classification.readiness.current,readiness),
    role:roleSatisfied(classification.actor.roles,ROLE_REQUIREMENTS[code],code,product),
    capability:capabilitySatisfied(classification.entitlement.capabilities,CAPABILITY_ACTIONS[code])
  };
  if(!checks.authenticated)reasons.push('authentication_required');
  if(!checks.accountActive)reasons.push('account_inactive');
  if(!checks.unrestricted)reasons.push('user_restricted');
  if(!checks.readiness)reasons.push(`readiness_required:${readiness}`);
  if(!checks.role)reasons.push('role_not_authorized');
  if(!checks.capability)reasons.push('capability_not_entitled');
  const authorized=Object.values(checks).every(Boolean);
  const decision=authorized?'ALLOW':!checks.authenticated?'REQUIRES_AUTHENTICATION':!checks.accountActive||!checks.unrestricted?'DENY':!checks.readiness?`REQUIRES_${String(readiness).toUpperCase()}`:!checks.role?'REQUIRES_ROLE':!checks.capability?'REQUIRES_ENTITLEMENT':'DENY';
  return Object.freeze({version:AUTHORIZATION_DECISION_VERSION,decision,authorized,subject:Object.freeze({platformUserId:classification.platformUserId,identity:classification.identity,actor:classification.actor}),action:Object.freeze({code:code||null}),requirements:Object.freeze({readiness,role:ROLE_REQUIREMENTS[code]||null,capability:CAPABILITY_ACTIONS[code]||null}),checks:Object.freeze(checks),reasons:Object.freeze(reasons),classification,authority:'canonical_user_authorization'});
}

function readinessSatisfied(actual,required){
  if(!required)return true;
  const a=READINESS.indexOf(actual),r=READINESS.indexOf(required);
  return a>=0&&r>=0&&a>=r;
}
function roleSatisfied(roles,required,code,product){
  if(!required)return true;
  const set=new Set(roles||[]);
  if(required==='owner_or_admin'){ if(set.has('owner')||set.has('admin'))return true; return [...set].some(r=>roleCanAction(product,r,code)); }
  return set.has(required);
}
function capabilitySatisfied(capabilities,key){return !key||capabilities?.[key]===true;}
