import {canonicalAll,canonicalFirst} from '../../core/canonical-db.js';
import {getAgentMissionOutcomeHistory} from './mission-outcome-history.service.js';

export const AGENT_SEMANTIC_VERSION='11.08.1';
export const AGENT_EMBEDDING_MODEL='@cf/baai/bge-base-en-v1.5';
export const AGENT_EMBEDDING_DIMENSIONS=768;
export const AGENT_VECTOR_NAMESPACE_PREFIX='company:';

const MAX_RESULTS=8;
const MAX_DOCUMENT_CHARS=6000;

export function semanticRuntimeStatus(env){
  return Object.freeze({
    version:AGENT_SEMANTIC_VERSION,
    enabled:Boolean(env?.AI&&env?.AGENT_VECTORIZE),
    embeddingProvider:env?.AI?'cloudflare_workers_ai':null,
    vectorProvider:env?.AGENT_VECTORIZE?'cloudflare_vectorize':null,
    embeddingModel:AGENT_EMBEDDING_MODEL,
    dimensions:AGENT_EMBEDDING_DIMENSIONS,
    tenantNamespaceRequired:true,
    retrievalIsAdvisory:true,
    canonicalRevalidationRequired:true
  });
}

export async function semanticMemorySummary(env){
  const row=await canonicalFirst(env,`SELECT COUNT(*) AS total_documents, COUNT(DISTINCT company_id) AS tenant_count, SUM(CASE WHEN status='INDEXED' THEN 1 ELSE 0 END) AS indexed_documents, SUM(CASE WHEN status='PENDING' THEN 1 ELSE 0 END) AS pending_documents, SUM(CASE WHEN status='RETRY' THEN 1 ELSE 0 END) AS retry_documents, SUM(CASE WHEN status='DISABLED' THEN 1 ELSE 0 END) AS disabled_documents, MAX(last_indexed_at) AS last_indexed_at FROM agent_semantic_memory_documents` ,[],'agent_semantic_memory_documents');
  return {totalDocuments:Number(row?.total_documents||0),tenantCount:Number(row?.tenant_count||0),indexedDocuments:Number(row?.indexed_documents||0),pendingDocuments:Number(row?.pending_documents||0),retryDocuments:Number(row?.retry_documents||0),disabledDocuments:Number(row?.disabled_documents||0),lastIndexedAt:row?.last_indexed_at||null};
}

export async function verifySemanticRuntime(env){
  const startedAt=Date.now();
  const status=semanticRuntimeStatus(env);
  const summary=await semanticMemorySummary(env);
  const result={version:AGENT_SEMANTIC_VERSION,state:'UNAVAILABLE',healthy:false,status,summary,checkedAt:new Date().toISOString(),durationMs:0,checks:{workersAI:{configured:Boolean(env?.AI),ok:false,dimensions:null},vectorize:{configured:Boolean(env?.AGENT_VECTORIZE),ok:false,matches:0},tenantIsolation:{required:true,ok:true},advisoryBoundary:{retrievalIsAdvisory:true,canonicalRevalidationRequired:true}}};
  if(!env?.AI||!env?.AGENT_VECTORIZE){result.state=status.enabled?'READY':'UNAVAILABLE';result.durationMs=Date.now()-startedAt;return result;}
  try{
    const embeddingResponse=await env.AI.run(AGENT_EMBEDDING_MODEL,{text:['ON Mission semantic runtime verification']});
    const vector=embeddingResponse?.data?.[0];
    result.checks.workersAI.dimensions=Array.isArray(vector)?vector.length:null;
    result.checks.workersAI.ok=Array.isArray(vector)&&vector.length===AGENT_EMBEDDING_DIMENSIONS;
    if(!result.checks.workersAI.ok){result.state='DEGRADED';result.durationMs=Date.now()-startedAt;return result;}
    const vectorResult=await env.AGENT_VECTORIZE.query(vector,{topK:1,namespace:`${AGENT_VECTOR_NAMESPACE_PREFIX}__platform_health__`});
    result.checks.vectorize.ok=true;
    result.checks.vectorize.matches=Array.isArray(vectorResult?.matches)?vectorResult.matches.length:0;
    result.state='READY';result.healthy=true;
  }catch(_error){
    result.state='DEGRADED';
  }
  result.durationMs=Date.now()-startedAt;
  return result;
}

export async function projectMissionTrajectoryForSemanticMemory(env,{companyId,missionId}={}){
  const company=Number(companyId||0)||0;const mission=Number(missionId||0)||0;
  if(!company)throw error('AGENT_SEMANTIC_COMPANY_REQUIRED',400);
  if(!mission)throw error('AGENT_SEMANTIC_MISSION_REQUIRED',400);
  const history=await getAgentMissionOutcomeHistory(env,{companyId:company,missionId:mission,limit:40});
  const docs=[];
  for(const step of history.trajectory||[]){
    const sourceId=`${mission}:${step.sequence}`;
    const text=buildTrajectoryText(history,step);
    const contentHash=await sha256(text);
    const vectorId=await stableVectorId(company,sourceId,contentHash);
    docs.push({companyId:company,missionId:mission,sourceType:'mission_trajectory',sourceId,sequence:step.sequence,text,contentHash,vectorId,status:'PENDING'});
  }
  if(!docs.length)return {version:AGENT_SEMANTIC_VERSION,projected:0,pending:0,documents:[]};
  const statements=docs.map(d=>env.DB.prepare(`INSERT INTO agent_semantic_memory_documents(company_id,mission_id,source_type,source_id,sequence,content_text,content_hash,vector_id,status,embedding_model,embedding_version,updated_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT(company_id,source_type,source_id) DO UPDATE SET mission_id=excluded.mission_id,sequence=excluded.sequence,content_text=excluded.content_text,content_hash=excluded.content_hash,vector_id=excluded.vector_id,status=CASE WHEN agent_semantic_memory_documents.content_hash=excluded.content_hash THEN agent_semantic_memory_documents.status ELSE 'PENDING' END,embedding_model=excluded.embedding_model,embedding_version=excluded.embedding_version,updated_at=CURRENT_TIMESTAMP`).bind(d.companyId,d.missionId,d.sourceType,d.sourceId,d.sequence,d.text,d.contentHash,d.vectorId,d.status,AGENT_EMBEDDING_MODEL,AGENT_SEMANTIC_VERSION));
  await env.DB.batch(statements);
  return {version:AGENT_SEMANTIC_VERSION,projected:docs.length,pending:docs.filter(d=>d.status==='PENDING').length,documents:docs.map(publicDocument)};
}

export async function indexAgentSemanticMemory(env,{companyId,missionId=null,limit=20}={}){
  const company=Number(companyId||0)||0;if(!company)throw error('AGENT_SEMANTIC_COMPANY_REQUIRED',400);
  if(!env?.AI||!env?.AGENT_VECTORIZE)throw error('AGENT_SEMANTIC_PROVIDER_UNAVAILABLE',503);
  const n=Math.min(40,Math.max(1,Number(limit)||20));
  const where=['company_id=?','status IN (\'PENDING\',\'RETRY\')'];const args=[company];
  if(Number(missionId||0)){where.push('mission_id=?');args.push(Number(missionId));}
  const rows=await canonicalAll(env,`SELECT id,company_id,mission_id,source_type,source_id,sequence,content_text,content_hash,vector_id,status,embedding_model,embedding_version FROM agent_semantic_memory_documents WHERE ${where.join(' AND ')} ORDER BY id ASC LIMIT ?`,[...args,n],'agent_semantic_memory_documents');
  if(!rows?.length)return {version:AGENT_SEMANTIC_VERSION,indexed:0,pending:0};
  const texts=rows.map(r=>String(r.content_text||'').slice(0,MAX_DOCUMENT_CHARS));
  const embeddingResponse=await env.AI.run(AGENT_EMBEDDING_MODEL,{text:texts});
  const vectors=Array.isArray(embeddingResponse?.data)?embeddingResponse.data:[];
  if(vectors.length!==rows.length)throw error('AGENT_SEMANTIC_EMBEDDING_COUNT_MISMATCH',502);
  const payload=rows.map((r,i)=>({id:String(r.vector_id),values:vectors[i],namespace:`${AGENT_VECTOR_NAMESPACE_PREFIX}${company}`,metadata:{companyId:String(company),missionId:String(r.mission_id),sourceType:String(r.source_type),sourceId:String(r.source_id),contentHash:String(r.content_hash),version:AGENT_SEMANTIC_VERSION}}));
  await env.AGENT_VECTORIZE.upsert(payload);
  const updates=rows.map(r=>env.DB.prepare(`UPDATE agent_semantic_memory_documents SET status='INDEXED',last_indexed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=? AND content_hash=?`).bind(r.id,company,r.content_hash));
  await env.DB.batch(updates);
  return {version:AGENT_SEMANTIC_VERSION,indexed:rows.length,pending:0};
}

export async function searchAgentSemanticMemory(env,{companyId,query,limit=5,missionId=null,accessCheck=null}={}){
  const company=Number(companyId||0)||0;if(!company)throw error('AGENT_SEMANTIC_COMPANY_REQUIRED',400);
  const q=String(query||'').trim().slice(0,4000);if(!q)throw error('AGENT_SEMANTIC_QUERY_REQUIRED',400);
  if(!env?.AI||!env?.AGENT_VECTORIZE)throw error('AGENT_SEMANTIC_PROVIDER_UNAVAILABLE',503);
  const topK=Math.min(MAX_RESULTS,Math.max(1,Number(limit)||5));
  const embeddingResponse=await env.AI.run(AGENT_EMBEDDING_MODEL,{text:[q]});
  const vector=embeddingResponse?.data?.[0];
  if(!Array.isArray(vector)||vector.length!==AGENT_EMBEDDING_DIMENSIONS)throw error('AGENT_SEMANTIC_QUERY_EMBEDDING_INVALID',502);
  const vectorResult=await env.AGENT_VECTORIZE.query(vector,{topK,namespace:`${AGENT_VECTOR_NAMESPACE_PREFIX}${company}`,returnMetadata:'all'});
  const matches=Array.isArray(vectorResult?.matches)?vectorResult.matches:[];
  if(!matches.length)return {version:AGENT_SEMANTIC_VERSION,results:[],retrieval:{provider:'cloudflare_vectorize',tenantScoped:true,revalidated:true}};
  const ids=matches.map(m=>String(m.id)).filter(Boolean);const placeholders=ids.map(()=>'?').join(',');
  const rows=await canonicalAll(env,`SELECT id,company_id,mission_id,source_type,source_id,sequence,content_text,content_hash,vector_id,status,updated_at FROM agent_semantic_memory_documents WHERE company_id=? AND status='INDEXED' AND vector_id IN (${placeholders})`,[company,...ids],'agent_semantic_memory_documents');
  const byVector=new Map((rows||[]).map(r=>[String(r.vector_id),r]));
  const filtered=[];
  for(const match of matches){
    const row=byVector.get(String(match.id));if(!row||Number(row.company_id)!==company)continue;
    if(Number(missionId||0)&&Number(row.mission_id)!==Number(missionId))continue;
    if(typeof accessCheck==='function' && !(await accessCheck(Number(row.mission_id))))continue;
    const canonical=await canonicalFirst(env,`SELECT id,company_id,status,state_version,updated_at FROM missions WHERE id=? AND company_id=? LIMIT 1`,[Number(row.mission_id),company],'mission_authority');
    if(!canonical)continue;
    filtered.push({id:Number(row.id),missionId:Number(row.mission_id),sourceType:String(row.source_type),sourceId:String(row.source_id),sequence:Number(row.sequence||0),similarity:Number(match.score||0),content:String(row.content_text||''),contentHash:String(row.content_hash||''),currentMission:{status:String(canonical.status||''),stateVersion:Number(canonical.state_version||0)||null,updatedAt:canonical.updated_at||null},advisoryOnly:true,authorizationInference:false});
  }
  return {version:AGENT_SEMANTIC_VERSION,results:filtered,retrieval:{provider:'cloudflare_vectorize',tenantScoped:true,revalidated:true,currentTruthWins:true}};
}

export async function listSemanticMemoryDocuments(env,{companyId,missionId=null,limit=50}={}){
  const company=Number(companyId||0)||0;if(!company)throw error('AGENT_SEMANTIC_COMPANY_REQUIRED',400);
  const n=Math.min(100,Math.max(1,Number(limit)||50));const where=['company_id=?'];const args=[company];
  if(Number(missionId||0)){where.push('mission_id=?');args.push(Number(missionId));}
  const rows=await canonicalAll(env,`SELECT id,company_id,mission_id,source_type,source_id,sequence,content_hash,vector_id,status,embedding_model,embedding_version,last_indexed_at,updated_at FROM agent_semantic_memory_documents WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT ?`,[...args,n],'agent_semantic_memory_documents');
  return (rows||[]).map(r=>({id:Number(r.id),companyId:Number(r.company_id),missionId:Number(r.mission_id),sourceType:r.source_type,sourceId:r.source_id,sequence:Number(r.sequence||0),contentHash:r.content_hash,vectorId:r.vector_id,status:r.status,embeddingModel:r.embedding_model,embeddingVersion:r.embedding_version,lastIndexedAt:r.last_indexed_at,updatedAt:r.updated_at}));
}

export async function processPendingAgentSemanticMemory(env,{companyId=null,limit=40}={}){
  const company=Number(companyId||0)||0;
  if(!env?.AI||!env?.AGENT_VECTORIZE)return {version:AGENT_SEMANTIC_VERSION,available:false,indexed:0};
  const rows=await canonicalAll(env,`SELECT DISTINCT company_id FROM agent_semantic_memory_documents WHERE status IN ('PENDING','RETRY') ${company?'AND company_id=?':''} ORDER BY company_id LIMIT ?`,company?[company,Math.min(20,Math.max(1,Number(limit)||20))]:[Math.min(20,Math.max(1,Number(limit)||20))],'agent_semantic_memory_documents');
  let indexed=0;
  for(const row of rows||[]){
    const result=await indexAgentSemanticMemory(env,{companyId:Number(row.company_id),limit});
    indexed+=Number(result.indexed||0);
  }
  return {version:AGENT_SEMANTIC_VERSION,available:true,indexed};
}

export async function deleteSemanticMemoryForCompany(env,companyId){
  const company=Number(companyId||0)||0;if(!company)throw error('AGENT_SEMANTIC_COMPANY_REQUIRED',400);
  const rows=await canonicalAll(env,`SELECT vector_id,status FROM agent_semantic_memory_documents WHERE company_id=?`,[company],'agent_semantic_memory_documents');
  const indexed=(rows||[]).filter(r=>String(r.status)==='INDEXED').map(r=>String(r.vector_id)).filter(Boolean);
  if(indexed.length){if(!env?.AGENT_VECTORIZE)throw error('AGENT_SEMANTIC_VECTOR_DELETE_UNAVAILABLE',503);await env.AGENT_VECTORIZE.deleteByIds(indexed);}
  await env.DB.prepare(`DELETE FROM agent_semantic_memory_documents WHERE company_id=?`).bind(company).run();
  return {deletedDocuments:(rows||[]).length,deletedVectors:indexed.length};
}

export function buildSemanticQueryFromAgentContext(context){
  const mission=context?.canonical?.mission||{};const situation=context?.situation||{};const history=context?.missionHistory||{};const currentStatus=String(mission?.status||'');
  const next=history?.nextSituation?.status||'';const conditions=situation?.conditions||{};const blockers=Array.isArray(conditions?.exceptions)?conditions.exceptions.map(x=>x?.type||x?.code).filter(Boolean).slice(0,8):[];
  return [`Mission status: ${currentStatus}`,`Next situation: ${next}`,`Readiness: ${situation?.userSituation?.readiness||''}`,`Open blockers: ${blockers.join(', ')}`,`Recent trajectory: ${(history?.trajectory||[]).slice(-5).map(x=>`${x?.action?.code||''} -> ${x?.outcome?.code||''}`).join('; ')}`].join('\n').slice(0,4000);
}

function buildTrajectoryText(history,step){
  const intent=step.intent&&typeof step.intent==='object'?step.intent:{};
  const plan=step.execution?.plan&&typeof step.execution.plan==='object'?step.execution.plan:{};
  const evidence=Array.isArray(step.evidence)?step.evidence.slice(0,8).map(e=>({type:e?.type||e?.kind||null,code:e?.code||null})):[];
  const compact={missionId:history.missionId,sequence:step.sequence,situation:step.situation?.status||'',intent:{goal:String(intent.goal||intent.objective||'').slice(0,240)},action:step.action?.code||'',execution:step.execution?.status||'',result:step.result?.situation?.status||'',outcome:step.outcome?.code||'UNKNOWN',recovery:{required:Boolean(step.recovery?.required),observed:Boolean(step.recovery?.observed),source:step.recovery?.source||null},nextSituation:step.nextSituation?.status||'',evidence};
  return `ON Mission operational memory. Derived historical pattern only; not current truth. ${JSON.stringify(compact)}`.slice(0,MAX_DOCUMENT_CHARS);
}
function publicDocument(d){return {missionId:d.missionId,sourceType:d.sourceType,sourceId:d.sourceId,sequence:d.sequence,contentHash:d.contentHash,vectorId:d.vectorId,status:d.status};}
async function stableVectorId(company,sourceId,contentHash){return `am-${company}-${await sha256(`${sourceId}:${contentHash}`).then(x=>x.slice(0,40))}`;}
function error(code,status){return Object.assign(new Error(code),{status,code});}
async function sha256(value){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(value)));return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');}
