import {canonicalFirst} from '../core/canonical-db.js';
/**
 * ON Mission 10.31.79 — Canonical User Readiness
 *
 * Readiness is derived from canonical identity/account/actor/role/membership
 * facts plus the existing User Situation entitlement and verification facts.
 * It is never a trusted mutable flag.
 */
import {resolveUserSituation} from './user-situation.service.js';
import {resolveIdentityClassification} from './user-classification.core.js';

export const READINESS=Object.freeze(['read_only','identity_ready','verified','action_ready','tenant_ready','executor_ready','driver_ready','manager_ready','developer_ready','platform_control_ready']);
const READY_STATES=new Set(['tenant_ready','executor_ready','driver_ready','manager_ready','developer_ready','platform_control_ready']);

export async function resolveUserClassification(env,session,{situation:preloadedSituation=null}={}){
  const situation=preloadedSituation||await resolveUserSituation(env,session);
  const identity=await resolveIdentityClassification(env,session);
  const actor=identity.actor.type;
  const roles=identity.actor.roles;
  const profileReady=await operationalProfileReady(env,session,actor);
  const readiness=computeReadiness({session,situation,identity,actor,roles,profileReady});
  return Object.freeze({
    version:'2.0.0',
    platformUserId:identity.platformUserId,
    identity:Object.freeze({...identity.identity,verified:Boolean(situation.verification?.verified)}),
    jurisdiction:Object.freeze({declared:situation.country?.declared||'ZZ',verified:situation.country?.verified||null,status:situation.country?.status||'pending'}),
    account:identity.account,
    actor:identity.actor,
    membership:identity.membership,
    entitlement:Object.freeze({subscriptionClass:situation.subscriptionClass,eligibleForSubscription:situation.eligibleForSubscription,accessState:situation.accessState,planCode:situation.planCode,capabilities:situation.capabilities}),
    restrictions:identity.restrictions,
    readiness,
    authorization:Object.freeze({model:'canonical_authorization_decision',finalAuthority:'secured_domain_operation'}),
    source:'canonical_user_classification'
  });
}

function computeReadiness({session,situation,identity,actor,roles,profileReady}){
  const verified=Boolean(situation.verification?.verified);
  const authenticated=Boolean(session);
  const active=identity.account.state==='active';
  const tenantMember=identity.membership.some(m=>m.membership_type==='tenant'&&m.status==='active');
  const noRestriction=identity.restrictions.length===0;
  const entitlement=Boolean(!situation.subscriptionRequired||['active','grace'].includes(String(situation.accessState||''))||situation.subscriptionClass==='exempt');
  const roleSet=new Set(roles);
  const states=[];
  if(authenticated)states.push('identity_ready');else states.push('read_only');
  if(verified)states.push('verified');
  if(active&&verified&&['tenant','independent_executor','driver','action_user'].includes(actor))states.push('action_ready');
  const tenantCanCreateMissions=situation?.capabilities?.createMissions===true;
  const operationalSubscription=Boolean(['active','grace'].includes(String(situation?.accessState||''))||situation?.subscriptionClass==='exempt');
  if(actor==='tenant'&&tenantMember&&verified&&entitlement&&operationalSubscription&&active&&noRestriction)states.push('tenant_ready');
  if(actor==='independent_executor'&&verified&&active&&profileReady&&noRestriction)states.push('executor_ready');
  if(actor==='driver'&&tenantMember&&verified&&active&&profileReady&&noRestriction)states.push('driver_ready');
  if(roleSet.has('manager')&&verified&&active&&noRestriction)states.push('manager_ready');
  if(roleSet.has('developer')&&verified&&active&&noRestriction&&session?.authMethod)states.push('developer_ready');
  if((roleSet.has('platform_administrator')||roleSet.has('platform_super_administrator'))&&verified&&active&&noRestriction&&session?.authMethod)states.push('platform_control_ready');
  const current=highestReadiness(states);
  const missing=missingRequirements({current,actor,verified,active,tenantMember,entitlement,noRestriction,profileReady,tenantCanCreateMissions});
  return Object.freeze({current,rank:Math.max(0,READINESS.indexOf(current)),states:Object.freeze(states),next:nextReadiness(current,actor),readyToGo:READY_STATES.has(current),badge:READY_STATES.has(current)?'READY TO GO':'IN PROGRESS',missing:Object.freeze(missing),definitions:READINESS});
}

function highestReadiness(states){
  const precedence=['platform_control_ready','developer_ready','manager_ready','tenant_ready','executor_ready','driver_ready','action_ready','verified','identity_ready','read_only'];
  return precedence.find(x=>states.includes(x))||'read_only';
}

function nextReadiness(current,actor){
  if(current==='identity_ready')return 'verified';
  if(current==='verified')return actor==='tenant'?'tenant_ready':actor==='independent_executor'?'executor_ready':actor==='driver'?'driver_ready':'action_ready';
  if(current==='action_ready')return actor==='tenant'?'tenant_ready':actor==='independent_executor'?'executor_ready':actor==='driver'?'driver_ready':'action_ready';
  return null;
}

function missingRequirements({current,actor,verified,active,tenantMember,entitlement,noRestriction,profileReady,tenantCanCreateMissions}){
  const m=[];
  if(current==='read_only')m.push({code:'authenticated',label:'Sign in to continue',action:'sign_in'});
  if(current==='identity_ready'&&!verified)m.push({code:'verification',label:'Complete required verification',action:'/app#account?activation=1'});
  if(current==='verified'&&!verified)m.push({code:'verification',label:'Complete required verification',action:'/app#account?activation=1'});
  if((current==='verified'||current==='action_ready')&&actor==='tenant'){
    if(!tenantMember)m.push({code:'tenant_membership',label:'Establish tenant membership',action:'/app'});
    if(!entitlement)m.push({code:'tenant_entitlement',label:'Activate an available plan',action:'/app#account?activation=1'});
    // Core mission creation is a platform capability for a fully ready tenant.
    // Plan-specific limits/features are enforced by the secured action/service layer.

  }
  if(current==='verified'&&actor==='independent_executor'&&!profileReady)m.push({code:'executor_profile',label:'Complete your executor profile',action:'/driver'});
  if(current==='verified'&&actor==='driver'&&!tenantMember)m.push({code:'driver_membership',label:'Join an active tenant',action:'/'});
  if(!noRestriction)m.push({code:'restriction',label:'Resolve the active account restriction',action:'/'});
  if(!active)m.push({code:'active_account',label:'Reactivate the account',action:'/'});
  return m;
}

async function operationalProfileReady(env,session,actor){
  if(actor==='independent_executor'){
    const r=await env.DB.prepare(`SELECT registered_company_name,company_category,working_cities,working_zip_codes,mobile,description,vehicle_types FROM public_executor_profiles WHERE executor_id=? LIMIT 1`).bind(Number(session?.executorId||0)).first();
    if(!r)return false;
    const list=v=>{try{return JSON.parse(v||'[]')}catch{return []}};
    return Boolean(r.registered_company_name&&r.company_category&&r.mobile&&r.description&&list(r.working_cities).length&&list(r.working_zip_codes).length&&list(r.vehicle_types).length);
  }
  if(actor==='driver')return Boolean(await canonicalFirst(env,`SELECT driver_id FROM driver_operational_profiles WHERE driver_id=? LIMIT 1`,[Number(session?.driverId||0)],'user_access'));
  return true;
}

export async function getUserProgress(env,session){
  const classification=await resolveUserClassification(env,session);
  const path=readinessPath(classification);
  const current=classification.readiness.current;
  const currentIndex=Math.max(0,path.indexOf(current));
  const steps=path.map((code,index)=>({code,label:labelFor(code),status:index<currentIndex?'complete':index===currentIndex?'current':'locked'}));
  return {version:'2.0.0',current,next:classification.readiness.next,badge:classification.readiness.badge,readyToGo:classification.readiness.readyToGo,steps,missing:classification.readiness.missing,axes:{identity:classification.identity,verification:{verified:classification.identity.verified},account:classification.account,actor:classification.actor,membership:classification.membership,entitlement:classification.entitlement,restrictions:classification.restrictions},classification};
}

function readinessPath(c){
  const actor=c.actor?.type;
  const roles=new Set(c.actor?.roles||[]);
  if(roles.has('platform_super_administrator')||roles.has('platform_administrator'))return ['read_only','identity_ready','verified','action_ready','platform_control_ready'];
  if(roles.has('developer'))return ['read_only','identity_ready','verified','action_ready','developer_ready'];
  if(roles.has('manager'))return ['read_only','identity_ready','verified','action_ready','manager_ready'];
  if(actor==='tenant')return ['read_only','identity_ready','verified','action_ready','tenant_ready'];
  if(actor==='independent_executor')return ['read_only','identity_ready','verified','action_ready','executor_ready'];
  if(actor==='driver')return ['read_only','identity_ready','verified','action_ready','driver_ready'];
  return ['read_only','identity_ready','verified','action_ready'];
}
function labelFor(c){return c.replaceAll('_',' ').replace(/\b\w/g,x=>x.toUpperCase());}

export async function requireUserAccess(env,session,{readiness=null,role=null}={}){
  const c=await resolveUserClassification(env,session);
  if(c.account.state!=='active')throw accessError('ACCOUNT_RESTRICTED',403,'account_state');
  if(c.restrictions.length)throw accessError('USER_RESTRICTED',403,'restriction');
  if(role&&!c.actor.roles.includes(role))throw accessError('ROLE_NOT_AUTHORIZED',403,'role');
  if(readiness){
    const requiredIndex=READINESS.indexOf(readiness);
    const actualIndex=READINESS.indexOf(c.readiness.current);
    if(requiredIndex<0||actualIndex<requiredIndex)throw accessError(`READINESS_REQUIRED:${readiness}`,403,'readiness');
  }
  return c;
}

function accessError(message,status,reason){const e=new Error(message);e.status=status;e.reason=reason;return e;}
