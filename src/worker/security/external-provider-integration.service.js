import {canonicalAll,canonicalFirst} from '../core/canonical-db.js';
import {resolveExternalProviderGovernance,recordExternalProviderAudit} from './external-provider-governance.service.js';
import {RELEASE_VERSION} from '../core/release.js';

export const EXTERNAL_PROVIDER_INTEGRATION_VERSION='11.15.0';
const MAX_RESPONSE_BYTES=262144;
const METHODS=new Set(['POST','PUT','PATCH','DELETE']);
const VERIFY_METHODS=new Set(['GET','POST']);
const json=v=>{try{return v?JSON.parse(String(v)):{};}catch{return {};}};
const list=v=>{const x=json(v);return Array.isArray(x)?Array.from(new Set(x.map(String).filter(Boolean))):[];};
const fail=(code,status=503,extra={})=>Object.assign(new Error(code),{status,code,...extra});
async function executionEnvironment(env,companyId){
 const row=await canonicalFirst(env,`SELECT environment_code,status,side_effect_policy_code,metadata_json FROM platform_environment_profiles WHERE company_id=? LIMIT 1`,[Number(companyId)],'execution_environment_authority');
 if(!row)return {code:'PRODUCTION',status:'ACTIVE',sideEffectPolicy:'REAL_OPERATIONAL_EFFECTS',metadata:{}};
 let metadata={};try{metadata=JSON.parse(String(row.metadata_json||'{}'))||{};}catch{}
 return {code:String(row.environment_code||'PRODUCTION'),status:String(row.status||'ACTIVE'),sideEffectPolicy:String(row.side_effect_policy_code||''),metadata};
}
function isSimulationProvider(provider){
 let metadata={};try{metadata=JSON.parse(String(provider?.metadata_json||'{}'))||{};}catch{}
 return String(provider?.adapter_type||'')==='in_app' && metadata.simulationOnly===true;
}
async function assertExecutionBoundary(env,{provider,companyId,missionId,executionIntentId,actionCode}){
 if(!executionIntentId)throw fail('EXECUTION_INTENT_REQUIRED_FOR_PROVIDER_EFFECT',403);
 const intentRow=await canonicalFirst(env,'SELECT intent_id,attempt_id,company_id,mission_id,action_code,status FROM mission_execution_intents WHERE intent_id=? LIMIT 1',[String(executionIntentId)],'execution_intent_authority');
 if(!intentRow)throw fail('EXECUTION_INTENT_NOT_FOUND',404);
 const intent={intentId:String(intentRow.intent_id),attemptId:String(intentRow.attempt_id),companyId:Number(intentRow.company_id),missionId:Number(intentRow.mission_id),actionCode:String(intentRow.action_code),status:String(intentRow.status)};
 if(Number(intent.companyId)!==Number(companyId)||Number(intent.missionId)!==Number(missionId)||String(intent.actionCode)!==String(actionCode))throw fail('EXECUTION_INTENT_SCOPE_MISMATCH',403);
 if(String(intent.status)!=='READY_FOR_PROVIDER')throw fail('EXECUTION_INTENT_NOT_READY_FOR_PROVIDER',409);
 const environment=await executionEnvironment(env,companyId);
 if(environment.status!=='ACTIVE')throw fail('EXECUTION_ENVIRONMENT_NOT_ACTIVE',409);
 if(environment.code==='DEMO')throw fail('DEMO_EXTERNAL_EFFECT_BLOCKED',403);
 if((environment.code==='TEST'||environment.code==='CERTIFICATION')&&!isSimulationProvider(provider))throw fail('NON_PRODUCTION_REAL_PROVIDER_BLOCKED',403);
 return {intent,environment};
}


export async function listExternalProviderCapabilities(env,{providerCode=null,actionCode=null,activeOnly=true,limit=100,companyId=0}={}){
 const n=Math.min(200,Math.max(1,Number(limit)||100));const w=[];const a=[];
 let tenantCountry='';
 if(Number(companyId)>0){
   const tenant=await canonicalFirst(env,`SELECT country_code,sector_code FROM company_management_profiles WHERE company_id=? LIMIT 1`,[Number(companyId)],'tenant_management_authority');
   tenantCountry=String(tenant?.country_code||'').toUpperCase();
   if(tenantCountry)w.push(`(p.country_code=? OR p.country_code='ZZ')`),a.push(tenantCountry);
 }
 if(providerCode){w.push('c.provider_code=?');a.push(String(providerCode));}
 if(actionCode){w.push('c.action_code=?');a.push(String(actionCode));}
 if(activeOnly)w.push('c.active=1');
 w.push(`p.contract_status IN ('approved','configured')`);
 const rows=await canonicalAll(env,`SELECT c.id,c.provider_code,c.capability_code,c.action_code,c.adapter_type,c.verification_required,c.timeout_ms,c.active,c.version,p.name provider_name,p.provider_type,p.contract_status,p.country_code provider_country,p.region_code provider_region FROM external_provider_capabilities c JOIN external_provider_registry p ON p.code=c.provider_code ${w.length?`WHERE ${w.join(' AND ')}`:''} ORDER BY c.active DESC,c.provider_code,c.action_code,c.version DESC LIMIT ?`,[...a,n],'external_provider_capability_resolution');
 return rows;
}


export async function upsertExternalProviderCapability(env,actor,{providerCode,capabilityCode,actionCode,adapterType='http_json',executePath,executeMethod='POST',verifyPath,verifyMethod='GET',credentialBinding=null,authorizationHeader='Authorization',authorizationPrefix='Bearer',requestFields=[],verificationRequired=true,verificationSuccessValues=[true,'VERIFIED','SUCCEEDED','SUCCESS'],timeoutMs=10000,active=true,metadata={}}={}){
 if(!providerCode||!capabilityCode||!actionCode)throw fail('PROVIDER_CAPABILITY_FIELDS_REQUIRED',400);
 if(!['http_json','in_app'].includes(adapterType))throw fail('PROVIDER_ADAPTER_TYPE_UNSUPPORTED',400);
 if(adapterType==='in_app')executePath=executePath||'/__internal/simulated';
 if(!executePath||!String(executePath).startsWith('/'))throw fail('PROVIDER_EXECUTE_PATH_REQUIRED',400);
 if(Number(verificationRequired)===1&&(!verifyPath||!String(verifyPath).startsWith('/')))throw fail('PROVIDER_VERIFY_PATH_REQUIRED',400);
 if(!METHODS.has(String(executeMethod).toUpperCase())||!VERIFY_METHODS.has(String(verifyMethod).toUpperCase()))throw fail('PROVIDER_METHOD_INVALID',400);
 const provider=await canonicalFirst(env,'SELECT code,active,contract_status FROM external_provider_registry WHERE code=? LIMIT 1',[String(providerCode)],'external_provider_registry');
 if(!provider)throw fail('PROVIDER_NOT_FOUND',404);if(Number(provider.active)!==1)throw fail('PROVIDER_INACTIVE',409);if(!['approved','configured'].includes(String(provider.contract_status)))throw fail('PROVIDER_NOT_APPROVED',409);
 const existing=await canonicalFirst(env,'SELECT id FROM external_provider_capabilities WHERE provider_code=? AND action_code=? AND version=? LIMIT 1',[String(providerCode),String(actionCode),'1'],'external_provider_capabilities');
 const values=[String(providerCode),String(capabilityCode),String(actionCode),'http_json',String(executePath),String(executeMethod).toUpperCase(),verifyPath?String(verifyPath):null,String(verifyMethod).toUpperCase(),credentialBinding?String(credentialBinding).slice(0,120):null,String(authorizationHeader).slice(0,80),String(authorizationPrefix).slice(0,40),JSON.stringify(Array.from(new Set((Array.isArray(requestFields)?requestFields:[]).map(String).filter(Boolean)))),Number(verificationRequired)===1?1:0,JSON.stringify(Array.isArray(verificationSuccessValues)?verificationSuccessValues:[true,'VERIFIED','SUCCEEDED','SUCCESS']),Math.min(30000,Math.max(1000,Number(timeoutMs)||10000)),active?1:0,'1',JSON.stringify(metadata&&typeof metadata==='object'?metadata:{})];
 if(existing)await env.DB.prepare(`UPDATE external_provider_capabilities SET capability_code=?,adapter_type=?,execute_path=?,execute_method=?,verify_path=?,verify_method=?,credential_binding=?,authorization_header=?,authorization_prefix=?,request_fields_json=?,verification_required=?,verification_success_values_json=?,timeout_ms=?,active=?,metadata_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(values[1],values[3],values[4],values[5],values[6],values[7],values[8],values[9],values[10],values[11],values[12],values[13],values[14],values[15],values[17],Number(existing.id)).run();
 else await env.DB.prepare(`INSERT INTO external_provider_capabilities(provider_code,capability_code,action_code,adapter_type,execute_path,execute_method,verify_path,verify_method,credential_binding,authorization_header,authorization_prefix,request_fields_json,verification_required,verification_success_values_json,timeout_ms,active,version,metadata_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(...values).run();
 return canonicalFirst(env,'SELECT * FROM external_provider_capabilities WHERE provider_code=? AND action_code=? AND version=? LIMIT 1',[String(providerCode),String(actionCode),'1'],'external_provider_capabilities');
}

export async function resolveExternalProviderCapability(env,{companyId,countryCode='ZZ',sectorCode='general',actionCode}={}){
 const action=String(actionCode||'').trim();if(!action)throw fail('PROVIDER_ACTION_REQUIRED',400);
 const cc=String(countryCode||'ZZ').toUpperCase();
 const rows=await canonicalAll(env,`SELECT c.*,p.name provider_name,p.provider_type,p.endpoint,p.contract_status,p.active provider_active,p.country_code provider_country,p.region_code provider_region,p.residency_mode,p.transfer_mechanism FROM external_provider_capabilities c JOIN external_provider_registry p ON p.code=c.provider_code WHERE c.action_code=? AND c.active=1 AND p.active=1 AND p.contract_status IN ('approved','configured') ORDER BY CASE WHEN p.country_code=? THEN 0 WHEN p.country_code='ZZ' THEN 1 ELSE 2 END,c.version DESC,c.id DESC LIMIT 20`,[action,cc],'external_provider_capability_resolution');
 const scoped=rows.filter(x=>providerScopeMatches(x,{countryCode:cc,sectorCode}));
 return scoped[0]||null;
}

export async function dispatchExternalProviderOperation(env,{provider,companyId,missionId,attemptId,executionIntentId=null,actionCode,idempotencyKey,payload={},countryCode='ZZ',sectorCode='general',requestId=null}={}){
 if(!provider) return {configured:false,executed:false,verification:'NOT_CONFIGURED'};
 const boundary=await assertExecutionBoundary(env,{provider,companyId,missionId,executionIntentId,actionCode});
 const adapter=String(provider.adapter_type||'');
 const fields=list(provider.request_fields_json);
 const safePayload={missionId:Number(missionId),companyId:Number(companyId),actionCode:String(actionCode),idempotencyKey:String(idempotencyKey),executionIntentId:String(executionIntentId),payload:pickFields(payload,fields)};
 const governance=await resolveExternalProviderGovernance(env,{providerCode:provider.provider_code,companyId,countryCode,purposeCode:'mission_execution',classification:'CONFIDENTIAL',dataFields:['mission_id','company_id','action_code','idempotency_key','request_payload'],authorizationScope:'mission_execution_provider',authorizationGranted:true,operation:'provider_execute'}).catch(async e=>{throw e;});
 const requestHash=await sha256(stableStringify(safePayload));
 const started=await recordProviderEvent(env,{providerCode:provider.provider_code,capabilityCode:provider.capability_code,companyId,missionId,attemptId,actionCode,phase:'DISPATCH',status:'STARTED',requestHash,requestId,executionIntentId});
 try{
  if(adapter==='in_app'){
   const operationId=`sim-${crypto.randomUUID()}`;
   await recordProviderEvent(env,{providerCode:provider.provider_code,capabilityCode:provider.capability_code,companyId,missionId,attemptId,actionCode,phase:'DISPATCH',status:'SUCCEEDED',httpStatus:200,operationId,requestHash,responseSummary:{simulated:true},requestId,executionIntentId});
   await recordProviderEvent(env,{providerCode:provider.provider_code,capabilityCode:provider.capability_code,companyId,missionId,attemptId,actionCode,phase:'VERIFY',status:'VERIFIED',httpStatus:200,operationId,responseSummary:{verified:true,simulated:true},requestId,executionIntentId});
   return {configured:true,executed:true,verified:true,verificationStatus:'VERIFIED',providerCode:provider.provider_code,operationId,requestHash,governance,verification:{verified:true,status:'VERIFIED',simulated:true},environment:boundary.environment.code};
  }
  if(adapter!=='http_json')throw fail('EXTERNAL_PROVIDER_ADAPTER_UNSUPPORTED',503,{providerCode:provider.provider_code});
  const endpoint=String(provider.endpoint||'').trim();
  if(!endpoint)throw fail('EXTERNAL_PROVIDER_ENDPOINT_NOT_CONFIGURED',503);
  const url=buildProviderUrl(endpoint,provider.execute_path);
  const response=await providerFetch(env,{url,method:String(provider.execute_method||'POST'),body:safePayload,provider,requestHash,idempotencyKey,timeoutMs:Number(provider.timeout_ms)||10000});
  const operationId=extractOperationId(response.body)||crypto.randomUUID();
  await recordProviderEvent(env,{providerCode:provider.provider_code,capabilityCode:provider.capability_code,companyId,missionId,attemptId,actionCode,phase:'DISPATCH',status:response.ok?'SUCCEEDED':'FAILED',httpStatus:response.status,operationId,requestHash,responseSummary:summarizeResponse(response.body),requestId,executionIntentId});
  if(!response.ok)throw fail('EXTERNAL_PROVIDER_EXECUTION_FAILED',502,{providerCode:provider.provider_code,httpStatus:response.status,operationId});
  if(Number(provider.verification_required)!==1)return {configured:true,executed:true,verified:false,verificationStatus:'NOT_REQUIRED',providerCode:provider.provider_code,operationId,requestHash,governance};
  if(!provider.verify_path)throw fail('EXTERNAL_PROVIDER_VERIFICATION_NOT_CONFIGURED',503,{providerCode:provider.provider_code,operationId});
  const verification=await verifyExternalProviderOperation(env,{provider,companyId,missionId,attemptId,actionCode,operationId,idempotencyKey,countryCode,requestId});
  if(!verification.verified)throw fail(verification.status==='UNKNOWN'?'EXTERNAL_PROVIDER_VERIFICATION_UNKNOWN':'EXTERNAL_PROVIDER_VERIFICATION_FAILED',verification.status==='UNKNOWN'?502:409,{providerCode:provider.provider_code,operationId,verification});
  return {configured:true,executed:true,verified:true,verificationStatus:'VERIFIED',providerCode:provider.provider_code,operationId,requestHash,governance,verification};
 }catch(error){
  if(!String(error?.code||'').startsWith('EXTERNAL_PROVIDER_')) await recordProviderEvent(env,{providerCode:provider.provider_code,capabilityCode:provider.capability_code,companyId,missionId,attemptId,actionCode,phase:'DISPATCH',status:'UNKNOWN',errorCode:String(error?.code||error?.message||'PROVIDER_UNKNOWN').slice(0,160),requestHash,requestId,executionIntentId});
  throw error;
 }
}

async function verifyExternalProviderOperation(env,{provider,companyId,missionId,attemptId,actionCode,operationId,idempotencyKey,countryCode,requestId}){
 const governance=await resolveExternalProviderGovernance(env,{providerCode:provider.provider_code,companyId,countryCode,purposeCode:'mission_execution',classification:'CONFIDENTIAL',dataFields:['mission_id','company_id','action_code','provider_operation_id'],authorizationScope:'mission_execution_provider',authorizationGranted:true,operation:'provider_verify'});
 const url=buildProviderUrl(String(provider.endpoint||''),provider.verify_path);
 const response=await providerFetch(env,{url,method:String(provider.verify_method||'GET'),body:{missionId:Number(missionId),companyId:Number(companyId),actionCode:String(actionCode),operationId:String(operationId),idempotencyKey:String(idempotencyKey)},provider,requestHash:await sha256(`${operationId}:${missionId}:${actionCode}`),idempotencyKey,timeoutMs:Number(provider.timeout_ms)||10000,verification:true});
 const successValues=list(provider.verification_success_values_json);const value=response.body?.verified??response.body?.status??response.body?.state??response.body?.result;
 const verified=response.ok&&successValues.some(x=>String(x)===String(value));
 const status=!response.ok?'UNKNOWN':verified?'VERIFIED':'UNKNOWN';
 await recordProviderEvent(env,{providerCode:provider.provider_code,capabilityCode:provider.capability_code,companyId,missionId,attemptId,actionCode,phase:'VERIFY',status:verified?'VERIFIED':'UNVERIFIED',httpStatus:response.status,operationId,responseSummary:summarizeResponse(response.body),requestId});
 await recordExternalProviderAudit(env,{...governance,operation:'provider_verify'},verified?'allowed':'blocked',requestId,{operationId,status});
 return {verified,status,response:summarizeResponse(response.body)};
}

async function providerFetch(env,{url,method,body,provider,requestHash,idempotencyKey,timeoutMs,verification=false}){
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),Math.min(30000,Math.max(1000,timeoutMs||10000)));
 try{
  const headers=new Headers({'Accept':'application/json','Content-Type':'application/json','X-ON-Mission-Idempotency-Key':String(idempotencyKey).slice(0,120),'X-ON-Mission-Request-Hash':requestHash});
  const binding=String(provider.credential_binding||'').trim();if(binding){const secret=env?.[binding];if(!secret)throw fail('EXTERNAL_PROVIDER_CREDENTIAL_UNAVAILABLE',503,{binding});headers.set(String(provider.authorization_header||'Authorization'),`${String(provider.authorization_prefix||'Bearer')} ${String(secret)}`.trim());}
  const response=await fetch(url,{method,headers,redirect:'manual',signal:controller.signal,body:method==='GET'?undefined:JSON.stringify(body||{})});
  const text=await response.text();if(text.length>MAX_RESPONSE_BYTES)throw fail('EXTERNAL_PROVIDER_RESPONSE_TOO_LARGE',502);
  let parsed={};try{parsed=text?JSON.parse(text):{};}catch{parsed={raw:text.slice(0,4000)};}
  return {ok:response.ok,status:response.status,body:parsed};
 }catch(error){if(error?.name==='AbortError')throw fail(verification?'EXTERNAL_PROVIDER_VERIFY_TIMEOUT':'EXTERNAL_PROVIDER_TIMEOUT',504);throw error;}finally{clearTimeout(timer);}
}

export function validateExternalProviderEndpoint(endpoint,path){return buildProviderUrl(endpoint,path);}
function buildProviderUrl(endpoint,path){
 let base;try{base=new URL(endpoint);}catch{throw fail('EXTERNAL_PROVIDER_ENDPOINT_INVALID',503);}
 if(base.protocol!=='https:')throw fail('EXTERNAL_PROVIDER_HTTPS_REQUIRED',503);
 const host=base.hostname.toLowerCase();if(isBlockedHost(host))throw fail('EXTERNAL_PROVIDER_ENDPOINT_BLOCKED',503);
 const p=String(path||'').trim();if(!p.startsWith('/')||p.startsWith('//')||/[\r\n]/.test(p))throw fail('EXTERNAL_PROVIDER_PATH_INVALID',503);
 const url=new URL(base.toString());url.pathname=`${base.pathname.replace(/\/$/,'')}${p}`;url.search='';url.hash='';return url.toString();
}
function isBlockedHost(host){return host==='localhost'||host.endsWith('.localhost')||host==='127.0.0.1'||host==='0.0.0.0'||host==='::1'||host.endsWith('.local')||/^10\./.test(host)||/^192\.168\./.test(host)||/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)||host==='169.254.169.254';}
function pickFields(payload,fields){if(!fields.length)return {};const out={};for(const f of fields)if(Object.prototype.hasOwnProperty.call(payload||{},f))out[f]=payload[f];return out;}
function providerScopeMatches(row,{countryCode,sectorCode}){const scope=json(row.metadata_json);const countries=Array.isArray(scope.countries)?scope.countries.map(x=>String(x).toUpperCase()):[];const sectors=Array.isArray(scope.sectors)?scope.sectors.map(String):[];return (!countries.length||countries.includes(countryCode)||countries.includes('ZZ'))&&(!sectors.length||sectors.includes(String(sectorCode))||sectors.includes('general'));}
function extractOperationId(body){return body?.operationId||body?.operation_id||body?.id||body?.reference||null;}
function summarizeResponse(body){if(!body||typeof body!=='object')return {};const out={};for(const k of ['status','state','verified','result','operationId','operation_id','reference','message'])if(body[k]!==undefined)out[k]=typeof body[k]==='string'?String(body[k]).slice(0,300):body[k];return out;}
async function recordProviderEvent(env,{providerCode,capabilityCode,companyId,missionId,attemptId,executionIntentId=null,actionCode,phase,status,httpStatus=null,operationId=null,requestHash=null,responseSummary={},errorCode=null,requestId=null}){await env.DB.prepare(`INSERT INTO external_provider_execution_events(event_id,provider_code,capability_code,company_id,mission_id,attempt_id,action_code,operation_id,phase,status,http_status,request_hash,response_summary_json,error_code) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),String(providerCode),String(capabilityCode),companyId?Number(companyId):null,missionId?Number(missionId):null,attemptId||null,String(actionCode),operationId||null,String(phase),String(status),httpStatus==null?null:Number(httpStatus),requestHash||null,JSON.stringify({...responseSummary||{},executionIntentId:executionIntentId||null}),errorCode||null).run();}
async function sha256(value){const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(value)));return [...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,'0')).join('');}
function stableStringify(value){if(value===null||typeof value!=='object')return JSON.stringify(value);if(Array.isArray(value))return `[${value.map(stableStringify).join(',')}]`;return `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;}
