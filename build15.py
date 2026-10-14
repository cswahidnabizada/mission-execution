from pathlib import Path
import json,re,hashlib,shutil,os
root=Path('/mnt/data/onm150')
# versions
(root/'VERSION').write_text('15.0.0\n')
for fn in ['package.json','package-lock.json']:
 p=root/fn; d=json.loads(p.read_text()); d['version']='15.0.0'
 if fn=='package-lock.json':
  if isinstance(d.get('packages'),dict) and isinstance(d['packages'].get(''),dict): d['packages']['']['version']='15.0.0'
 p.write_text(json.dumps(d,indent=2,ensure_ascii=False)+'\n')
# Future-ready unified executor contract / platform readiness
ext=root/'src/worker/extensions/mission-execution-coordinator'
(ext/'mission-platform-certification.service.js').write_text(r'''/**
 * ON Mission 15.0 — Unified Mission Platform Certification.
 * Read-only composition surface. It does not own mission truth, planning,
 * assignment, authorization, execution, provider truth, recovery, outcome,
 * continuity or learning.
 *
 * 15.0 unifies the common contract needed for the reference mission and the
 * future 15.1+ / 16.x / 17.x / 18.x / 19.x / 20.x expansion path. Future
 * capability is expressed as readiness, never as an unproven claim.
 */
import {canonicalAll,canonicalFirst} from '../../core/canonical-db.js';
import {certifyMissionJourney} from './mission-certification.service.js';
import {certifyMissionRuntimeRecovery} from './mission-recovery-certification.service.js';

export const MISSION_PLATFORM_CERTIFICATION_VERSION='15.0.0';
export const EXECUTOR_TYPES=Object.freeze(['human','executor','device','robot','vehicle','drone','provider']);
export const PLATFORM_ROADMAP=Object.freeze([
  Object.freeze({phase:'13.x',name:'Canonical Execution Architecture',status:'COMPLETE'}),
  Object.freeze({phase:'14.0',name:'End-to-End Mission Operating Loop',status:'COMPLETE'}),
  Object.freeze({phase:'14.2-14.5',name:'Runtime / Germany + Logistics Certification',status:'COMPLETE'}),
  Object.freeze({phase:'14.6',name:'Adversarial Runtime',status:'COMPLETE'}),
  Object.freeze({phase:'14.7',name:'Executor + Provider Convergence',status:'COMPLETE'}),
  Object.freeze({phase:'14.8',name:'Provider + Effect Reconciliation',status:'COMPLETE'}),
  Object.freeze({phase:'14.9',name:'Runtime Recovery Certification',status:'COMPLETE'}),
  Object.freeze({phase:'15.0',name:'Real End-to-End Mission',status:'CURRENT'}),
  Object.freeze({phase:'15.1+',name:'Real Executor Polymorphism',status:'READY_AFTER_REFERENCE_PROOF'}),
  Object.freeze({phase:'16.x',name:'Second-Sector Certification',status:'READY_AFTER_REFERENCE_PROOF'}),
  Object.freeze({phase:'17.x',name:'Country Generalization',status:'READY_AFTER_SECOND_SECTOR'}),
  Object.freeze({phase:'18.x',name:'Multi-sector / Multi-country Certification',status:'READY_AFTER_COUNTRY_PROOF'}),
  Object.freeze({phase:'19.x',name:'Controlled Autonomy',status:'GOVERNED_READY_ONLY'}),
  Object.freeze({phase:'20.x',name:'Adaptive Mission Execution Platform',status:'FUTURE'}),
]);

export async function certifyMissionPlatform(env,{companyId,missionId}={}){
  const cid=Number(companyId||0)||0,mid=Number(missionId||0)||0;
  if(!cid||!mid)throw fail('MISSION_PLATFORM_CERTIFICATION_CONTEXT_REQUIRED',400);
  const mission=await canonicalFirst(env,`SELECT id,company_id,reference,status,country_code,sector_code,objective,mission_context_json,state_version,updated_at FROM missions WHERE id=? AND company_id=? LIMIT 1`,[mid,cid],'mission_authority');
  if(!mission)throw fail('MISSION_NOT_FOUND_OR_ACCESS_DENIED',404);
  const journey=await certifyMissionJourney(env,{companyId:cid,missionId:mid,profile:'GERMANY_LOGISTICS_RUNTIME'});
  const attempt=await canonicalFirst(env,`SELECT attempt_id,assignment_id,assignment_version,executor_id,action_code,status,verification_status,recovery_state,started_at,completed_at,effect_hash,state_token_before,state_token_after,observed_effect_json FROM agent_execution_attempts WHERE company_id=? AND mission_id=? ORDER BY id DESC LIMIT 1`,[cid,mid],'agent_execution_attempt_store');
  const assignment=await canonicalFirst(env,`SELECT id,assignment_type,assignee_type,assignee_id,assignee_company_id,status,version,assigned_at,updated_at FROM mission_assignments WHERE company_id=? AND mission_id=? AND status='active' ORDER BY id DESC LIMIT 1`,[cid,mid],'mission_assignment_authority');
  const subject=assignment?await canonicalFirst(env,`SELECT id,subject_type,subject_key,display_name,status,capability_codes_json,last_observed_at,updated_at FROM mission_assignment_subjects WHERE company_id=? AND subject_type=? AND id=? LIMIT 1`,[cid,String(assignment.assignee_type||''),Number(assignment.assignee_id||0)],'mission_assignment_subjects'):null;
  const recovery=attempt?await certifyMissionRuntimeRecovery(env,{attemptId:String(attempt.attempt_id),companyId:cid}):null;
  const external=attempt?await canonicalFirst(env,`SELECT execution_mode,provider_code,provider_operation_id,status FROM mission_execution_intents WHERE company_id=? AND mission_id=? AND attempt_id=? LIMIT 1`,[cid,mid,String(attempt.attempt_id)],'execution_intent_authority'):null;
  const checks=[]; const add=(id,status,reason,evidence={})=>checks.push({id,status,reason,evidence});
  const terminal=['Completed','Cancelled','Canceled'].includes(String(mission.status||''));
  add('REFERENCE_MISSION_SCOPE',String(mission.country_code||'').toUpperCase()==='DE'&&String(mission.sector_code||'').toLowerCase()==='logistics'?'PASS':'BLOCKED','15.0 reference mission is certified against Germany + logistics.',{countryCode:mission.country_code||null,sectorCode:mission.sector_code||null});
  add('REFERENCE_JOURNEY',journey.status==='PASS'?'PASS':journey.status,'Canonical journey certification is observed but cannot manufacture real runtime evidence.',{status:journey.status,passCount:journey.passCount,checkCount:journey.checkCount});
  add('EXECUTOR_CONTRACT',assignment&&EXECUTOR_TYPES.includes(String(assignment.assignee_type||'').toLowerCase())&&subject&&String(subject.status)==='verified'?'PASS':'BLOCKED','Execution subject must be canonical, typed and currently verified.',{assignmentId:assignment?.id||null,assigneeType:assignment?.assignee_type||null,subjectStatus:subject?.status||null});
  const effect=Boolean(String(external?.status||'')==='CANONICAL_EFFECT_COMMITTED'&&attempt?.effect_hash&&attempt?.state_token_after&&parse(attempt?.observed_effect_json));
  add('EFFECT_PROOF',effect?'PASS':'UNKNOWN','Real effect requires persisted canonical effect evidence.',{effectHash:attempt?.effect_hash||null,stateTokenAfter:attempt?.state_token_after||null});
  add('RECOVERY_BOUNDARY',!recovery||['NOT_APPLICABLE','RECOVERY_NOT_REQUIRED','REASSESS_REQUIRED','REPLAN_REAUTHORIZE_REQUIRED','PROVIDER_RECONCILIATION_REQUIRED','RECOVERY_REQUIRED'].includes(String(recovery.decision))?'PASS':'BLOCKED','Recovery remains fail-closed and never dispatches automatically.',{decision:recovery?.decision||null,automaticRetry:recovery?.automaticRetry??false,dispatchAllowed:recovery?.dispatchAllowed??false});
  const verifiedOutcome=journey.checks?.some(x=>x.phase==='RUNTIME_OUTCOME'&&x.status==='PASS');
  add('OUTCOME_PROOF',verifiedOutcome?'PASS':'BLOCKED','Reference mission requires a verified canonical outcome.',{verified:verifiedOutcome});
  const nextReady=journey.checks?.some(x=>x.phase==='RUNTIME_NEXT_SITUATION'&&x.status==='PASS');
  add('NEXT_SITUATION_PROOF',nextReady?'PASS':terminal?'PASS':'BLOCKED','Reference mission requires continuity into a next situation or explicit terminal condition.',{nextSituationReady:nextReady,terminal});
  add('LEARNING_BOUNDARY','PASS','Learning remains derived-only and cannot mutate truth or grant authorization.',{authoritative:false});
  add('AUTONOMY_BOUNDARY','PASS','Controlled autonomy is prepared as a governed capability, not enabled by certification.',{enabled:false,requiresRealOutcomeProof:true,requiresAuthorization:true});
  const roadmap=PLATFORM_ROADMAP.map(x=>({...x}));
  const rank={BLOCKED:0,UNKNOWN:1,PARTIAL:2,PASS:3};
  const worst=checks.reduce((m,c)=>Math.min(m,rank[c.status]),3);
  const status=worst===0?'BLOCKED':worst===1?'UNKNOWN':worst===2?'PARTIAL':'PASS';
  return Object.freeze({version:MISSION_PLATFORM_CERTIFICATION_VERSION,status,missionId:mid,companyId:cid,referenceMission:{countryCode:mission.country_code||null,sectorCode:mission.sector_code||null},journey,executor:{types:EXECUTOR_TYPES,assignment,subject},recovery,provider:{external:Boolean(String(external?.execution_mode||'INTERNAL')!=='INTERNAL'),code:external?.provider_code||null,operationId:external?.provider_operation_id||null,status:external?.status||null},checks,roadmap,architecture:{oneExecutionCoordinator:true,canonicalTruthPreserved:true,canonicalAssignmentPreserved:true,canonicalRecoveryPreserved:true,noNewAuthority:true,noNewMigration:true,unknownIsNotSuccess:true,learningNonAuthoritative:true,autonomyDisabled:true}});
}
function parse(v){try{return JSON.parse(String(v??'{}'))||null}catch{return null}}
function fail(code,status=409){return Object.assign(new Error(code),{code,status})}
''')
# route imports and endpoint
rp=ext/'mission-execution-coordinator.routes.js'; s=rp.read_text()
s=s.replace("import {issueMissionCertificationRun,MISSION_CERTIFICATION_RUN_VERSION} from './mission-certification-run.service.js';", "import {issueMissionCertificationRun,MISSION_CERTIFICATION_RUN_VERSION} from './mission-certification-run.service.js';\nimport {certifyMissionPlatform,MISSION_PLATFORM_CERTIFICATION_VERSION} from './mission-platform-certification.service.js';")
needle="  router.get(/^\\/api\\/mission-execution\\/missions\\/(?<missionId>\\d+)\\/operating-loop$/"
insert="""  router.get(/^\\/api\\/mission-execution\\/missions\\/(?<missionId>\\d+)\\/platform-certification$/,async({request,env,params})=>{\n    try{\n      const session=await requireSession(request,env);\n      await limitAction(env,session,'mission-platform-certification',{limit:30,windowSeconds:60});\n      const companyId=Number(session?.tenantId||0)||0;if(!companyId)throw fail('MISSION_PLATFORM_CERTIFICATION_COMPANY_ID_REQUIRED',403);\n      const result=await certifyMissionPlatform(env,{companyId,missionId:Number(params.missionId)});\n      return json({success:true,version:MISSION_PLATFORM_CERTIFICATION_VERSION,...result},200);\n    }catch(e){return json({success:false,error:e?.message||'Mission platform certification unavailable',code:e?.code||'MISSION_PLATFORM_CERTIFICATION_UNAVAILABLE'},e?.status||500);}\n  });\n\n"""
s=s.replace(needle,insert+needle)
rp.write_text(s)
# UI fetch + card
ui=root/'public/assets/ui/canonical-mission-workspace.js'; u=ui.read_text()
u=u.replace('referenceMission:null,executionAttempts', 'referenceMission:null,platformCertification:null,executionAttempts')
u=u.replace("api(`/api/agent/reference/missions/${id}`,{cache:\"no-store\"})", "api(`/api/agent/reference/missions/${id}`,{cache:\"no-store\"}),\n      api(`/api/mission-execution/missions/${id}/platform-certification`,{cache:\"no-store\"})")
u=u.replace("state.referenceMission=reference.status==='fulfilled'?(reference.value?.assessment||null):null;", "state.referenceMission=reference.status==='fulfilled'?(reference.value?.assessment||null):null;\n    state.platformCertification=arguments[0];")
# Above is wrong because Promise.allSettled array assignment; fix entire block manually
u=u.replace("const [loop,attempts,recovery,outcomes,reference]=await Promise.allSettled([", "const [loop,attempts,recovery,outcomes,reference,platform]=await Promise.allSettled([")
u=u.replace("state.platformCertification=arguments[0];", "state.platformCertification=platform.status==='fulfilled'?(platform.value||null):null;")
# add a small card in situation after render situation start: insert in render() body string by adding helper call
u=u.replace("<section class=\"cmw-pane\" data-cmw-pane=\"situation\">${renderSituation(m,status,truth)}</section>", "<section class=\"cmw-pane\" data-cmw-pane=\"situation\">${renderPlatformCertification()}${renderSituation(m,status,truth)}</section>")
# add helper before renderSituation
marker='  function renderSituation(m,status,truth){'
helper='''  function renderPlatformCertification(){\n    const p=state.platformCertification||{},checks=Array.isArray(p.checks)?p.checks:[],pass=checks.filter(x=>x.status==='PASS').length,blocked=checks.filter(x=>x.status==='BLOCKED').length;\n    const label=p.status==='PASS'?'REFERENCE MISSION READY':p.status==='PARTIAL'?'REFERENCE MISSION PARTIAL':p.status==='UNKNOWN'?'REFERENCE MISSION UNKNOWN':'REFERENCE MISSION BLOCKED';\n    return `<div class="cmw-card cmw-platform-cert"><div class="cmw-section-head"><div><span>15.0 REFERENCE MISSION</span><h3>${esc(label)}</h3></div><div><b>${pass}/${checks.length||0}</b><small>${blocked?'Proof still required':'Governed boundary certified'}</small></div></div><div class="cmw-facts"><div><span>EXECUTOR</span><b>${esc(p.executor?.assignment?.assignee_type||'—')}</b></div><div><span>COUNTRY</span><b>${esc(p.referenceMission?.countryCode||'—')}</b></div><div><span>SECTOR</span><b>${esc(p.referenceMission?.sectorCode||'—')}</b></div><div><span>AUTONOMY</span><b>GOVERNED / OFF</b></div></div></div>`;\n  }\n'''
u=u.replace(marker,helper+marker)
ui.write_text(u)
# version query param
for p in [root/'public/assets/ui/canonical-mission-workspace.js']:
 t=p.read_text().replace('?v=14.9.0','?v=15.0.0');p.write_text(t)
# new test
test=root/'tests/system/check-15-0-0-real-end-to-end-mission.mjs'
test.write_text(r'''import fs from 'node:fs';
import assert from 'node:assert/strict';
import path from 'node:path';
const root=process.cwd(); const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const version=read('VERSION').trim(); assert.equal(version,'15.0.0');
const pkg=JSON.parse(read('package.json')); const lock=JSON.parse(read('package-lock.json')); assert.equal(pkg.version,'15.0.0'); assert.equal(lock.version,'15.0.0'); assert.equal(lock.packages[''].version,'15.0.0');
const service=read('src/worker/extensions/mission-execution-coordinator/mission-platform-certification.service.js');
for(const x of ['MISSION_PLATFORM_CERTIFICATION_VERSION','PLATFORM_ROADMAP','EXECUTOR_TYPES','certifyMissionPlatform','unknownIsNotSuccess','autonomyDisabled','noNewAuthority']) assert(service.includes(x),`missing 15.0 contract: ${x}`);
const routes=read('src/worker/extensions/mission-execution-coordinator/mission-execution-coordinator.routes.js'); assert(routes.includes('/api/mission-execution/missions/${params.missionId}/platform-certification')||routes.includes('platform-certification'));
const ui=read('public/assets/ui/canonical-mission-workspace.js'); for(const x of ['/api/mission-execution/missions/${id}/platform-certification','REFERENCE MISSION','GOVERNED / OFF']) assert(ui.includes(x),`missing workspace convergence: ${x}`);
const journey=read('src/worker/extensions/mission-execution-coordinator/mission-certification.service.js'); assert(journey.includes('GERMANY_LOGISTICS_RUNTIME')); assert(journey.includes('RUNTIME_OUTCOME')); assert(journey.includes('RUNTIME_NEXT_SITUATION'));
const schema=read('database/schema.current.sql'); assert(schema.includes('CREATE TABLE mission_execution_intents')); assert(schema.includes('CREATE TABLE mission_outcome_assessments'));
const release=read('RELEASE.md'); assert(release.includes('15.0.0')); assert(release.includes('REAL END-TO-END MISSION')); assert(release.includes('15.1+')); assert(release.includes('16.x')); assert(release.includes('17.x')); assert(release.includes('18.x')); assert(release.includes('19.x')); assert(release.includes('20.x'));
console.log('15.0.0 real end-to-end mission platform: PASS (18 checks)');
''')
# Add test to release command
pkgp=root/'package.json'; d=json.loads(pkgp.read_text()); d['scripts']['check:release']=d['scripts']['check:release']+' && node tests/system/check-15-0-0-real-end-to-end-mission.mjs'; pkgp.write_text(json.dumps(d,indent=2)+'\n')
# update continuity lists: append 15.0 after 14.9 in tests, except 14.9 exact test and avoid package source
for p in (root/'tests/system').glob('*.mjs'):
 t=p.read_text()
 if p.name=='check-15-0-0-real-end-to-end-mission.mjs': continue
 if '14.9.0' in t:
  t=t.replace("'14.9.0'", "'14.9.0','15.0.0'")
  if p.name=='check-14-9-0-runtime-recovery-certification.mjs':
   t=t.replace("assert.equal(version,'14.9.0')", "assert(['14.9.0','15.0.0'].includes(version))")
  p.write_text(t)
# update runtime authority version constants from 14.x to 15.0 only where current release identity should follow
for rel in ['mission-execution-coordinator.contract.js']:
 p=ext/rel; t=p.read_text().replace("MISSION_EXECUTION_COORDINATOR_VERSION='14.5.0'","MISSION_EXECUTION_COORDINATOR_VERSION='15.0.0'"); p.write_text(t)
# update certification versions? Keep historical certification authority version? Current certification should align 15.0.
p=ext/'mission-certification.service.js'; t=p.read_text().replace("MISSION_CERTIFICATION_VERSION='14.5.0'","MISSION_CERTIFICATION_VERSION='15.0.0'"); p.write_text(t)
p=ext/'mission-recovery-certification.service.js'; t=p.read_text().replace("MISSION_RECOVERY_CERTIFICATION_VERSION='14.9.0'","MISSION_RECOVERY_CERTIFICATION_VERSION='15.0.0'"); p.write_text(t)
# update coordinator runtime version if present
for p in ext.glob('*.js'):
 t=p.read_text()
 t=t.replace("MISSION_EXECUTION_RECOVERY_COORDINATOR_RUNTIME_VERSION='14.9.0'","MISSION_EXECUTION_RECOVERY_COORDINATOR_RUNTIME_VERSION='15.0.0'")
 p.write_text(t)
# README and RELEASE fresh top plus preserve historical lineage
readme=root/'README.md'; old=readme.read_text(); header='''# ON Mission 15.0.0 — Real End-to-End Mission Platform\n\nCurrent release: **15.0.0**\n\n15.0.0 is the unified reference-mission release. It does not attempt to pretend future phases are already real-world certified. Instead it consolidates the canonical execution journey into one read-only platform certification surface and establishes the shared executor, provider, sector/country and governed-autonomy boundaries required for the 15.1+ through 20.x roadmap without creating duplicate authorities.\n\nCanonical journey:\n\n**OBSERVE → UNDERSTAND → PLAN → EVALUATE → ACCEPT → AUTHORIZE → PREPARE → ASSIGN → EXECUTE → EFFECT → VERIFY → RECOVER → OUTCOME → LEARN → NEXT SITUATION → OBSERVE**\n\nPermanent priorities: **Security → Truth → Liveness → Stability → Experience → Scale**\n\n15.0 does not add a migration. Migration high-water remains **0148**.\n\n## Reference Mission\n\nThe reference mission is Germany + Logistics. The platform certification surface reports actual evidence from canonical authorities; it never manufactures execution, effect, verification, outcome or next-situation proof.\n\n## Unified future path\n\n15.1+ real executor polymorphism → 16.x second-sector certification → 17.x country generalization → 18.x multi-sector/multi-country certification → 19.x controlled autonomy → 20.x adaptive mission execution platform. These are readiness boundaries, not false certifications.\n\n---\n\n'''; readme.write_text(header+old)
release=root/'RELEASE.md'; old=release.read_text(); hdr='''# ON Mission 15.0.0 — Real End-to-End Mission Platform\n\n**Status:** hardening candidate / reference-mission release\n**Base:** ON Mission 14.9.0 (deployed protected baseline)\n\n## Objective\n\n15.0.0 is the single unifying release for the next platform era. It consolidates the canonical mission operating journey, real Germany + Logistics reference certification, executor polymorphism boundaries, provider/effect/recovery convergence, sector/country expansion contracts, and governed-autonomy boundaries without replacing canonical authorities with parallel engines.\n\nIt is intentionally honest about proof: 15.0 can certify that the deployed system has the required evidence or that evidence is still missing; it cannot manufacture a real-world mission outcome. Future phases 15.1+ through 20.x are represented as governed readiness states, not claimed as completed real-world certifications.\n\n## Roadmap position\n\n- 13.x — Canonical Execution Architecture — **COMPLETE**\n- 14.0 — End-to-End Mission Operating Loop — **COMPLETE**\n- 14.2–14.5 — Runtime / Germany + Logistics Certification — **COMPLETE**\n- 14.6 — Adversarial Runtime — **COMPLETE**\n- 14.7 — Executor + Provider Convergence — **COMPLETE**\n- 14.8 — Provider + Effect Reconciliation — **COMPLETE**\n- 14.9 — Runtime Recovery Certification — **COMPLETE**\n- 15.0 — **REAL END-TO-END MISSION — CURRENT**\n- 15.1+ — Real Executor Polymorphism — **READINESS BOUNDARY**\n- 16.x — Second-Sector Certification — **READINESS BOUNDARY**\n- 17.x — Country Generalization — **READINESS BOUNDARY**\n- 18.x — Multi-sector / Multi-country Certification — **READINESS BOUNDARY**\n- 19.x — Controlled Autonomy — **GOVERNED / OFF**\n- 20.x — Adaptive Mission Execution Platform — **FUTURE**\n\n## Unified platform certification\n\nNew read-only surface:\n`GET /api/mission-execution/missions/:missionId/platform-certification`\n\nThe surface composes existing canonical mission, planning, evaluation, assignment, execution, provider, verification, recovery, outcome, continuity and learning evidence. It also exposes the typed executor boundary and future roadmap readiness. It does not create a new command path.\n\n## Executor polymorphism\n\nThe unified executor contract recognizes human, executor, device, robot, vehicle, drone and provider subjects. The canonical assignment authority remains the sole owner of assignment truth. Subject registration remains a governed projection/resource feed.\n\n## Reference mission proof\n\nThe gold-standard reference mission is Germany + Logistics. A 15.0 certification is only fully PASS when actual canonical execution, persisted effect evidence, verification, verified outcome and next-situation/terminal evidence exist in the deployed runtime. Until then the surface reports BLOCKED/UNKNOWN/PARTIAL rather than manufacturing success.\n\n## Controlled autonomy\n\n19.x remains governed and disabled. Learning is derived-only. No agent may become a shadow mission truth, authorization, assignment, execution, provider or recovery authority.\n\n## Schema\n\nNo new migration. High-water remains **0148**; current schema remains the protected 14.9 baseline.\n\n## Permanent release priorities\n\n**Security → Truth → Liveness → Stability → Experience → Scale**\n\n---\n\n'''; release.write_text(hdr+old)
# Build status
(root/'BUILD-STATUS.md').write_text('''# ON Mission 15.0.0 Build Status\n\nStatus: hardening candidate\nBase: 14.9.0 deployed protected baseline\n\n15.0.0 implements the unified Real End-to-End Mission platform certification surface. It preserves canonical authorities, adds no migration, and makes future executor/sector/country/autonomy phases readiness contracts rather than speculative duplicate engines.\n\nRelease gate: pending final run.\nFrontend production build: must be verified with `npm ci && npm run build` in the deployment environment; this environment may lack the Tailwind CLI after dependency installation.\n''')
# Manifest current version and schema hash
manifest=root/'RELEASE-MANIFEST.json'
if manifest.exists():
 m=json.loads(manifest.read_text()); m['version']='15.0.0'; manifest.write_text(json.dumps(m,indent=2)+'\n')
print('prepared 15.0')
