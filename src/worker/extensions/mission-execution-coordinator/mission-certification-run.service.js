import {canonicalFirst} from '../../core/canonical-db.js';
/* ON Mission 14.4 — Controlled Runtime Certification Run Guard.
 * This is a safety/verification control, not an execution authority.
 * Tokens are short-lived, mission+tenant bound, and only usable when the
 * caller explicitly opts into certification mode. Normal execution is unchanged.
 */
export const MISSION_CERTIFICATION_RUN_VERSION='14.6.0';
const encoder=new TextEncoder();
function b64u(bytes){let s='';for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
function unb64u(value){const s=String(value||'').replace(/-/g,'+').replace(/_/g,'/');const pad=s.length%4? '='.repeat(4-s.length%4):'';return Uint8Array.from(atob(s+pad),c=>c.charCodeAt(0));}
async function key(secret){return crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);}
function secret(env){const value=String(env?.ON_MISSION_CERTIFICATION_SECRET||'').trim();if(!value)throw Object.assign(new Error('MISSION_CERTIFICATION_SECRET_REQUIRED'),{code:'MISSION_CERTIFICATION_SECRET_REQUIRED',status:503});return value;}
export async function issueMissionCertificationRun(env,{companyId,missionId,ttlSeconds=900,purpose='real-runtime-certification'}){
  const cid=Number(companyId||0),mid=Number(missionId||0);if(!cid||!mid)throw Object.assign(new Error('MISSION_CERTIFICATION_RUN_SCOPE_REQUIRED'),{code:'MISSION_CERTIFICATION_RUN_SCOPE_REQUIRED',status:400});
  const mission=await canonicalFirst(env,'SELECT id,company_id,country_code,sector_code,state_version,updated_at FROM missions WHERE id=? AND company_id=? LIMIT 1',[mid,cid],'mission_authority');
  if(!mission)throw Object.assign(new Error('MISSION_CERTIFICATION_RUN_MISSION_NOT_FOUND'),{code:'MISSION_CERTIFICATION_RUN_MISSION_NOT_FOUND',status:404});
  const plan=await canonicalFirst(env,"SELECT id,plan_hash,context_hash,state_token,status,plan_json,expires_at FROM mission_plans WHERE company_id=? AND mission_id=? AND status='ACCEPTED' ORDER BY id DESC LIMIT 1",[cid,mid],'mission_planning_authority');
  if(!plan)throw Object.assign(new Error('MISSION_CERTIFICATION_RUN_ACCEPTED_PLAN_REQUIRED'),{code:'MISSION_CERTIFICATION_RUN_ACCEPTED_PLAN_REQUIRED',status:409});
  const planJson=parse(plan.plan_json);
  const actionCode=String(planJson?.recommendedAction?.actionCode||'').trim();
  if(!actionCode)throw Object.assign(new Error('MISSION_CERTIFICATION_RUN_ACTION_REQUIRED'),{code:'MISSION_CERTIFICATION_RUN_ACTION_REQUIRED',status:409});
  const currentStateToken=Number(mission.state_version||0)>0?`v:${Number(mission.state_version)}`:String(mission.updated_at||'');
  if(String(plan.state_token||'')!==currentStateToken)throw Object.assign(new Error('MISSION_CERTIFICATION_RUN_PLAN_STALE'),{code:'MISSION_CERTIFICATION_RUN_PLAN_STALE',status:409});
  const max=900,ttl=Math.max(60,Math.min(max,Number(ttlSeconds)||900));
  if(String(env?.ON_MISSION_CERTIFICATION_ENABLED||'0')!=='1')throw Object.assign(new Error('MISSION_CERTIFICATION_RUN_DISABLED'),{code:'MISSION_CERTIFICATION_RUN_DISABLED',status:409});
  const now=Math.floor(Date.now()/1000),payload={v:2,runVersion:MISSION_CERTIFICATION_RUN_VERSION,companyId:cid,missionId:mid,issuedAt:now,expiresAt:now+ttl,jti:crypto.randomUUID(),purpose:String(purpose||'real-runtime-certification').slice(0,160),planId:Number(plan.id),planHash:String(plan.plan_hash||''),contextHash:String(plan.context_hash||''),stateToken:String(plan.state_token||''),actionCode};
  const body=b64u(encoder.encode(JSON.stringify(payload)));const sig=b64u(new Uint8Array(await crypto.subtle.sign('HMAC',await key(secret(env)),encoder.encode(body))));
  return Object.freeze({token:`${body}.${sig}`,...payload});
}
export async function validateMissionCertificationRun(env,{token,companyId,missionId}){
  if(!token)throw Object.assign(new Error('MISSION_CERTIFICATION_RUN_TOKEN_REQUIRED'),{code:'MISSION_CERTIFICATION_RUN_TOKEN_REQUIRED',status:409});
  if(String(env?.ON_MISSION_CERTIFICATION_ENABLED||'0')!=='1')throw Object.assign(new Error('MISSION_CERTIFICATION_RUN_DISABLED'),{code:'MISSION_CERTIFICATION_RUN_DISABLED',status:409});
  const parts=String(token).split('.');if(parts.length!==2)throw Object.assign(new Error('MISSION_CERTIFICATION_RUN_TOKEN_INVALID'),{code:'MISSION_CERTIFICATION_RUN_TOKEN_INVALID',status:403});
  const [body,sig]=parts;const valid=await crypto.subtle.verify('HMAC',await key(secret(env)),unb64u(sig),encoder.encode(body));if(!valid)throw Object.assign(new Error('MISSION_CERTIFICATION_RUN_TOKEN_INVALID'),{code:'MISSION_CERTIFICATION_RUN_TOKEN_INVALID',status:403});
  let payload;try{payload=JSON.parse(new TextDecoder().decode(unb64u(body)))}catch{throw Object.assign(new Error('MISSION_CERTIFICATION_RUN_TOKEN_INVALID'),{code:'MISSION_CERTIFICATION_RUN_TOKEN_INVALID',status:403});}
  if(payload?.v!==2||payload?.runVersion!==MISSION_CERTIFICATION_RUN_VERSION||Number(payload.companyId)!==Number(companyId)||Number(payload.missionId)!==Number(missionId)||Number(payload.expiresAt)<=Math.floor(Date.now()/1000))throw Object.assign(new Error('MISSION_CERTIFICATION_RUN_TOKEN_SCOPE_INVALID'),{code:'MISSION_CERTIFICATION_RUN_TOKEN_SCOPE_INVALID',status:403});
  const mission=await canonicalFirst(env,'SELECT state_version,updated_at FROM missions WHERE id=? AND company_id=? LIMIT 1',[Number(missionId),Number(companyId)],'mission_authority');
  if(!mission)throw Object.assign(new Error('MISSION_CERTIFICATION_RUN_MISSION_NOT_FOUND'),{code:'MISSION_CERTIFICATION_RUN_MISSION_NOT_FOUND',status:404});
  const currentStateToken=Number(mission.state_version||0)>0?`v:${Number(mission.state_version)}`:String(mission.updated_at||'');
  const plan=await canonicalFirst(env,"SELECT id,plan_hash,context_hash,state_token,status,plan_json FROM mission_plans WHERE id=? AND company_id=? AND mission_id=? LIMIT 1",[Number(payload.planId),Number(companyId),Number(missionId)],'mission_planning_authority');
  const planJson=parse(plan?.plan_json);
  const currentAction=String(planJson?.recommendedAction?.actionCode||'').trim();
  if(!plan||String(plan.status)!=='ACCEPTED'||String(plan.plan_hash||'')!==String(payload.planHash||'')||String(plan.context_hash||'')!==String(payload.contextHash||'')||String(plan.state_token||'')!==String(payload.stateToken||'')||String(payload.stateToken||'')!==currentStateToken||currentAction!==String(payload.actionCode||''))throw Object.assign(new Error('MISSION_CERTIFICATION_RUN_BINDING_STALE'),{code:'MISSION_CERTIFICATION_RUN_BINDING_STALE',status:409});
  return Object.freeze(payload);
}

function parse(value){try{return JSON.parse(String(value??'{}'))||{}}catch{return {}}}
