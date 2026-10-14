import {RELEASE_VERSION} from '../../core/release.js';
import {PRODUCT_VERIFICATION_JOURNEYS} from './product-verification-engine.service.js';
import {getProductContract} from './product-contract.service.js';
import {auditAdminControl} from './admin-control.audit.js';
import {getProductDependencyGraph} from '../../security/product-launch-workspace.service.js';
import {evaluateProductLaunchReadiness} from '../../security/product-launch-readiness.service.js';

import { authorityUnavailable } from '../../core/canonical-db.js';
export const PRODUCT_TEST_SCENARIO_VERSION=`${RELEASE_VERSION}-test-scenario`;
const clean=(v,max=160)=>String(v??'').trim().slice(0,max);
const json=(v,f={})=>{try{return JSON.parse(String(v??'null'))??f}catch{return f}};
const arr=v=>Array.isArray(v)?v:[];
const sha256=async value=>{const bytes=new TextEncoder().encode(value);const digest=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');};
const fail=(message,status=400,code='PRODUCT_TEST_SCENARIO_ERROR')=>Object.assign(new Error(message),{status,code});

const CONTROLLED_PHASES=Object.freeze([
 {sequence:1,code:'registration',label:'Registration',journeys:['registration'],goal:'Prepare a representative entry path for the selected country product.'},
 {sequence:2,code:'tenant',label:'Tenant',journeys:['authentication','organization_onboarding','verification_trust','subscription','billing'],goal:'Prepare an approved representative tenant with identity, onboarding, trust and commercial context.'},
 {sequence:3,code:'executor',label:'Executor',journeys:['people_executor'],goal:'Prepare an active execution actor connected to the representative tenant.'},
 {sequence:4,code:'mission',label:'Mission',journeys:['mission_creation'],goal:'Prepare a representative mission owned by the canonical mission domain.'},
 {sequence:5,code:'assignment',label:'Assignment',journeys:['assignment'],goal:'Prepare a canonical active assignment for the representative mission.'},
 {sequence:6,code:'execution',label:'Execution',journeys:['custody_transition'],goal:'Prepare committed execution and custody evidence.'},
 {sequence:7,code:'evidence',label:'Evidence',journeys:['tracking_evidence'],goal:'Prepare operational evidence and delivery proof.'},
 {sequence:8,code:'completion',label:'Completion',journeys:['mission_completion'],goal:'Prepare terminal completion and delivery proof evidence.'}
]);

function normalize(row){if(!row)return null;return {...row,id:Number(row.id),launchId:Number(row.launch_id),companyId:row.company_id==null?null:Number(row.company_id),missionId:row.mission_id==null?null:Number(row.mission_id),scenario:json(row.scenario_json,{}),steps:[]};}

async function loadScenario(env,id){
 const row=await env.DB.prepare(`SELECT * FROM platform_product_test_scenarios WHERE id=? LIMIT 1`).bind(Number(id)).first();
 if(!row)return null;
 const out=normalize(row);
 out.steps=((await env.DB.prepare(`SELECT * FROM platform_product_test_scenario_steps WHERE scenario_id=? ORDER BY sequence`).bind(Number(id)).all()).results||[]).map(x=>({...x,id:Number(x.id),scenarioId:Number(x.scenario_id),sequence:Number(x.sequence),journeys:json(x.journeys_json,[]),preconditions:json(x.preconditions_json,{}),evidence:json(x.evidence_json,{})}));
 return out;
}

export async function getProductTestScenario(env,{scenarioId}={}){const id=Number(scenarioId);if(!Number.isInteger(id)||id<=0)throw fail('Invalid test scenario id',400,'PRODUCT_TEST_SCENARIO_ID_INVALID');return loadScenario(env,id);}

export async function getProductTestScenarioForLaunch(env,{launchId}={}){
 const id=Number(launchId);if(!Number.isInteger(id)||id<=0)throw fail('Invalid product launch id',400,'COUNTRY_PRODUCT_LAUNCH_ID_INVALID');
 const row=await env.DB.prepare(`SELECT id FROM platform_product_test_scenarios WHERE launch_id=? ORDER BY id DESC LIMIT 1`).bind(id).first();
 return row?loadScenario(env,Number(row.id)):null;
}

export async function prepareProductTestScenario(env,{actor=null,requestId='',launchId,companyId=null,missionId=null,sectorCode=null}={}){
 const id=Number(launchId);if(!Number.isInteger(id)||id<=0)throw fail('Invalid product launch id',400,'COUNTRY_PRODUCT_LAUNCH_ID_INVALID');
 const launch=await env.DB.prepare(`SELECT id,country_code,version,status,active,manifest_json,eligibility_json FROM country_product_launches WHERE id=? LIMIT 1`).bind(id).first();
 if(!launch)throw fail('Product launch not found',404,'COUNTRY_PRODUCT_LAUNCH_NOT_FOUND');
 const manifest=json(launch.manifest_json,{}),eligibility=json(launch.eligibility_json,{}),sectors=arr(eligibility.sectors||manifest.eligibility?.sectors);const sector=clean(sectorCode||sectors[0]||'general',80);
 const readiness=await evaluateProductLaunchReadiness(env,{countryCode:launch.country_code,sectorCode:sector,manifest,launchId:id});
 const contract=await getProductContract(env,{launchId:id});
 const graph=await getProductDependencyGraph(env,id);
 let company=null,mission=null;
 if(companyId){company=await env.DB.prepare(`SELECT company_id,legal_name,country_code,sector_code,status FROM company_management_profiles WHERE company_id=? AND country_code=? LIMIT 1`).bind(Number(companyId),launch.country_code).first();if(!company)throw fail('Representative organization was not found for this country.',404,'PRODUCT_TEST_SCENARIO_COMPANY_NOT_FOUND');}
 if(missionId){if(!company)throw fail('Representative organization is required when a mission is selected.',400,'PRODUCT_TEST_SCENARIO_COMPANY_REQUIRED');mission=await env.DB.prepare(`SELECT id,company_id,reference,status FROM mission_canonical_projection WHERE id=? AND company_id=? LIMIT 1`).bind(Number(missionId),Number(company.company_id)).first();if(!mission)throw fail('Representative mission was not found for the selected organization.',404,'PRODUCT_TEST_SCENARIO_MISSION_NOT_FOUND');}
 const target={countryCode:launch.country_code,sectorCode:sector,companyId:company?.company_id||null,missionId:mission?.id||null};
 const blockers=[];
 if(readiness.valid!==true)blockers.push({code:'SCENARIO_LAUNCH_NOT_READY',message:'The exact product-country version still has launch-readiness blockers.',nextAction:'Resolve launch readiness before running the prepared scenario.'});
 if(Number(graph.summary?.blockedNodes||0)>0)blockers.push({code:'SCENARIO_DEPENDENCIES_BLOCKED',message:`${Number(graph.summary.blockedNodes)} dependency node(s) are blocked.`,nextAction:'Resolve dependency blockers before scenario execution.'});
 if(!company)blockers.push({code:'SCENARIO_TARGET_COMPANY_REQUIRED',message:'A representative tenant organization must be selected before controlled execution.',nextAction:'Select a verified or active representative organization.'});
 if(!mission)blockers.push({code:'SCENARIO_TARGET_MISSION_REQUIRED',message:'A representative mission must be selected before controlled execution of the operational phases.',nextAction:'Select a representative mission belonging to the selected tenant.'});
 const dependencySnapshot={version:`${RELEASE_VERSION}-release-lifecycle`,graph};
 const dependencySnapshotHash=await sha256(JSON.stringify(dependencySnapshot));
 const scenarioJson={version:PRODUCT_TEST_SCENARIO_VERSION,mode:'controlled',launch:{id:Number(launch.id),version:launch.version,countryCode:launch.country_code},target,contractHash:contract.contractHash,dependencySnapshot,dependencySnapshotHash,preparedAt:new Date().toISOString()};
 const status=blockers.length?'blocked':'prepared';
 const existing=await env.DB.prepare(`SELECT id FROM platform_product_test_scenarios WHERE launch_id=? ORDER BY id DESC LIMIT 1`).bind(id).first();
 let scenarioId;
 if(existing){scenarioId=Number(existing.id);await env.DB.prepare(`UPDATE platform_product_test_scenarios SET company_id=?,mission_id=?,sector_code=?,status=?,scenario_json=?,contract_hash=?,dependency_snapshot_hash=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(company?.company_id||null,mission?.id||null,sector,status,JSON.stringify({...scenarioJson,blockers}),contract.contractHash,dependencySnapshotHash,scenarioId).run();await env.DB.prepare(`DELETE FROM platform_product_test_scenario_steps WHERE scenario_id=?`).bind(scenarioId).run();}
 else {const ins=await env.DB.prepare(`INSERT INTO platform_product_test_scenarios(launch_id,company_id,mission_id,sector_code,status,scenario_json,contract_hash,dependency_snapshot_hash) VALUES(?,?,?,?,?,?,?,?)`).bind(id,company?.company_id||null,mission?.id||null,sector,status,JSON.stringify({...scenarioJson,blockers}),contract.contractHash,dependencySnapshotHash).run();scenarioId=Number(ins.meta?.last_row_id||ins.last_row_id);}
 for(const phase of CONTROLLED_PHASES){const phaseBlocker=phase.sequence>=2&&!company?{code:'TARGET_COMPANY_REQUIRED',message:'Representative tenant is required for this controlled phase.'}:phase.sequence>=4&&!mission?{code:'TARGET_MISSION_REQUIRED',message:'Representative mission is required for this operational phase.'}:null;await env.DB.prepare(`INSERT INTO platform_product_test_scenario_steps(scenario_id,sequence,phase_code,label,journeys_json,preconditions_json,status,evidence_json) VALUES(?,?,?,?,?,?,?,?)`).bind(scenarioId,phase.sequence,phase.code,phase.label,JSON.stringify(phase.journeys),JSON.stringify({goal:phase.goal,target,requiresCompany:phase.sequence>=2,requiresMission:phase.sequence>=4}),phaseBlocker?'blocked':'ready',JSON.stringify(phaseBlocker||{})).run();}
 if(actor)await auditAdminControl(env,{actor,action:'admin.product-test-scenario.prepared',resourceType:'product_test_scenario',resourceId:scenarioId,requestId,metadata:{launchId:id,companyId:company?.company_id||null,missionId:mission?.id||null,sectorCode:sector,status}}).catch(error=>{throw authorityUnavailable('product_test_scenario_audit',error);});
 return loadScenario(env,scenarioId);
}

export async function listProductTestScenarios(env,{launchId=null,limit=20}={}){const n=Math.min(Math.max(Number(limit)||20,1),50);const rows=(await env.DB.prepare(`SELECT * FROM platform_product_test_scenarios ${launchId?'WHERE launch_id=?':''} ORDER BY id DESC LIMIT ?`).bind(...(launchId?[Number(launchId),n]:[n])).all()).results||[];return rows.map(normalize);}

export {CONTROLLED_PHASES};
