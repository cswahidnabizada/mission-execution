import {RELEASE_VERSION} from '../../core/release.js';
import {canonicalFirst,canonicalAll} from '../../core/canonical-db.js';
import {auditAdminControl} from '../../security/admin-control-audit.service.js';
import {actionDefinition} from '../../application/actions/action-registry.js';
import {evaluateControlledAutonomy,resolveAgentAutonomyPolicy} from './agent-autonomy.service.js';

export const AGENTIC_CONTROL_VERSION='11.05.1';
// Historical safety contract retained: AGENT_HIGH_IMPACT_REQUIRES_HUMAN_APPROVAL remains enforced by Controlled Autonomy policy resolution.
export const AGENTIC_MODES=Object.freeze(['DISABLED','RECOMMEND_ONLY','PREPARE_ONLY','CONTROLLED_EXECUTION']);
export const AGENTIC_RISK_CLASSES=Object.freeze(['READ','ADVISORY','LOW_RISK','OPERATIONAL','HIGH_IMPACT','IRREVERSIBLE']);

export function classifyAgentActionRisk(definition){return classifyRisk(definition);}
export function requiredAgentAutonomy(risk){return requiredAutonomy(risk);}

export async function getAgenticControl(env){
  const row=await canonicalFirst(env,`SELECT id,version,mode,autonomy_level,execution_enabled,policy_version,kill_switch_reason,updated_by_role,updated_by_id,updated_at,created_at FROM agentic_control_config WHERE id=1 LIMIT 1`,[],'agentic_control_config');
  if(!row)throw Object.assign(new Error('AGENTIC_CONTROL_UNAVAILABLE'),{status:503,code:'AUTHORITY_UNAVAILABLE'});
  return normalizeControl(row);
}

export async function updateAgenticControl(env,actor,input={},requestId=null){
  const current=await getAgenticControl(env);
  const mode=String(input.mode||current.mode).toUpperCase();
  const autonomy=Number(input.autonomyLevel==null?current.autonomyLevel:input.autonomyLevel);
  const executionEnabled=Boolean(input.executionEnabled);
  const reason=String(input.killSwitchReason||'').trim().slice(0,500)||null;
  if(!AGENTIC_MODES.includes(mode))throw Object.assign(new Error('AGENTIC_CONTROL_MODE_INVALID'),{status:400,code:'AGENTIC_CONTROL_MODE_INVALID'});
  if(!Number.isInteger(autonomy)||autonomy<0||autonomy>5)throw Object.assign(new Error('AGENTIC_AUTONOMY_LEVEL_INVALID'),{status:400,code:'AGENTIC_AUTONOMY_LEVEL_INVALID'});
  if(mode==='DISABLED'&&!reason)throw Object.assign(new Error('AGENTIC_DISABLE_REASON_REQUIRED'),{status:400,code:'AGENTIC_DISABLE_REASON_REQUIRED'});
  if(!executionEnabled && mode==='CONTROLLED_EXECUTION' && autonomy>=3)throw Object.assign(new Error('AGENTIC_EXECUTION_FLAG_REQUIRED'),{status:409,code:'AGENTIC_EXECUTION_FLAG_REQUIRED'});
  if(executionEnabled && mode!=='CONTROLLED_EXECUTION')throw Object.assign(new Error('AGENTIC_EXECUTION_REQUIRES_CONTROLLED_MODE'),{status:409,code:'AGENTIC_EXECUTION_REQUIRES_CONTROLLED_MODE'});
  if(executionEnabled && autonomy<3)throw Object.assign(new Error('AGENTIC_EXECUTION_REQUIRES_LEVEL_3'),{status:409,code:'AGENTIC_EXECUTION_REQUIRES_LEVEL_3'});
  const next={version:current.version+1,mode,autonomyLevel:autonomy,executionEnabled,policyVersion:String(input.policyVersion||AGENTIC_CONTROL_VERSION).slice(0,80),killSwitchReason:reason,updatedByRole:String(actor?.role||'platform_super_administrator'),updatedById:String(actor?.id||actor?.userId||'platform')};
  await env.DB.prepare(`UPDATE agentic_control_config SET version=?,mode=?,autonomy_level=?,execution_enabled=?,policy_version=?,kill_switch_reason=?,updated_by_role=?,updated_by_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=1 AND version=?`).bind(next.version,next.mode,next.autonomyLevel,next.executionEnabled?1:0,next.policyVersion,next.killSwitchReason,next.updatedByRole,next.updatedById,current.version).run();
  const saved=await getAgenticControl(env);
  await auditAdminControl(env,{actor,action:'platform.agentic.control.updated',resourceType:'agentic_control',resourceId:'1',targetCompanyId:null,requestId,metadata:{version:saved.version,mode:saved.mode,autonomyLevel:saved.autonomyLevel,executionEnabled:saved.executionEnabled,policyVersion:saved.policyVersion,killSwitch:Boolean(saved.killSwitchReason)}});
  return saved;
}

export async function appendAgentDecision(env,input={}){
  const decisionId=String(input.decisionId||'').trim().slice(0,120);
  if(!decisionId)throw Object.assign(new Error('AGENT_DECISION_ID_REQUIRED'),{status:400,code:'AGENT_DECISION_ID_REQUIRED'});
  const companyId=Number(input.companyId||0)||0;
  if(!companyId)throw Object.assign(new Error('AGENT_COMPANY_ID_REQUIRED'),{status:400,code:'AGENT_COMPANY_ID_REQUIRED'});
  const actionCode=String(input.actionCode||'').trim().slice(0,120);
  const definition=actionDefinition(actionCode);
  if(!definition)throw Object.assign(new Error('ACTION_NOT_REGISTERED'),{status:404,code:'ACTION_NOT_REGISTERED'});
  const existing=await canonicalFirst(env,'SELECT event_id,decision_id,event_hash,action_code,company_id,mission_id FROM agent_decision_events WHERE decision_id=? LIMIT 1',[decisionId],'agent_decision_event_store');
  if(existing)return {created:false,idempotent:true,...existing,id:Number(existing.id)};
  const control=await getAgenticControl(env);
  const risk=classifyRisk(definition);
  const autonomyPolicy=await resolveAgentAutonomyPolicy(env,{companyId, countryCode:input.countryCode||'ZZ', sectorCode:input.sectorCode||'general', actionCode});
  const event={
    eventId:String(input.eventId||crypto.randomUUID()).slice(0,120),decisionId,companyId,missionId:Number(input.missionId||0)||null,executorId:Number(input.executorId||0)||null,
    actorType:['agent','human','system'].includes(String(input.actorType||'agent'))?String(input.actorType||'agent'):'agent',agentId:String(input.agentId||'on-mission-agent').slice(0,120),actionCode,
    intent:object(input.intent),contextVersion:String(input.contextVersion||'1.0').slice(0,32),contextHash:String(input.contextHash||'').slice(0,128),plan:object(input.plan),candidates:Array.isArray(input.candidates)?input.candidates.slice(0,64):[],alignment:object(input.alignment),riskClass:risk,confidence:normalizeConfidence(input.confidence),policyVersion:String(input.policyVersion||control.policyVersion).slice(0,80),autonomyLevel:control.autonomyLevel,metadata:object(input.metadata), policyHash:autonomyPolicy.policyHash, policyScope:`${autonomyPolicy.scopeType}:${autonomyPolicy.scopeKey}`, policySnapshot:autonomyPolicy
  };
  if(!event.contextHash)throw Object.assign(new Error('AGENT_CONTEXT_HASH_REQUIRED'),{status:400,code:'AGENT_CONTEXT_HASH_REQUIRED'});
  const previous=await canonicalFirst(env,'SELECT event_hash FROM agent_decision_events WHERE company_id=? ORDER BY id DESC LIMIT 1',[companyId],'agent_decision_event_store');
  event.previousEventHash=previous?.event_hash||null;event.eventHash=await sha256(stableStringify(event));
  await env.DB.prepare(`INSERT INTO agent_decision_events(event_id,decision_id,company_id,mission_id,executor_id,actor_type,agent_id,action_code,intent_json,context_version,context_hash,plan_json,candidates_json,alignment_json,risk_class,confidence,policy_version,autonomy_level,previous_event_hash,event_hash,metadata_json,policy_hash,policy_scope,policy_snapshot_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(event.eventId,event.decisionId,event.companyId,event.missionId,event.executorId,event.actorType,event.agentId,event.actionCode,JSON.stringify(event.intent),event.contextVersion,event.contextHash,JSON.stringify(event.plan),JSON.stringify(event.candidates),JSON.stringify(event.alignment),event.riskClass,event.confidence,event.policyVersion,event.autonomyLevel,event.previousEventHash,event.eventHash,JSON.stringify(event.metadata),event.policyHash,event.policyScope,JSON.stringify(event.policySnapshot)).run();
  return {created:true,idempotent:false,eventId:event.eventId,decisionId:event.decisionId,eventHash:event.eventHash,riskClass:event.riskClass,autonomyLevel:event.autonomyLevel};
}

export async function authorizeAgentExecution(env,{decisionId,companyId,missionId,actionCode,countryCode,sectorCode,providerAvailable=false}={}){
  const control=await getAgenticControl(env);
  const decision=await canonicalFirst(env,`SELECT id,decision_id,company_id,mission_id,action_code,context_hash,risk_class,confidence,policy_version,autonomy_level,policy_hash,policy_scope,policy_snapshot_json FROM agent_decision_events WHERE decision_id=? LIMIT 1`,[String(decisionId||'')],'agent_decision_event_store');
  if(!decision)throw Object.assign(new Error('AGENT_DECISION_NOT_FOUND'),{status:409,code:'AGENT_DECISION_NOT_FOUND'});
  if(Number(decision.company_id)!==Number(companyId||0))throw Object.assign(new Error('AGENT_DECISION_TENANT_MISMATCH'),{status:403,code:'AGENT_DECISION_TENANT_MISMATCH'});
  if(Number(decision.mission_id||0)!==Number(missionId||0))throw Object.assign(new Error('AGENT_DECISION_MISSION_MISMATCH'),{status:409,code:'AGENT_DECISION_MISSION_MISMATCH'});
  if(String(decision.action_code)!==String(actionCode))throw Object.assign(new Error('AGENT_DECISION_ACTION_MISMATCH'),{status:409,code:'AGENT_DECISION_ACTION_MISMATCH'});
  if(!control.executionEnabled||control.mode!=='CONTROLLED_EXECUTION')throw Object.assign(new Error('AGENT_EXECUTION_DISABLED'),{status:423,code:'AGENT_EXECUTION_DISABLED'});
  const policy=await evaluateControlledAutonomy(env,{companyId,countryCode,sectorCode,actionCode,providerAvailable});
  if(String(decision.policy_hash||'')!==String(policy.policy.policyHash||''))throw Object.assign(new Error('AGENT_AUTONOMY_POLICY_CHANGED'),{status:409,code:'AGENT_AUTONOMY_POLICY_CHANGED',policyHash:policy.policy.policyHash});
  if(String(decision.risk_class)!==String(policy.policy.riskClass))throw Object.assign(new Error('AGENT_RISK_CLASS_CHANGED'),{status:409,code:'AGENT_RISK_CLASS_CHANGED'});
  if(!policy.allowed)throw Object.assign(new Error('AGENT_AUTONOMY_POLICY_DEFERRED'),{status:423,code:'AGENT_AUTONOMY_POLICY_DEFERRED',reasons:policy.failures,policy:policy.policy});
  return {allowed:true,control,decision,policy};
}

export async function listAgentDecisions(env,{limit=50,companyId=null,missionId=null}={}){
  const n=Math.min(100,Math.max(1,Number(limit)||50));const where=[];const args=[];if(companyId){where.push('company_id=?');args.push(Number(companyId));}if(missionId){where.push('mission_id=?');args.push(Number(missionId));}const rows=await canonicalAll(env,`SELECT id,decision_id,company_id,mission_id,executor_id,agent_id,action_code,context_version,context_hash,risk_class,confidence,policy_version,autonomy_level,created_at,event_hash FROM agent_decision_events ${where.length?`WHERE ${where.join(' AND ')}`:''} ORDER BY id DESC LIMIT ?`,[...args,n],'agent_decision_event_store');return rows||[];
}
export async function listAgentOutcomes(env,{limit=50,companyId=null,missionId=null}={}){
  const n=Math.min(100,Math.max(1,Number(limit)||50));const where=[];const args=[];if(companyId){where.push('company_id=?');args.push(Number(companyId));}if(missionId){where.push('mission_id=?');args.push(Number(missionId));}const rows=await canonicalAll(env,`SELECT id,event_id,decision_id,company_id,mission_id,executor_id,agent_id,action_code,execution_status,outcome_code,outcome_confidence,state_version_before,state_version_after,model_id,model_version,policy_version,recalibration_version,occurred_at,event_hash FROM agent_outcome_events ${where.length?`WHERE ${where.join(' AND ')}`:''} ORDER BY id DESC LIMIT ?`,[...args,n],'agent_outcome_event_store');return rows||[];
}
function normalizeControl(row){return Object.freeze({version:Number(row.version||1),mode:String(row.mode),autonomyLevel:Number(row.autonomy_level||0),executionEnabled:Boolean(Number(row.execution_enabled)),policyVersion:String(row.policy_version||''),killSwitchReason:row.kill_switch_reason||null,updatedByRole:row.updated_by_role||null,updatedById:row.updated_by_id||null,updatedAt:row.updated_at||null,createdAt:row.created_at||null});}
function classifyRisk(definition){if(definition?.quality?.executionClass==='HIGH_CONSEQUENCE')return definition.confirmation?'HIGH_IMPACT':'OPERATIONAL';if(definition?.confirmation)return 'HIGH_IMPACT';if(definition?.safeByDefault)return 'LOW_RISK';if(definition?.quality?.executionClass==='READ_ONLY')return 'READ';return 'OPERATIONAL';}
function requiredAutonomy(risk){return risk==='READ'?3:risk==='ADVISORY'?3:risk==='LOW_RISK'?3:risk==='OPERATIONAL'?4:5;}
function normalizeConfidence(v){const x=String(v||'LOW').toUpperCase();return ['LOW','MEDIUM','HIGH'].includes(x)?x:'LOW';}
function object(v){return v&&typeof v==='object'&&!Array.isArray(v)?v:{};}
function stableStringify(value){if(value===null||typeof value!=='object')return JSON.stringify(value);if(Array.isArray(value))return `[${value.map(stableStringify).join(',')}]`;return `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;}
async function sha256(value){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(value)));return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');}
