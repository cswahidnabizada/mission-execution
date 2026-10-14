import {canonicalAll,canonicalFirst} from '../../core/canonical-db.js';

export const AGENT_RECALIBRATION_VERSION='11.09.0';
export const AGENT_CALIBRATION_SIGNAL='DECISION_OUTCOME';
export const MINIMUM_CALIBRATION_SAMPLE=5;

const SCORES=Object.freeze({LOW:0.33,MEDIUM:0.66,HIGH:0.9});
const OUTCOMES=Object.freeze(['RESOLVED','PROGRESSED','UNCHANGED','WORSENED','BLOCKED','WAITING','UNKNOWN']);

export async function recalibrateAgentSignals(env,{companyId=null,limit=200}={}){
  const company=Number(companyId||0)||null;
  const n=Math.min(500,Math.max(1,Number(limit)||200));
  const runId=crypto.randomUUID();
  const startedAt=new Date().toISOString();
  let processedEvents=0;
  let newObservations=0;
  let profilesUpdated=0;
  try{
    const where=company?'AND o.company_id=?':'';
    const args=company?[company,n]:[n];
    const rows=await canonicalAll(env,`SELECT o.event_id,o.decision_id,o.company_id,o.mission_id,o.executor_id,o.action_code,o.outcome_code,o.outcome_confidence,o.execution_status,o.occurred_at,d.confidence AS decision_confidence,d.policy_version FROM agent_outcome_events o JOIN agent_decision_events d ON d.decision_id=o.decision_id WHERE 1=1 ${where} AND NOT EXISTS (SELECT 1 FROM agent_calibration_observations c WHERE c.event_id=o.event_id) ORDER BY o.id ASC LIMIT ?`,args,'agent_recalibration_source');
    processedEvents=(rows||[]).length;
    for(const row of rows||[]){
      const evaluation=evaluateOutcome(row);
      const previous=await canonicalFirst(env,'SELECT observation_hash FROM agent_calibration_observations WHERE company_id=? ORDER BY id DESC LIMIT 1',[Number(row.company_id)],'agent_calibration_observation_store');
      const observation={
        eventId:String(row.event_id),decisionId:String(row.decision_id),companyId:Number(row.company_id),missionId:Number(row.mission_id||0)||null,executorId:Number(row.executor_id||0)||null,
        actionCode:String(row.action_code||''),signalCode:AGENT_CALIBRATION_SIGNAL,predictionConfidence:normalizeConfidence(row.decision_confidence||row.outcome_confidence),observedOutcome:normalizeOutcome(row.outcome_code),
        evaluationClass:evaluation.class,evidenceBasis:evaluation.evidenceBasis,observationVersion:AGENT_RECALIBRATION_VERSION,occurredAt:String(row.occurred_at||new Date().toISOString()),previousObservationHash:previous?.observation_hash||null,
        metadata:{executionStatus:String(row.execution_status||'UNKNOWN'),reason:evaluation.reason}
      };
      observation.observationHash=await sha256(stableStringify(observation));
      try{
        await env.DB.prepare(`INSERT INTO agent_calibration_observations(event_id,decision_id,company_id,mission_id,executor_id,action_code,signal_code,prediction_confidence,observed_outcome,evaluation_class,evidence_basis,observation_version,occurred_at,previous_observation_hash,observation_hash,metadata_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
          observation.eventId,observation.decisionId,observation.companyId,observation.missionId,observation.executorId,observation.actionCode,observation.signalCode,observation.predictionConfidence,observation.observedOutcome,observation.evaluationClass,observation.evidenceBasis,observation.observationVersion,observation.occurredAt,observation.previousObservationHash,observation.observationHash,JSON.stringify(observation.metadata)
        ).run();
        newObservations++;
      }catch(e){
        if(!/UNIQUE|constraint/i.test(String(e?.message||'')))throw e;
      }
    }
    let companies=company?[company]:[...new Set((rows||[]).map(r=>Number(r.company_id)).filter(Boolean))];
    if(!company && !companies.length){
      const profileCompanies=await canonicalAll(env,`SELECT DISTINCT company_id FROM agent_calibration_observations ORDER BY company_id LIMIT 50`,[],'agent_calibration_profile_companies');
      companies=(profileCompanies||[]).map(r=>Number(r.company_id)).filter(Boolean);
    }
    for(const c of companies){profilesUpdated+=await rebuildProfilesForCompany(env,c);}
    const completedAt=new Date().toISOString();
    await env.DB.prepare(`INSERT INTO agent_calibration_runs(run_id,company_id,processed_events,new_observations,profiles_updated,status,calibration_version,started_at,completed_at,metadata_json) VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(runId,company,processedEvents,newObservations,profilesUpdated,'COMPLETED',AGENT_RECALIBRATION_VERSION,startedAt,completedAt,JSON.stringify({minimumSampleSize:MINIMUM_CALIBRATION_SAMPLE,derivedOnly:true,noAuthorizationInference:true})).run();
    return {runId,version:AGENT_RECALIBRATION_VERSION,status:'COMPLETED',companyId:company,processedEvents,newObservations,profilesUpdated,minimumSampleSize:MINIMUM_CALIBRATION_SAMPLE,learningBoundary:{derivedOnly:true,noTruthMutation:true,noAuthorizationInference:true,unknownExcludedFromAccuracy:true}};
  }catch(e){
    const completedAt=new Date().toISOString();
    try{await env.DB.prepare(`INSERT INTO agent_calibration_runs(run_id,company_id,processed_events,new_observations,profiles_updated,status,calibration_version,started_at,completed_at,error_code,metadata_json) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).bind(runId,company,processedEvents,newObservations,profilesUpdated,'FAILED',AGENT_RECALIBRATION_VERSION,startedAt,completedAt,String(e?.code||e?.message||'AGENT_RECALIBRATION_FAILED').slice(0,120),JSON.stringify({derivedOnly:true})).run();}catch{}
    throw e;
  }
}

export async function getAgentCalibration(env,{companyId,actionCode=null,executorId=null,scopeType=null,limit=50}={}){
  const company=Number(companyId||0)||0;
  if(!company)throw Object.assign(new Error('AGENT_CALIBRATION_COMPANY_REQUIRED'),{status:400,code:'AGENT_CALIBRATION_COMPANY_REQUIRED'});
  const n=Math.min(100,Math.max(1,Number(limit)||50));
  const where=['company_id=?'];const args=[company];
  if(actionCode){where.push('action_code=?');args.push(String(actionCode));}
  if(executorId){where.push("scope_type='EXECUTOR'");where.push('scope_key=?');args.push(String(Number(executorId)));}
  if(scopeType){where.push('scope_type=?');args.push(String(scopeType).toUpperCase());}
  const rows=await canonicalAll(env,`SELECT company_id,scope_type,scope_key,signal_code,action_code,profile_version,sample_count,known_count,correct_count,incorrect_count,unknown_count,inconclusive_count,accuracy,mean_confidence,calibration_error,deference_state,minimum_sample_size,last_observation_at,updated_at FROM agent_calibration_profiles WHERE ${where.join(' AND ')} ORDER BY CASE scope_type WHEN 'ORGANIZATION' THEN 0 WHEN 'ACTION' THEN 1 ELSE 2 END,updated_at DESC LIMIT ?`,[...args,n],'agent_calibration_profiles');
  return (rows||[]).map(normalizeProfile);
}

export async function getAgentCalibrationSummary(env,{companyId,actionCodes=[]}={}){
  const company=Number(companyId||0)||0;
  if(!company)throw Object.assign(new Error('AGENT_CALIBRATION_COMPANY_REQUIRED'),{status:400,code:'AGENT_CALIBRATION_COMPANY_REQUIRED'});
  const codes=[...new Set((Array.isArray(actionCodes)?actionCodes:[]).map(v=>String(v||'').trim()).filter(Boolean))].slice(0,64);
  const org=await getAgentCalibration(env,{companyId:company,scopeType:'ORGANIZATION',limit:1});
  const actionProfiles=codes.length?await getAgentCalibration(env,{companyId:company,limit:Math.min(64,codes.length)}):[];
  return {version:AGENT_RECALIBRATION_VERSION,organization:org[0]||null,actions:actionProfiles,learningBoundary:{derivedOnly:true,noAuthorizationInference:true,noTruthMutation:true,unknownExcludedFromAccuracy:true}};
}

export async function listAgentCalibrationProfiles(env,{companyId=null,limit=50}={}){
  const n=Math.min(100,Math.max(1,Number(limit)||50));
  const company=Number(companyId||0)||0;
  const rows=company
    ? await canonicalAll(env,`SELECT company_id,scope_type,scope_key,signal_code,action_code,profile_version,sample_count,known_count,correct_count,incorrect_count,unknown_count,inconclusive_count,accuracy,mean_confidence,calibration_error,deference_state,minimum_sample_size,last_observation_at,updated_at FROM agent_calibration_profiles WHERE company_id=? ORDER BY updated_at DESC LIMIT ?`,[company,n],'agent_calibration_profiles')
    : await canonicalAll(env,`SELECT company_id,scope_type,scope_key,signal_code,action_code,profile_version,sample_count,known_count,correct_count,incorrect_count,unknown_count,inconclusive_count,accuracy,mean_confidence,calibration_error,deference_state,minimum_sample_size,last_observation_at,updated_at FROM agent_calibration_profiles ORDER BY updated_at DESC LIMIT ?`,[n],'agent_calibration_profiles');
  return (rows||[]).map(normalizeProfile);
}

export async function listAgentCalibrationRuns(env,{companyId=null,limit=25}={}){
  const n=Math.min(100,Math.max(1,Number(limit)||25));
  const company=Number(companyId||0)||0;
  const rows=company
    ? await canonicalAll(env,`SELECT run_id,company_id,processed_events,new_observations,profiles_updated,status,calibration_version,started_at,completed_at,error_code,metadata_json FROM agent_calibration_runs WHERE company_id=? ORDER BY id DESC LIMIT ?`,[company,n],'agent_calibration_runs')
    : await canonicalAll(env,`SELECT run_id,company_id,processed_events,new_observations,profiles_updated,status,calibration_version,started_at,completed_at,error_code,metadata_json FROM agent_calibration_runs ORDER BY id DESC LIMIT ?`,[n],'agent_calibration_runs');
  return (rows||[]).map(r=>({...r,company_id:Number(r.company_id||0)||null,processed_events:Number(r.processed_events||0),new_observations:Number(r.new_observations||0),profiles_updated:Number(r.profiles_updated||0),metadata:parseJson(r.metadata_json,{})}));
}

export async function recalibrationStatus(env,{companyId=null}={}){
  const company=Number(companyId||0)||0;
  const [lastRun,pending]=await Promise.all([
    company?canonicalFirst(env,`SELECT run_id,status,completed_at,new_observations,profiles_updated FROM agent_calibration_runs WHERE company_id=? ORDER BY id DESC LIMIT 1`,[company],'agent_calibration_runs'):canonicalFirst(env,`SELECT run_id,status,completed_at,new_observations,profiles_updated FROM agent_calibration_runs ORDER BY id DESC LIMIT 1`,[],'agent_calibration_runs'),
    company?canonicalFirst(env,`SELECT COUNT(*) AS count FROM agent_outcome_events o WHERE o.company_id=? AND NOT EXISTS (SELECT 1 FROM agent_calibration_observations c WHERE c.event_id=o.event_id)`,[company],'agent_recalibration_pending'):canonicalFirst(env,`SELECT COUNT(*) AS count FROM agent_outcome_events o WHERE NOT EXISTS (SELECT 1 FROM agent_calibration_observations c WHERE c.event_id=o.event_id)`,[],'agent_recalibration_pending')
  ]);
  return {version:AGENT_RECALIBRATION_VERSION,pendingObservations:Number(pending?.count||0),lastRun:lastRun?{runId:lastRun.run_id,status:lastRun.status,completedAt:lastRun.completed_at,newObservations:Number(lastRun.new_observations||0),profilesUpdated:Number(lastRun.profiles_updated||0)}:null,minimumSampleSize:MINIMUM_CALIBRATION_SAMPLE,derivedOnly:true,noAuthorizationInference:true};
}

async function rebuildProfilesForCompany(env,companyId){
  const rows=await canonicalAll(env,`SELECT company_id,executor_id,action_code,evaluation_class,prediction_confidence,occurred_at FROM agent_calibration_observations WHERE company_id=? ORDER BY id ASC`,[Number(companyId)],'agent_calibration_observations');
  const groups=new Map();
  for(const row of rows||[]){
    const bases=[['ORGANIZATION','organization'],['ACTION',String(row.action_code||'')]];
    if(Number(row.executor_id||0)>0)bases.push(['EXECUTOR',String(Number(row.executor_id))]);
    for(const [scopeType,scopeKey] of bases){
      const key=`${scopeType}|${scopeKey}|${AGENT_CALIBRATION_SIGNAL}`;
      if(!groups.has(key))groups.set(key,{companyId:Number(row.company_id),scopeType,scopeKey,actionCode:scopeType==='ACTION'?String(row.action_code||''):null,sampleCount:0,knownCount:0,correctCount:0,incorrectCount:0,unknownCount:0,inconclusiveCount:0,confidenceSum:0,confidenceErrorSum:0,lastObservationAt:null});
      const g=groups.get(key);const cls=String(row.evaluation_class);g.sampleCount++;
      if(cls==='CORRECT'||cls==='INCORRECT'){g.knownCount++;if(cls==='CORRECT')g.correctCount++;else g.incorrectCount++;const c=SCORES[normalizeConfidence(row.prediction_confidence)];g.confidenceSum+=c;g.confidenceErrorSum+=Math.abs(c-(cls==='CORRECT'?1:0));}
      else if(cls==='UNKNOWN')g.unknownCount++;else g.inconclusiveCount++;
      if(!g.lastObservationAt||String(row.occurred_at)>g.lastObservationAt)g.lastObservationAt=String(row.occurred_at);
    }
  }
  for(const g of groups.values()){
    const accuracy=g.knownCount?Number((g.correctCount/g.knownCount).toFixed(4)):null;
    const meanConfidence=g.knownCount?Number((g.confidenceSum/g.knownCount).toFixed(4)):null;
    const calibrationError=g.knownCount?Number((g.confidenceErrorSum/g.knownCount).toFixed(4)):null;
    const deference=deriveDeference({knownCount:g.knownCount,accuracy,calibrationError});
    await env.DB.prepare(`INSERT INTO agent_calibration_profiles(company_id,scope_type,scope_key,signal_code,action_code,profile_version,sample_count,known_count,correct_count,incorrect_count,unknown_count,inconclusive_count,confidence_sum,confidence_error_sum,accuracy,mean_confidence,calibration_error,deference_state,minimum_sample_size,last_observation_at,updated_at) VALUES(?,?,?,?,?,1,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(company_id,scope_type,scope_key,signal_code) DO UPDATE SET profile_version=agent_calibration_profiles.profile_version+1,action_code=excluded.action_code,sample_count=excluded.sample_count,known_count=excluded.known_count,correct_count=excluded.correct_count,incorrect_count=excluded.incorrect_count,unknown_count=excluded.unknown_count,inconclusive_count=excluded.inconclusive_count,confidence_sum=excluded.confidence_sum,confidence_error_sum=excluded.confidence_error_sum,accuracy=excluded.accuracy,mean_confidence=excluded.mean_confidence,calibration_error=excluded.calibration_error,deference_state=excluded.deference_state,minimum_sample_size=excluded.minimum_sample_size,last_observation_at=excluded.last_observation_at,updated_at=CURRENT_TIMESTAMP`).bind(g.companyId,g.scopeType,g.scopeKey,AGENT_CALIBRATION_SIGNAL,g.actionCode,g.sampleCount,g.knownCount,g.correctCount,g.incorrectCount,g.unknownCount,g.inconclusiveCount,g.confidenceSum,g.confidenceErrorSum,accuracy,meanConfidence,calibrationError,deference,g.lastObservationAt).run();
  }
  return groups.size;
}

function evaluateOutcome(row){
  const execution=String(row.execution_status||'UNKNOWN').toUpperCase();
  const outcome=normalizeOutcome(row.outcome_code);
  if(execution!=='EXECUTED')return {class:execution==='UNKNOWN'?'UNKNOWN':'INCONCLUSIVE',evidenceBasis:'RECORDED_AGENT_OUTCOME',reason:`EXECUTION_${execution}`};
  if(['RESOLVED','PROGRESSED'].includes(outcome))return {class:'CORRECT',evidenceBasis:'RECORDED_AGENT_OUTCOME',reason:'FAVORABLE_OUTCOME'};
  if(['WORSENED','BLOCKED'].includes(outcome))return {class:'INCORRECT',evidenceBasis:'RECORDED_AGENT_OUTCOME',reason:'ADVERSE_OUTCOME'};
  return {class:'UNKNOWN',evidenceBasis:'RECORDED_AGENT_OUTCOME',reason:`OUTCOME_${outcome}_NOT_SCORABLE`};
}
function deriveDeference({knownCount,accuracy,calibrationError}){if(knownCount<MINIMUM_CALIBRATION_SAMPLE)return 'INSUFFICIENT_DATA';if(accuracy==null||calibrationError==null)return 'DEFER';if(accuracy<0.6||calibrationError>0.25)return 'DEFER';if(accuracy<0.75||calibrationError>0.15)return 'CAUTION';return 'TRUSTED';}
function normalizeProfile(row){return {companyId:Number(row.company_id||0),scopeType:String(row.scope_type||''),scopeKey:String(row.scope_key||''),signalCode:String(row.signal_code||AGENT_CALIBRATION_SIGNAL),actionCode:row.action_code||null,profileVersion:Number(row.profile_version||1),sampleCount:Number(row.sample_count||0),knownCount:Number(row.known_count||0),correctCount:Number(row.correct_count||0),incorrectCount:Number(row.incorrect_count||0),unknownCount:Number(row.unknown_count||0),inconclusiveCount:Number(row.inconclusive_count||0),accuracy:row.accuracy==null?null:Number(row.accuracy),meanConfidence:row.mean_confidence==null?null:Number(row.mean_confidence),calibrationError:row.calibration_error==null?null:Number(row.calibration_error),deferenceState:String(row.deference_state||'INSUFFICIENT_DATA'),minimumSampleSize:Number(row.minimum_sample_size||MINIMUM_CALIBRATION_SAMPLE),lastObservationAt:row.last_observation_at||null,updatedAt:row.updated_at||null,derivedOnly:true,noAuthorizationInference:true};}
function normalizeConfidence(v){const x=String(v||'LOW').toUpperCase();return SCORES[x]?x:'LOW';}
function normalizeOutcome(v){const x=String(v||'UNKNOWN').toUpperCase();return OUTCOMES.includes(x)?x:'UNKNOWN';}
function parseJson(value,fallback){try{const parsed=JSON.parse(String(value||''));return parsed&&typeof parsed==='object'?parsed:fallback;}catch{return fallback;}}
function stableStringify(value){if(value===null||typeof value!=='object')return JSON.stringify(value);if(Array.isArray(value))return `[${value.map(stableStringify).join(',')}]`;return `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;}
async function sha256(value){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(value)));return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');}
