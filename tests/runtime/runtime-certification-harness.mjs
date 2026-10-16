import fs from 'node:fs';
const releaseVersion=fs.readFileSync(new URL('../../VERSION', import.meta.url),'utf8').trim();
/* ON Mission Runtime Certification Harness — 14.4.0
 * Executes against a real deployed environment. Structural PASS is never runtime proof.
 * Full execution is opt-in because it can mutate a real mission.
 */
const base=String(process.env.ON_MISSION_RUNTIME_URL||'').replace(/\/$/,'');
const country=String(process.env.ON_MISSION_CERT_COUNTRY||'').trim().toUpperCase();
const sector=String(process.env.ON_MISSION_CERT_SECTOR||'logistics').trim().toLowerCase();
const email=String(process.env.ON_MISSION_CERT_EMAIL||'').trim().toLowerCase();
const password=String(process.env.ON_MISSION_CERT_PASSWORD||'');
const attackEmail=String(process.env.ON_MISSION_CERT_ATTACK_EMAIL||'').trim().toLowerCase();
const attackPassword=String(process.env.ON_MISSION_CERT_ATTACK_PASSWORD||'');
const existingMissionId=Number(process.env.ON_MISSION_CERT_MISSION_ID||0)||null;
const createMission=process.env.ON_MISSION_CERT_CREATE_MISSION==='1';
const execute=process.env.ON_MISSION_CERT_EXECUTE==='1';
const requireEffect=process.env.ON_MISSION_CERT_REQUIRE_EFFECT==='1';
const certificationEnabled=process.env.ON_MISSION_CERTIFICATION_ENABLED==='1';
const requireRuntime=process.argv.includes('--required');
if(!base||!country||!email||!password|| (requireRuntime && (!attackEmail||!attackPassword))){
  const message='Runtime certification requires ON_MISSION_RUNTIME_URL, ON_MISSION_CERT_COUNTRY, ON_MISSION_CERT_EMAIL and ON_MISSION_CERT_PASSWORD; required adversarial certification additionally requires ON_MISSION_CERT_ATTACK_EMAIL and ON_MISSION_CERT_ATTACK_PASSWORD.';
  if(requireRuntime){console.error(`RUNTIME CERTIFICATION: BLOCKED — ${message}`);process.exit(2)}
  console.log(`RUNTIME CERTIFICATION: NOT RUN — ${message}`);process.exit(0);
}
if(!existingMissionId&&!createMission){
  const message='Full runtime certification requires ON_MISSION_CERT_MISSION_ID or explicit ON_MISSION_CERT_CREATE_MISSION=1.';
  if(requireRuntime){console.error(`RUNTIME CERTIFICATION: BLOCKED — ${message}`);process.exit(2)}
  console.log(`RUNTIME CERTIFICATION: NOT RUN — ${message}`);process.exit(0);
}
if(requireRuntime&&(!createMission||existingMissionId||!execute||!certificationEnabled||!requireEffect)){
  const message='Required certification needs an explicitly created disposable mission (ON_MISSION_CERT_CREATE_MISSION=1, no ON_MISSION_CERT_MISSION_ID), governed execution (ON_MISSION_CERT_EXECUTE=1), ON_MISSION_CERTIFICATION_ENABLED=1, and ON_MISSION_CERT_REQUIRE_EFFECT=1. A read-only or partially skipped run is not production certification.';
  console.error(`RUNTIME CERTIFICATION: BLOCKED — ${message}`);process.exit(2);
}
const cookieJar=new Map();
function storeCookies(headers){const values=headers.getSetCookie?.()||[];for(const v of values){const pair=v.split(';',1)[0];const [k,val]=pair.split('=');if(k)cookieJar.set(k,val)}}
function cookieHeader(){return [...cookieJar.entries()].map(([k,v])=>`${k}=${v}`).join('; ')}
async function request(path,{method='GET',body,expected=[200],allowApplicationFailure=false}={}){
  const headers={'Accept':'application/json','Content-Type':'application/json'};const cookie=cookieHeader();if(cookie)headers.Cookie=cookie;
  const response=await fetch(`${base}${path}`,{method,headers,body:body===undefined?undefined:JSON.stringify(body),redirect:'manual'});storeCookies(response.headers);
  const data=await response.json().catch(()=>({}));
  if(!expected.includes(response.status))throw new Error(`${method} ${path} returned ${response.status}: ${data.error||data.code||'unknown error'}`);
  if(data.success===false&&!allowApplicationFailure)throw new Error(`${method} ${path} returned application failure: ${data.error||data.code||'unknown error'}`);
  return data;
}
const evidence=[];
const step=async(name,fn)=>{const started=Date.now();try{const result=await fn();evidence.push({name,status:'passed',durationMs:Date.now()-started,evidence:result||{}});return result}catch(error){evidence.push({name,status:'failed',durationMs:Date.now()-started,error:String(error?.message||error)});throw error}};
let missionId=existingMissionId;
let createdMissionBody=null;
let primaryIdentity=null;
let planId=null;
let actionCode=null;
try{
  await step('authentication',async()=>{const result=await request('/api/auth/login',{method:'POST',body:{email,password},expected:[200]});primaryIdentity=result;return {role:result.role||result.session?.role||null,tenantId:Number(result.tenantId||result.session?.tenantId||result.user?.tenantId||result.companyId||result.session?.companyId||0)||null,authenticated:true}});
  await step('tenant isolation boundary',async()=>{const result=await request('/api/missions?limit=1',{expected:[200]});return {accessible:true,missionCount:Array.isArray(result.missions)?result.missions.length:null}});
  if(missionId) await step('mission creation',async()=>({missionId,mode:'existing-controlled-mission'}));
  if(!missionId){
    await step('mission creation',async()=>{
      if(!createMission)throw new Error('Mission creation is disabled without ON_MISSION_CERT_CREATE_MISSION=1');
      const key=crypto.randomUUID();
      const body=country==='DE'&&sector==='logistics'
        ? {idempotencyKey:key,missionType:'private',capabilityCode:'logistics',objective:'Controlled Germany logistics runtime certification',countryCode:'DE',sectorCode:'logistics',reference:`CERT-RUNTIME-${Date.now()}`,missionDate:new Date().toISOString().slice(0,10),pickupCompany:'Certification Pickup',pickupAddress:'Teststrasse 1, 20095 Hamburg',pickupStreet:'Teststrasse 1',pickupZipCode:'20095',pickupCity:'Hamburg',deliveryCompany:'Certification Delivery',deliveryAddress:'Hafenstrasse 2, 20457 Hamburg',deliveryStreet:'Hafenstrasse 2',deliveryZipCode:'20457',deliveryCity:'Hamburg',pickupTime:'09:00',deliveryTime:'12:00',deadlineAt:new Date(Date.now()+6*3600000).toISOString().slice(0,16),pickupAtUtc:new Date(Date.now()+3600000).toISOString(),deliveryAtUtc:new Date(Date.now()+2*3600000).toISOString(),deadlineAtUtc:new Date(Date.now()+6*3600000).toISOString(),scheduleTimezone:'Europe/Berlin',objectType:'Controlled Test Object',objectDescription:'Runtime certification object',responsibilityMode:'owner',driverId:Number(process.env.ON_MISSION_CERT_DRIVER_ID||0)||null}
        : {idempotencyKey:key,missionType:'private',objective:'Controlled universal mission runtime certification',countryCode:country,sectorCode:sector,capabilityCode:sector,responsibilityMode:'assigned',reference:`CERT-RUNTIME-${Date.now()}`,missionDate:new Date().toISOString().slice(0,10),missionContext:{certification:true,source:releaseVersion}};
      createdMissionBody=body;
      const result=await request('/api/missions',{method:'POST',body,expected:[200,201]});missionId=result.missionId||result.mission?.id; if(!missionId)throw new Error('Mission create response did not return a canonical mission ID');return {missionId,idempotencyKey:key};
    });
  }
  if(createdMissionBody){
    await step('duplicate mission creation idempotency',async()=>{const replay=await request('/api/missions',{method:'POST',body:createdMissionBody,expected:[200,201]});const replayId=replay.missionId||replay.mission?.id;if(String(replayId)!==String(missionId))throw new Error(`Idempotency replay returned a different mission (${replayId||'missing'}) than the original (${missionId})`);return {missionId,duplicateRequestSent:true,sameCanonicalMission:true,idempotencyKey:createdMissionBody.idempotencyKey};});
  }else evidence.push({name:'duplicate mission creation idempotency',status:'skipped',reason:'Existing controlled mission supplied; no create request was issued, so create-idempotency was not tested.'});
  await step('mission read-after-write truth',async()=>{const result=await request(`/api/missions/${missionId}`,{expected:[200]});return {missionId,status:result.mission?.status||null,stateVersion:result.mission?.state_version||null,lifecycleState:result.mission?.lifecycle_state_code||null}});
  await step('operating-loop composition',async()=>{const result=await request(`/api/mission-execution/missions/${missionId}/operating-loop`,{expected:[200]});return {version:result.version||null,missionId,hasMission:Boolean(result.mission),hasSituation:Boolean(result.situation||result.operatingLoop?.situation),hasPlan:Boolean(result.plan||result.operatingLoop?.plan)}});
  const plan=await step('canonical plan creation or retrieval',async()=>{let result=await request(`/api/mission-execution/missions/${missionId}/plan`,{expected:[200]});let p=result.plan;if(!p){result=await request(`/api/mission-execution/missions/${missionId}/plan`,{method:'POST',body:{source:'runtime-certification-14.3'},expected:[200]});p=result.plan;}planId=Number(p?.id||0)||null;actionCode=String(p?.plan?.recommendedAction?.actionCode||'').trim()||null;return {planId,actionCode,status:p?.status||null,planHash:p?.planHash||null}});
  if(planId){
    await step('plan evaluation',async()=>{const result=await request(`/api/mission-execution/missions/${missionId}/plan/${planId}/evaluate`,{method:'POST',body:{},expected:[200]});return {status:result.evaluation?.status||null,evaluationHash:result.evaluation?.evaluationHash||null}});
    await step('plan acceptance',async()=>{const result=await request(`/api/mission-execution/missions/${missionId}/plan/${planId}/accept`,{method:'POST',body:{},expected:[200]});return {status:result.plan?.status||null}});
  }
  if(execute){
    if(!certificationEnabled)throw new Error('Real execution requires ON_MISSION_CERTIFICATION_ENABLED=1 as an explicit safety fence');
    if(!actionCode)throw new Error('Execution requires a canonical recommended action from the accepted plan');
    const certificationRun=await step('controlled certification run lease',async()=>{const result=await request(`/api/mission-execution/missions/${missionId}/certification/run-token`,{method:'POST',body:{purpose:'14.4 controlled Germany logistics runtime certification',ttlSeconds:900},expected:[200]});return {runId:result.run?.jti||null,token:result.run?.token||null,expiresAt:result.run?.expiresAt||null,version:result.version||null};});
    const context=await step('fresh agent context fence',async()=>await request(`/api/agent/context/missions/${missionId}`,{expected:[200]}));
    await step('governed mission execution',async()=>{const key=crypto.randomUUID();const result=await request(`/api/mission-execution/missions/${missionId}`,{method:'POST',body:{planId,actionCode,contextHash:context.contextHash,idempotencyKey:key,goal:'Controlled Germany logistics runtime certification',certificationMode:true,certificationRunToken:certificationRun.token},expected:[200]});return {status:'accepted',httpAccepted:true,coordinator:result.coordinator||null,execution:result.execution||null,recovery:result.recovery||null,idempotencyKey:key}});
  }else{
    evidence.push({name:'governed mission execution',status:'skipped',reason:'Set ON_MISSION_CERT_EXECUTE=1 only when a controlled real execution is authorized.'});
  }
  const certification=await step('complete mission certification',async()=>{const result=await request(`/api/mission-execution/missions/${missionId}/certification?profile=JOURNEY`,{expected:[200]});return result.certification||result});
  const phases=Array.isArray(certification?.phases)?certification.phases:[];
  const byPhase=new Map();
  for(const phase of phases){const name=String(phase?.phase||'').trim();const status=String(phase?.status||'').trim().toUpperCase();if(!name)throw new Error('Certification contains a phase without a canonical phase name');if(!status)throw new Error(`Certification phase ${name} has no explicit status; refusing to infer success`);if(byPhase.has(name))throw new Error(`Certification contains duplicate phase ${name}`);byPhase.set(name,status);}
  const required=['OBSERVE','UNDERSTAND','PLAN','EVALUATE','ACCEPT','AUTHORIZE','PREPARE','ASSIGN','EXECUTE','EFFECT','VERIFY','RECOVER','OUTCOME','LEARN','NEXT_SITUATION'];
  const missing=required.filter(p=>!byPhase.has(p));
  if(missing.length)throw new Error(`Certification projection missing canonical phases: ${missing.join(',')}`);
  if((requireEffect||requireRuntime)&&!['COMPLETED','PASS'].includes(String(byPhase.get('EFFECT')||'')))throw new Error(`Canonical EFFECT is not proven: ${byPhase.get('EFFECT')||'UNKNOWN'}`);
  evidence.push({name:'canonical journey completeness',status:'passed',evidence:{phases:Object.fromEntries(byPhase),missing}});
  if(missionId&&attackEmail&&attackPassword){
    await step('adversarial tenant isolation',async()=>{const primary=[...cookieJar.entries()];const tenantOf=x=>Number(x?.tenantId||x?.session?.tenantId||x?.user?.tenantId||x?.companyId||x?.session?.companyId||0)||null;const primaryTenant=tenantOf(primaryIdentity);cookieJar.clear();let attack=null;try{attack=await request('/api/auth/login',{method:'POST',body:{email:attackEmail,password:attackPassword},expected:[200]});const attackTenant=tenantOf(attack);if(!primaryTenant||!attackTenant)throw new Error('Tenant isolation cannot be certified: login responses did not expose both canonical tenant IDs');if(primaryTenant===attackTenant)throw new Error('Tenant isolation cannot be certified: attack account resolves to the same tenant as the mission owner');const missionDenied=await request(`/api/missions/${missionId}`,{expected:[403,404],allowApplicationFailure:true});const certificationDenied=await request(`/api/mission-execution/missions/${missionId}/certification`,{expected:[403,404],allowApplicationFailure:true});return {missionId,primaryTenant,attackTenant,blocked:true,missionApplicationSuccess:missionDenied.success===true,certificationApplicationSuccess:certificationDenied.success===true,attackRole:attack?.role||attack?.session?.role||null}}finally{cookieJar.clear();for(const [k,v] of primary)cookieJar.set(k,v);await request('/api/auth/login',{method:'POST',body:{email,password},expected:[200]});}});
  }
  console.log(JSON.stringify({status:'passed',version:releaseVersion,country,sector,missionId,planId,actionCode,evidence},null,2));
}catch(error){console.error(JSON.stringify({status:'failed',version:releaseVersion,country,sector,missionId,planId,actionCode,error:String(error?.message||error),evidence},null,2));process.exit(1)}
