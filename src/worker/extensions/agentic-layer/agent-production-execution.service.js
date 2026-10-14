import {canonicalAll,canonicalFirst} from '../../core/canonical-db.js';
import {RELEASE_VERSION} from '../../core/release.js';
import {getPilotMissionScope} from './agent-customer-pilot.service.js';

export const AGENT_PRODUCTION_EXECUTION_VERSION='12.1.0';
export const PRODUCTION_EXECUTION_MODES=Object.freeze(['PILOT_SUPERVISED','PILOT_CONTROLLED']);

export async function assessProductionMissionReadiness(env,{companyId,missionId,actionCode,productionMode='PILOT_CONTROLLED'}={}){
  const company=Number(companyId||0)||0, mission=Number(missionId||0)||0, action=String(actionCode||'').trim();
  if(!company) throw fail('PRODUCTION_COMPANY_REQUIRED',400);
  if(!mission) throw fail('PRODUCTION_MISSION_REQUIRED',400);
  if(!action) throw fail('PRODUCTION_ACTION_REQUIRED',400);
  const mode=PRODUCTION_EXECUTION_MODES.includes(String(productionMode))?String(productionMode):'PILOT_CONTROLLED';
  const row=await canonicalFirst(env,'SELECT id,company_id,country_code,sector_code,status,state_version,updated_at FROM missions WHERE id=? AND company_id=? LIMIT 1',[mission,company],'mission_authority');
  if(!row) return blocked('MISSION_NOT_FOUND_OR_ACCESS_DENIED');
  const checks=[];
  const pilot=await findPilot(env,{companyId:company,missionId:mission,actionCode:action});
  checks.push({code:'ACTIVE_PILOT',ok:Boolean(pilot?.status==='ACTIVE'),details:pilot?{pilotId:pilot.pilotId,status:pilot.status}:null});
  checks.push({code:'MISSION_ENROLLED',ok:Boolean(pilot?.enrollmentStatus==='ENROLLED'),details:pilot?{enrollmentStatus:pilot.enrollment_status}:null});
  checks.push({code:'ACTION_ALLOWLISTED',ok:Boolean(pilot?.actionAllowed),details:pilot?{actionAllowed:pilot.actionAllowed}:null});
  checks.push({code:'PILOT_WINDOW',ok:Boolean(pilot?.windowOpen),details:pilot?{startAt:pilot.startAt,endAt:pilot.endAt}:null});
  checks.push({code:'PILOT_OPERATING_MODE',ok:Boolean(pilot?.operatingMode==='CONTROLLED_EXECUTION' && pilot?.executable===true),details:pilot?{operatingMode:pilot.operatingMode,executable:Boolean(pilot.executable)}:null});
  checks.push({code:'MISSION_SCOPE',ok:String(row.country_code||'ZZ').toUpperCase()===String(pilot?.country_code||row.country_code||'ZZ').toUpperCase() && String(row.sector_code||'general').toLowerCase()===String(pilot?.sector_code||row.sector_code||'general').toLowerCase(),details:{countryCode:row.country_code||'ZZ',sectorCode:row.sector_code||'general'}});
  const ready=checks.every(c=>c.ok);
  return {version:AGENT_PRODUCTION_EXECUTION_VERSION,ready,productionMode:mode,companyId:company,missionId:mission,actionCode:action,mission:{status:row.status,stateVersion:Number(row.state_version||0),updatedAt:row.updated_at},pilot:pilot||null,checks,authority:{canonicalMissionTruth:true,canonicalAuthorization:true,canonicalActionExecution:true,productionEventLedger:'evidence_only',outcomeLedger:'required'}};
}

export async function requireProductionMissionBoundary(env,input={}){
  const result=await assessProductionMissionReadiness(env,input);
  if(!result.ready) throw Object.assign(new Error('PRODUCTION_MISSION_NOT_READY'),{status:423,code:'PRODUCTION_MISSION_NOT_READY',reasons:result.checks.filter(c=>!c.ok).map(c=>c.code),readiness:result});
  return result;
}

export async function appendProductionExecutionEvent(env,input={}){
  const companyId=Number(input.companyId||0)||0, missionId=Number(input.missionId||0)||0;
  if(!companyId||!missionId) throw fail('PRODUCTION_EVENT_SCOPE_REQUIRED',400);
  const eventId=String(input.eventId||crypto.randomUUID()).slice(0,120);
  const previous=await canonicalFirst(env,'SELECT event_hash FROM agent_production_execution_events WHERE company_id=? ORDER BY id DESC LIMIT 1',[companyId],'agent_production_execution_event_store');
  const event={eventId,attemptId:String(input.attemptId||'').slice(0,120)||null,decisionId:String(input.decisionId||'').slice(0,120)||null,companyId,missionId,actionCode:String(input.actionCode||'').slice(0,120),eventType:String(input.eventType||'BOUNDARY_ACCEPTED'),productionMode:PRODUCTION_EXECUTION_MODES.includes(String(input.productionMode))?String(input.productionMode):'PILOT_CONTROLLED',pilotId:String(input.pilotId||'').slice(0,120)||null,countryCode:String(input.countryCode||'ZZ').toUpperCase().slice(0,8),sectorCode:String(input.sectorCode||'general').toLowerCase().slice(0,80),policyVersion:String(input.policyVersion||'').slice(0,80)||null,policyHash:String(input.policyHash||'').slice(0,128)||null,contextHash:String(input.contextHash||'').slice(0,128)||null,requestHash:String(input.requestHash||'').slice(0,128)||null,outcomeEventId:String(input.outcomeEventId||'').slice(0,120)||null,evidence:input.evidence&&typeof input.evidence==='object'?input.evidence:{},occurredAt:String(input.occurredAt||new Date().toISOString()),previousEventHash:previous?.event_hash||null,metadata:input.metadata&&typeof input.metadata==='object'?input.metadata:{},version:RELEASE_VERSION};
  event.eventHash=await sha256(stableStringify(event));
  await env.DB.prepare(`INSERT INTO agent_production_execution_events(event_id,attempt_id,decision_id,company_id,mission_id,action_code,event_type,production_mode,pilot_id,country_code,sector_code,policy_version,policy_hash,context_hash,request_hash,outcome_event_id,evidence_json,occurred_at,previous_event_hash,event_hash,metadata_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(event.eventId,event.attemptId,event.decisionId,event.companyId,event.missionId,event.actionCode,event.eventType,event.productionMode,event.pilotId,event.countryCode,event.sectorCode,event.policyVersion,event.policyHash,event.contextHash,event.requestHash,event.outcomeEventId,JSON.stringify(event.evidence),event.occurredAt,event.previousEventHash,event.eventHash,JSON.stringify(event.metadata)).run();
  return {eventId:event.eventId,eventHash:event.eventHash,eventType:event.eventType};
}

export async function listProductionExecutionEvents(env,{companyId,missionId=null,pilotId=null,limit=50}={}){
  const c=Number(companyId||0)||0;if(!c)throw fail('PRODUCTION_COMPANY_REQUIRED',400);
  const n=Math.min(100,Math.max(1,Number(limit)||50));const where=['company_id=?'],args=[c];
  if(missionId){where.push('mission_id=?');args.push(Number(missionId));}
  if(pilotId){where.push('pilot_id=?');args.push(String(pilotId));}
  const rows=await canonicalAll(env,`SELECT * FROM agent_production_execution_events WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT ?`,[...args,n],'agent_production_execution_event_store');
  return (rows||[]).map(r=>({...r,id:Number(r.id),evidence:json(r.evidence_json),metadata:json(r.metadata_json)}));
}

async function findPilot(env,{companyId,missionId,actionCode}){
  const scope=await getPilotMissionScope(env,{companyId,missionId,actionCode});
  if(!scope.enrolled)return null;
  return {
    pilotId:scope.pilotId,
    countryCode:scope.countryCode,
    sectorCode:scope.sectorCode,
    status:scope.pilotStatus||'UNKNOWN',
    operatingMode:scope.operatingMode,
    executable:Boolean(scope.executable),
    actionAllowed:Boolean(scope.actionAllowed),
    windowOpen:Boolean(scope.windowOpen),
    enrollmentStatus:scope.enrollmentStatus||'ENROLLED',
    startAt:scope.startAt||null,
    endAt:scope.endAt||null
  };
}
function blocked(code){return {version:AGENT_PRODUCTION_EXECUTION_VERSION,ready:false,checks:[{code,ok:false}],authority:{canonicalMissionTruth:true,canonicalAuthorization:true,canonicalActionExecution:true}};}
function json(v){try{return v?JSON.parse(v):{};}catch{return {};}}
function fail(code,status){return Object.assign(new Error(code),{status,code});}
function stableStringify(v){if(v===null||typeof v!=='object')return JSON.stringify(v);if(Array.isArray(v))return `[${v.map(stableStringify).join(',')}]`;return `{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${stableStringify(v[k])}`).join(',')}}`;}
async function sha256(v){const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(v)));return [...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,'0')).join('');}
