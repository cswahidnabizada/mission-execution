import {canonicalRun} from '../../core/canonical-db.js';
import {ACTION_CODES} from '../../application/actions/action-registry.js';
import {ACTION_SERVICE_MAP} from '../../application/actions/action-service-map.js';
import {evaluateProductLaunchReadiness} from '../../security/product-launch-readiness.service.js';
import {getCountryProductLaunch} from '../../security/country-product-launch.service.js';
import {getProductContract} from './product-contract.service.js';
import {getProductDependencyGraph} from '../../security/product-launch-workspace.service.js';

import {RELEASE_VERSION} from '../../core/release.js';

export const PRODUCT_VERIFICATION_ENGINE_VERSION=RELEASE_VERSION;
const clean=(v,max=160)=>String(v??'').trim().slice(0,max);
const json=(v,f={})=>{try{return JSON.parse(String(v||'null'))??f}catch{return f}};
const arr=v=>Array.isArray(v)?v:[];
const pass=(e={})=>({status:'passed',evidence:e});
const blocked=(code,message,evidence={})=>({status:'blocked',errorCode:code,errorMessage:message,evidence});
const fail=(code,message,evidence={})=>({status:'failed',errorCode:code,errorMessage:message,evidence});

export const PRODUCT_VERIFICATION_JOURNEYS=Object.freeze([
  {code:'registration',label:'Registration',description:'The product can be entered for the selected country and sector and produces the canonical onboarding record.',steps:['country_product_active','sector_eligibility','onboarding_record']},
  {code:'authentication',label:'Authentication',description:'A real tenant user has an active canonical identity and platform account state.',steps:['tenant_identity_active','platform_user_active']},
  {code:'organization_onboarding',label:'Organization Onboarding',description:'The organization provisioning path completed and lifecycle truth is usable.',steps:['provisioning_completed','organization_lifecycle_active']},
  {code:'verification_trust',label:'Verification & Trust',description:'Required verification checks converge into approved review and active Trust Key state.',steps:['verification_approved','required_checks_verified','trust_key_active']},
  {code:'subscription',label:'Subscription',description:'The product exposes a valid subscription product/policy for the target user.',steps:['plan_product_available','tenant_subscription_or_free_policy']},
  {code:'billing',label:'Billing',description:'Country billing policy and tenant billing identity are operationally coherent.',steps:['billing_policy_active','billing_identity_active']},
  {code:'people_executor',label:'People & Executor',description:'The organization has a usable execution actor through the canonical people/executor model.',steps:['executor_or_driver_available','executor_link_or_driver_identity']},
  {code:'mission_creation',label:'Mission Creation',description:'Mission creation remains connected to the canonical action registry, service map and real mission Truth.',steps:['canonical_create_mission_action','mission_exists']},
  {code:'assignment',label:'Assignment',description:'The representative mission has a canonical executor/driver assignment.',steps:['assignment_exists','assignment_actor_active']},
  {code:'custody_transition',label:'Custody & Transition',description:'The representative mission has committed canonical transition evidence and no impossible custody state.',steps:['committed_transition','custody_state_coherent']},
  {code:'tracking_evidence',label:'Tracking & Evidence',description:'Operational events and evidence are recorded against the representative mission.',steps:['mission_event_evidence','mission_file_or_delivery_proof']},
  {code:'mission_completion',label:'Mission Completion',description:'A representative mission reached terminal completion with the required delivery proof and committed transition.',steps:['completed_mission','completion_transition','delivery_proof']}
]);

const requiredActionCodes=Object.freeze(['CREATE_MISSION','ASSIGN_DRIVER','ADVANCE_EXECUTION','CAPTURE_DELIVERY_PROOF','COMPLETE_MISSION']);
const requiredActions=()=>requiredActionCodes.map(k=>ACTION_CODES[k]).filter(Boolean);
const getServiceMapCode=code=>ACTION_SERVICE_MAP?.[code]?code:null;

export function listProductVerificationContracts(){
  return PRODUCT_VERIFICATION_JOURNEYS.map((j,index)=>({sequence:index+1,...j}));
}

async function activeLaunch(env,countryCode){
  return getCountryProductLaunch(env,countryCode,{publicOnly:true});
}
async function targetCompany(env,{companyId,countryCode,sectorCode}){
  const where=['cmp.status IN (\'VERIFIED\',\'ACTIVE\')'];const binds=[];
  if(companyId){where.push('cmp.company_id=?');binds.push(Number(companyId));}
  if(countryCode){where.push('cmp.country_code=?');binds.push(countryCode);}
  if(sectorCode){where.push('cmp.sector_code=?');binds.push(sectorCode);}
  return env.DB.prepare(`SELECT cmp.company_id,cmp.legal_name,cmp.country_code,cmp.sector_code,cmp.organization_type,cmp.status,cmp.status_version FROM company_management_profiles cmp WHERE ${where.join(' AND ')} ORDER BY CASE WHEN cmp.status='ACTIVE' THEN 0 ELSE 1 END,cmp.company_id DESC LIMIT 1`).bind(...binds).first();
}
async function targetMission(env,{companyId,missionId}){
  if(missionId){return env.DB.prepare(`SELECT * FROM mission_canonical_projection WHERE id=? AND company_id=? LIMIT 1`).bind(Number(missionId),Number(companyId)).first();}
  return env.DB.prepare(`SELECT * FROM mission_canonical_projection WHERE company_id=? ORDER BY id DESC LIMIT 1`).bind(Number(companyId)).first();
}
async function executeStep(env,step,{countryCode,sectorCode,launch,company,mission}){
  const target={countryCode,sectorCode,companyId:company?.company_id||null,missionId:mission?.id||null};
  switch(step){
    case 'country_product_active':
      return launch?.active?pass({launchId:launch.id,version:launch.version,countryCode}):blocked('COUNTRY_PRODUCT_NOT_ACTIVE','No active country product exists for the selected country.',target);
    case 'sector_eligibility': {
      if(!launch)return blocked('COUNTRY_PRODUCT_NOT_ACTIVE','Sector eligibility cannot be proven before a country product is active.',target);
      const e=launch.eligibility||{};const sectors=arr(e.sectors);return (!sectors.length||sectors.includes(sectorCode))?pass({sectors}):fail('SECTOR_NOT_ELIGIBLE','Selected sector is not included in the active launch manifest.',{sectors,sectorCode});
    }
    case 'onboarding_record': {
      if(!company)return blocked('TARGET_COMPANY_REQUIRED','Select or create a representative tenant organization to prove onboarding.',target);
      const row=await env.DB.prepare(`SELECT company_id,provisioning_status,provisioning_step,review_status,owner_identity_id FROM organization_onboarding_records WHERE company_id=? LIMIT 1`).bind(Number(company.company_id)).first();
      if(!row)return blocked('ONBOARDING_RECORD_MISSING','Representative organization has no canonical onboarding record.',target);
      return row.provisioning_status==='COMPLETED'?pass(row):fail('ONBOARDING_NOT_COMPLETED','Canonical onboarding provisioning has not completed.',row);
    }
    case 'tenant_identity_active': {
      if(!company)return blocked('TARGET_COMPANY_REQUIRED','Authentication proof requires a representative tenant.',target);
      const row=await env.DB.prepare(`SELECT id,role,login,active,session_version FROM auth_identities WHERE company_id=? AND role='admin' AND active=1 ORDER BY id LIMIT 1`).bind(Number(company.company_id)).first();
      return row?pass({identityId:Number(row.id),role:row.role,login:row.login,active:Number(row.active)===1,sessionVersion:Number(row.session_version||1)}):blocked('TENANT_IDENTITY_MISSING','No active tenant administrator identity is available.',target);
    }
    case 'platform_user_active': {
      if(!company)return blocked('TARGET_COMPANY_REQUIRED','Platform account proof requires a representative tenant.',target);
      const row=await env.DB.prepare(`SELECT pu.id,pu.account_state FROM platform_users pu JOIN auth_identities ai ON ai.id=pu.principal_id WHERE pu.principal_type='tenant' AND ai.company_id=? AND ai.role='admin' AND ai.active=1 ORDER BY pu.id LIMIT 1`).bind(Number(company.company_id)).first();
      return row&&['registered','active'].includes(String(row.account_state))?pass(row):fail('PLATFORM_USER_NOT_ACTIVE','Tenant identity is not represented by an active platform user.',row||target);
    }
    case 'provisioning_completed': {
      if(!company)return blocked('TARGET_COMPANY_REQUIRED','Organization lifecycle proof requires a representative tenant.',target);
      const row=await env.DB.prepare(`SELECT provisioning_status,provisioning_step FROM organization_onboarding_records WHERE company_id=? LIMIT 1`).bind(Number(company.company_id)).first();
      return row?.provisioning_status==='COMPLETED'?pass(row):fail('PROVISIONING_INCOMPLETE','Organization provisioning is not complete.',row||target);
    }
    case 'organization_lifecycle_active':
      return company?(['VERIFIED','ACTIVE'].includes(String(company.status))?pass({status:company.status,statusVersion:Number(company.status_version||1)}):fail('ORGANIZATION_NOT_READY','Organization lifecycle is not VERIFIED or ACTIVE.',company)):blocked('TARGET_COMPANY_REQUIRED','Organization lifecycle proof requires a representative tenant.',target);
    case 'verification_approved': {
      if(!company)return blocked('TARGET_COMPANY_REQUIRED','Verification proof requires a representative tenant.',target);
      const row=await env.DB.prepare(`SELECT id,review_status,trust_level,verified_country_code FROM verification_profiles WHERE identity_type='tenant' AND identity_id=? LIMIT 1`).bind(Number(company.company_id)).first();
      return row?.review_status==='approved'?pass(row):fail('VERIFICATION_NOT_APPROVED','Tenant verification review is not approved.',row||target);
    }
    case 'required_checks_verified': {
      if(!company)return blocked('TARGET_COMPANY_REQUIRED','Verification checks require a representative tenant.',target);
      const rows=(await env.DB.prepare(`SELECT check_type,status FROM verification_checks vc JOIN verification_profiles vp ON vp.id=vc.profile_id WHERE vp.identity_type='tenant' AND vp.identity_id=? ORDER BY check_type`).bind(Number(company.company_id)).all()).results||[];
      const required=['email','phone','company','country','identity'];const missing=required.filter(x=>!rows.find(r=>r.check_type===x&&r.status==='verified'));
      return missing.length?fail('VERIFICATION_CHECKS_INCOMPLETE','Required verification checks are not all verified.',{missing,checks:rows}):pass({checks:rows});
    }
    case 'trust_key_active': {
      if(!company)return blocked('TARGET_COMPANY_REQUIRED','Trust proof requires a representative tenant.',target);
      const row=await env.DB.prepare(`SELECT tk.id,tk.status,tk.expires_at FROM trust_keys tk JOIN verification_profiles vp ON vp.id=tk.profile_id WHERE vp.identity_type='tenant' AND vp.identity_id=? AND tk.status='active' ORDER BY tk.id DESC LIMIT 1`).bind(Number(company.company_id)).first();
      return row?pass({id:Number(row.id),status:row.status,expiresAt:row.expires_at}):fail('TRUST_KEY_NOT_ACTIVE','No active Trust Key is available for the representative tenant.',target);
    }
    case 'plan_product_available': {
      const row=await env.DB.prepare(`SELECT p.id,p.code,p.active,c.status product_status,c.price_minor,c.currency FROM plans p LEFT JOIN plan_product_configuration c ON c.plan_id=p.id WHERE p.active=1 AND COALESCE(c.status,'active')='active' ORDER BY COALESCE(c.price_minor,0),p.id LIMIT 1`).first();
      return row?pass(row):fail('NO_SUBSCRIPTION_PRODUCT','No active subscription product configuration is available.',{});
    }
    case 'tenant_subscription_or_free_policy': {
      if(!company)return blocked('TARGET_COMPANY_REQUIRED','Tenant subscription proof requires a representative tenant.',target);
      const sub=await env.DB.prepare(`SELECT s.id,s.status,p.code plan_code FROM subscriptions s LEFT JOIN plans p ON p.id=s.plan_id WHERE s.company_id=? LIMIT 1`).bind(Number(company.company_id)).first();
      if(sub&&['active','trialing'].includes(String(sub.status)))return pass(sub);
      const free=await env.DB.prepare(`SELECT plan_code,billing_mode,subscription_class FROM subscription_policies WHERE subject_type='tenant_admin' AND country_code=? AND plan_code='free' AND billing_mode='free' AND active=1 LIMIT 1`).bind(countryCode).first();
      return free?pass({source:'free_policy',...free}):fail('TENANT_SUBSCRIPTION_NOT_ACTIVE','Representative tenant has neither an active subscription nor an active free-plan policy.',{subscription:sub||null,freePolicy:free||null});
    }
    case 'billing_policy_active': {
      const row=await env.DB.prepare(`SELECT jurisdiction_code,country_code,provider_code,status,active FROM billing_jurisdiction_policies WHERE country_code=? AND active=1 AND status='active' ORDER BY version DESC,id DESC LIMIT 1`).bind(countryCode).first();
      return row?pass(row):fail('BILLING_POLICY_MISSING','No active billing jurisdiction policy exists for the selected country.',{countryCode});
    }
    case 'billing_identity_active': {
      if(!company)return blocked('TARGET_COMPANY_REQUIRED','Tenant billing proof requires a representative tenant.',target);
      const row=await env.DB.prepare(`SELECT id,status,provider_code,version FROM billing_identities WHERE company_id=? LIMIT 1`).bind(Number(company.company_id)).first();
      return row?.status==='active'?pass(row):blocked('BILLING_IDENTITY_NOT_READY','Representative tenant does not yet have an active billing identity.',row||target);
    }
    case 'executor_or_driver_available': {
      if(!company)return blocked('TARGET_COMPANY_REQUIRED','People proof requires a representative tenant.',target);
      const driver=await env.DB.prepare(`SELECT id,name,active FROM drivers WHERE company_id=? AND active=1 ORDER BY id LIMIT 1`).bind(Number(company.company_id)).first();
      const executor=await env.DB.prepare(`SELECT pe.id,pe.display_name,pe.active FROM public_executor_identities pe JOIN tenant_executor_links tel ON tel.executor_id=pe.id WHERE tel.company_id=? AND tel.status='approved' AND pe.active=1 ORDER BY pe.id LIMIT 1`).bind(Number(company.company_id)).first();
      return driver||executor?pass({driver:driver||null,executor:executor||null}):blocked('NO_EXECUTION_ACTOR','No active driver or approved executor is available for the representative tenant.',target);
    }
    case 'executor_link_or_driver_identity': {
      if(!company)return blocked('TARGET_COMPANY_REQUIRED','Executor/driver identity proof requires a representative tenant.',target);
      const driver=await env.DB.prepare(`SELECT ai.id identity_id,d.id driver_id,d.name FROM drivers d JOIN auth_identities ai ON ai.driver_id=d.id AND ai.role='driver' AND ai.active=1 WHERE d.company_id=? AND d.active=1 ORDER BY d.id LIMIT 1`).bind(Number(company.company_id)).first();
      const executor=await env.DB.prepare(`SELECT pe.id executor_id,pe.login,pe.display_name FROM public_executor_identities pe JOIN tenant_executor_links tel ON tel.executor_id=pe.id WHERE tel.company_id=? AND tel.status='approved' AND pe.active=1 ORDER BY pe.id LIMIT 1`).bind(Number(company.company_id)).first();
      return driver||executor?pass({driver:driver||null,executor:executor||null}):blocked('EXECUTION_ACTOR_IDENTITY_MISSING','No active execution identity is linked to the representative tenant.',target);
    }
    case 'canonical_create_mission_action': {
      const actions=requiredActions();const missing=actions.filter(code=>!ACTION_CODES[requiredActionCodes.find(k=>ACTION_CODES[k]===code)]||!getServiceMapCode(code));
      const create=ACTION_CODES.CREATE_MISSION;
      const service=ACTION_SERVICE_MAP?.[create];
      return create&&service?pass({action:create,serviceMap:true,requiredActions:actions}):fail('CANONICAL_ACTION_CONVERGENCE_MISSING','Required canonical mission actions or service-map routes are unavailable.',{missing});
    }
    case 'mission_exists':
      return mission?pass({missionId:Number(mission.id),reference:mission.reference,status:mission.status,stateVersion:Number(mission.state_version||1)}):blocked('REPRESENTATIVE_MISSION_REQUIRED','Provide or create a representative mission to prove mission execution journeys.',target);
    case 'assignment_exists': {
      if(!mission)return blocked('REPRESENTATIVE_MISSION_REQUIRED','Assignment proof requires a representative mission.',target);
      const driver=await env.DB.prepare(`SELECT id,assignee_id AS driver_id FROM mission_active_assignment_projection WHERE mission_id=? ORDER BY id DESC LIMIT 1`).bind(Number(mission.id)).first();
      const executor=await env.DB.prepare(`SELECT id,assignee_id AS executor_id FROM mission_active_assignment_projection WHERE mission_id=? AND status='active' ORDER BY id DESC LIMIT 1`).bind(Number(mission.id)).first();
      return driver||executor||mission.owner_driver_id?pass({missionDriverId:mission.owner_driver_id||null,driverAssignment:driver||null,executorAssignment:executor||null}):blocked('MISSION_NOT_ASSIGNED','Representative mission has no canonical driver/executor assignment.',target);
    }
    case 'assignment_actor_active': {
      if(!mission)return blocked('REPRESENTATIVE_MISSION_REQUIRED','Assignment actor proof requires a representative mission.',target);
      const driver=mission.owner_driver_id?await env.DB.prepare(`SELECT id,active FROM drivers WHERE id=? AND company_id=? LIMIT 1`).bind(Number(mission.owner_driver_id),Number(mission.company_id)).first():null;
      const executor=await env.DB.prepare(`SELECT pe.id,pe.active FROM mission_active_assignment_projection mea JOIN public_executor_identities pe ON pe.id=mea.assignee_id WHERE mea.mission_id=? AND mea.status='active' AND mea.assignment_type='executor' AND mea.assignee_type='executor' LIMIT 1`).bind(Number(mission.id)).first();
      return driver?.active===1||executor?.active===1?pass({driver:driver||null,executor:executor||null}):fail('ASSIGNMENT_ACTOR_NOT_ACTIVE','Assigned execution actor is not active.',{driver,executor});
    }
    case 'committed_transition': {
      if(!mission)return blocked('REPRESENTATIVE_MISSION_REQUIRED','Transition proof requires a representative mission.',target);
      const row=await env.DB.prepare(`SELECT id,action_code,from_status,to_status,committed_at FROM mission_event_ledger WHERE mission_id=? AND outcome='committed' ORDER BY id DESC LIMIT 1`).bind(Number(mission.id)).first();
      return row?pass(row):blocked('NO_COMMITTED_TRANSITION','No committed canonical mission transition evidence exists for the representative mission.',target);
    }
    case 'custody_state_coherent': {
      if(!mission)return blocked('REPRESENTATIVE_MISSION_REQUIRED','Custody proof requires a representative mission.',target);
      const row=await env.DB.prepare(`SELECT id,status,current_holder_type,current_holder_id,target_type,target_id FROM mission_custody_cases WHERE mission_id=? ORDER BY id DESC LIMIT 1`).bind(Number(mission.id)).first();
      const coherent=!row||(['resolved','cancelled'].includes(row.status)||row.current_holder_type&&Number(row.current_holder_id||0)>0);
      return coherent?pass({custody:row||null}):fail('CUSTODY_STATE_INCOHERENT','Representative mission has an incomplete custody holder state.',{custody:row});
    }
    case 'mission_event_evidence': {
      if(!mission)return blocked('REPRESENTATIVE_MISSION_REQUIRED','Tracking proof requires a representative mission.',target);
      const row=await env.DB.prepare(`SELECT COUNT(*) count FROM mission_event_ledger WHERE mission_id=? AND outcome='committed'`).bind(Number(mission.id)).first();
      return Number(row?.count||0)>0?pass({committedEvents:Number(row.count)}):blocked('NO_TRACKING_EVIDENCE','No committed operational event evidence exists for the representative mission.',target);
    }
    case 'mission_file_or_delivery_proof': {
      if(!mission)return blocked('REPRESENTATIVE_MISSION_REQUIRED','Evidence proof requires a representative mission.',target);
      const files=await env.DB.prepare(`SELECT COUNT(*) count FROM mission_files WHERE mission_id=? AND disposition_status='active'`).bind(Number(mission.id)).first();
      const proof=await env.DB.prepare(`SELECT id,file_id,submitted_by_role FROM mission_delivery_proofs WHERE mission_id=? LIMIT 1`).bind(Number(mission.id)).first();
      return Number(files?.count||0)>0||proof?pass({activeFiles:Number(files?.count||0),deliveryProof:proof||null}):blocked('NO_MISSION_EVIDENCE','Representative mission has no active mission evidence or delivery proof.',target);
    }
    case 'completed_mission':
      return mission?(String(mission.status)==='Completed'?pass({missionId:Number(mission.id),status:mission.status}):blocked('MISSION_NOT_COMPLETED','Representative mission has not reached Completed.',{missionStatus:mission.status})):blocked('REPRESENTATIVE_MISSION_REQUIRED','Completion proof requires a representative mission.',target);
    case 'completion_transition': {
      if(!mission)return blocked('REPRESENTATIVE_MISSION_REQUIRED','Completion transition proof requires a representative mission.',target);
      const row=await env.DB.prepare(`SELECT id,from_status,to_status,committed_at FROM mission_event_ledger WHERE mission_id=? AND outcome='committed' AND to_status='Completed' ORDER BY id DESC LIMIT 1`).bind(Number(mission.id)).first();
      return row?pass(row):blocked('COMPLETION_TRANSITION_MISSING','No committed transition into Completed exists for the representative mission.',target);
    }
    case 'delivery_proof': {
      if(!mission)return blocked('REPRESENTATIVE_MISSION_REQUIRED','Delivery proof requires a representative mission.',target);
      const row=await env.DB.prepare(`SELECT id,file_id,submitted_by_role,created_at FROM mission_delivery_proofs WHERE mission_id=? LIMIT 1`).bind(Number(mission.id)).first();
      return row?pass(row):blocked('DELIVERY_PROOF_MISSING','Completed journey proof requires canonical delivery proof.',target);
    }
    default:return fail('UNKNOWN_VERIFICATION_STEP',`Unknown verification step: ${step}`,{});
  }
}

export async function runProductVerification(env,{actor,operationId=null,idempotencyKey=null,countryCode,sectorCode,companyId=null,missionId=null,mode='controlled',scenarioId=null,expectedActiveLaunchId=null,expectedActiveVersion=null}={}){
  const country=clean(countryCode,2).toUpperCase();
  const sector=clean(sectorCode,80)||'general';
  if(!/^[A-Z]{2}$/.test(country))throw Object.assign(new Error('VERIFICATION_COUNTRY_REQUIRED'),{status:400,code:'VERIFICATION_COUNTRY_REQUIRED'});
  if(!['controlled','observational'].includes(mode))throw Object.assign(new Error('VERIFICATION_MODE_INVALID'),{status:400,code:'VERIFICATION_MODE_INVALID'});
  const launch=await activeLaunch(env,country);
  let preparedScenario=null;
  if(scenarioId){
    preparedScenario=await env.DB.prepare(`SELECT id,launch_id,company_id,mission_id,sector_code,status,scenario_json,contract_hash,dependency_snapshot_hash FROM platform_product_test_scenarios WHERE id=? LIMIT 1`).bind(Number(scenarioId)).first();
    if(!preparedScenario)throw Object.assign(new Error('Prepared product test scenario was not found.'),{status:404,code:'PRODUCT_TEST_SCENARIO_NOT_FOUND'});
    if(String(preparedScenario.status)!=='prepared')throw Object.assign(new Error('The selected product test scenario is not prepared for execution.'),{status:409,code:'PRODUCT_TEST_SCENARIO_NOT_READY'});
    if(Number(preparedScenario.launch_id)!==Number(launch?.id||0))throw Object.assign(new Error('Prepared scenario does not match the active product version.'),{status:409,code:'PRODUCT_TEST_SCENARIO_LAUNCH_CHANGED'});
    const liveContract=await getProductContract(env,{launchId:Number(launch.id)});
    const release=await env.DB.prepare(`SELECT state,contract_hash,dependency_snapshot_hash FROM platform_product_release_lifecycles WHERE launch_id=? LIMIT 1`).bind(Number(launch.id)).first();
    const scenarioData=json(preparedScenario.scenario_json,{});
    const scenarioContractHash=preparedScenario.contract_hash||scenarioData.contractHash||null;
    const scenarioDependencyHash=preparedScenario.dependency_snapshot_hash||scenarioData.dependencySnapshotHash||null;
    if(!release||!['published','verified','live'].includes(String(release.state)))throw Object.assign(new Error('Active product release is not in a verifiable release state.'),{status:409,code:'PRODUCT_RELEASE_NOT_PUBLISHED'});
    if(scenarioContractHash!==release.contract_hash||scenarioContractHash!==liveContract.contractHash)throw Object.assign(new Error('Prepared scenario contract does not match the authorized active release contract.'),{status:409,code:'PRODUCT_TEST_SCENARIO_CONTRACT_STALE'});
    if(scenarioDependencyHash!==release.dependency_snapshot_hash)throw Object.assign(new Error('Prepared scenario dependency snapshot does not match the authorized active release dependencies.'),{status:409,code:'PRODUCT_TEST_SCENARIO_DEPENDENCY_STALE'});
    companyId=preparedScenario.company_id==null?companyId:Number(preparedScenario.company_id);
    missionId=preparedScenario.mission_id==null?missionId:Number(preparedScenario.mission_id);
    sectorCode=preparedScenario.sector_code||sectorCode;
  }
  if(expectedActiveLaunchId!=null&&Number(expectedActiveLaunchId)!==Number(launch?.id||0))throw Object.assign(new Error('PRODUCT_VERIFICATION_LAUNCH_CHANGED'),{status:409,code:'PRODUCT_VERIFICATION_LAUNCH_CHANGED'});
  if(expectedActiveVersion!=null&&String(expectedActiveVersion)!==String(launch?.version||''))throw Object.assign(new Error('PRODUCT_VERIFICATION_LAUNCH_CHANGED'),{status:409,code:'PRODUCT_VERIFICATION_LAUNCH_CHANGED'});
  const company=await targetCompany(env,{companyId,countryCode:country,sectorCode:sector});
  const selectedMission=company?await targetMission(env,{companyId:Number(company.company_id),missionId}):null;
  const runKey=`${country}|${sector}|${company?.company_id||0}|${crypto.randomUUID()}`;
  const existing=idempotencyKey?await env.DB.prepare(`SELECT * FROM platform_product_verification_runs WHERE country_code=? AND sector_code=? AND COALESCE(company_id,0)=COALESCE(?,0) AND idempotency_key=? ORDER BY id DESC LIMIT 1`).bind(country,sector,company?.company_id||null,idempotencyKey).first():null;
  if(existing)return getProductVerificationRun(env,Number(existing.id));
  const ins=await env.DB.prepare(`INSERT INTO platform_product_verification_runs(run_key,operation_id,idempotency_key,country_code,sector_code,launch_id,launch_version,company_id,mission_id,mode,status,journey_count) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).bind(runKey,operationId,idempotencyKey||null,country,sector,launch?.id||null,launch?.version||null,company?.company_id||null,selectedMission?.id||null,mode,'executing',PRODUCT_VERIFICATION_JOURNEYS.length).run();
  const runId=Number(ins.meta?.last_row_id||ins.last_row_id);
  const readiness=await evaluateProductLaunchReadiness(env,{countryCode:country,sectorCode:sector,manifest:launch?.manifest||{}});
  let sequence=0,passed=0,failedCount=0,blockedCount=0;
  try{
    for(const journey of PRODUCT_VERIFICATION_JOURNEYS){
      let journeyStatus='passed';
      for(const step of journey.steps){
        sequence++;
        const row=await env.DB.prepare(`INSERT INTO platform_product_verification_steps(run_id,sequence,journey_code,step_code,authority,proof_kind,status) VALUES(?,?,?,?,?,?, 'executing')`).bind(runId,sequence,journey.code,step,'canonical_runtime',step.includes('action')?'canonical_action':step.includes('transition')?'transition':step.includes('proof')||step.includes('evidence')?'evidence':step.includes('active')||step.includes('policy')||step.includes('product')?'configuration':'user_state').run();
        const stepId=Number(row.meta?.last_row_id||row.last_row_id);
        let result;try{result=await executeStep(env,step,{countryCode:country,sectorCode:sector,launch,company,mission:selectedMission});}catch(error){result=fail(error?.code||'VERIFICATION_STEP_ERROR',error?.message||'Verification step failed',{});}
        if(result.status==='passed')passed++;else if(result.status==='failed'){failedCount++;journeyStatus='failed'}else if(result.status==='blocked'){blockedCount++;if(journeyStatus!=='failed')journeyStatus='blocked'}
        await env.DB.prepare(`UPDATE platform_product_verification_steps SET status=?,evidence_json=?,error_code=?,error_message=?,completed_at=CURRENT_TIMESTAMP WHERE id=?`).bind(result.status,JSON.stringify(result.evidence||{}),result.errorCode||null,result.errorMessage||null,stepId).run();
      }
      await canonicalRun(env,`UPDATE platform_product_verification_steps SET evidence_json=json_set(evidence_json,'$.journeyStatus',?) WHERE run_id=? AND journey_code=?`,[journeyStatus,runId,journey.code],'product_verification.step_evidence');
    }
    const status=failedCount>0?'failed':blockedCount>0?'blocked':'succeeded';
    const result={engineVersion:PRODUCT_VERIFICATION_ENGINE_VERSION,scenarioId:preparedScenario?Number(preparedScenario.id):null,countryCode:country,sectorCode:sector,launch:{id:launch?.id||null,version:launch?.version||null},company:company?{id:Number(company.company_id),name:company.legal_name,status:company.status}:null,mission:selectedMission?{id:Number(selectedMission.id),reference:selectedMission.reference,status:selectedMission.status}:null,mode,readiness,journeys:PRODUCT_VERIFICATION_JOURNEYS.map(j=>j.code),counts:{passed,failed:failedCount,blocked:blockedCount}};
    await env.DB.prepare(`UPDATE platform_product_verification_runs SET status=?,passed_count=?,failed_count=?,blocked_count=?,result_json=?,completed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(status,passed,failedCount,blockedCount,JSON.stringify(result),runId).run();
    if(preparedScenario){await env.DB.prepare(`UPDATE platform_product_test_scenarios SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(status==='succeeded'?'consumed':'prepared',Number(preparedScenario.id)).run();}
    if(status==='succeeded' && launch?.id){
      await canonicalRun(env,`UPDATE platform_product_preparation_tasks SET status='completed',completion_note=?,evidence_json=?,updated_at=CURRENT_TIMESTAMP WHERE launch_id=? AND task_key='controlled-verification'`,[`Product Verification Engine ${PRODUCT_VERIFICATION_ENGINE_VERSION} completed successfully.`,JSON.stringify({runId,countryCode:country,sectorCode:sector,counts:{passed,failed:failedCount,blocked:blockedCount}}),Number(launch.id)],'product_verification.preparation_evidence');
    }
    return getProductVerificationRun(env,runId);
  }catch(error){
    await canonicalRun(env,`UPDATE platform_product_verification_runs SET status='failed',failed_count=failed_count+1,result_json=?,completed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?`,[JSON.stringify({errorCode:error?.code||'PRODUCT_VERIFICATION_FAILED',errorMessage:error?.message||'Product verification failed'}),runId],'product_verification.run_failure_evidence');
    throw error;
  }
}

export async function getProductVerificationRun(env,id){
  const row=await env.DB.prepare(`SELECT * FROM platform_product_verification_runs WHERE id=? LIMIT 1`).bind(Number(id)).first();
  if(!row)return null;
  const steps=(await env.DB.prepare(`SELECT * FROM platform_product_verification_steps WHERE run_id=? ORDER BY sequence`).bind(Number(id)).all()).results||[];
  return {...row,id:Number(row.id),operation_id:row.operation_id==null?null:Number(row.operation_id),company_id:row.company_id==null?null:Number(row.company_id),mission_id:row.mission_id==null?null:Number(row.mission_id),launch_id:row.launch_id==null?null:Number(row.launch_id),result:json(row.result_json,{}),steps:steps.map(x=>({...x,id:Number(x.id),run_id:Number(x.run_id),sequence:Number(x.sequence),evidence:json(x.evidence_json,{})}))};
}
export async function listProductVerificationRuns(env,{limit=25,countryCode=null,sectorCode=null,companyId=null}={}){
  const n=Math.min(Math.max(Number(limit)||25,1),100);const where=[];const binds=[];
  if(countryCode){where.push('country_code=?');binds.push(clean(countryCode,2).toUpperCase())}
  if(sectorCode){where.push('sector_code=?');binds.push(clean(sectorCode,80))}
  if(companyId){where.push('company_id=?');binds.push(Number(companyId))}
  const rows=(await env.DB.prepare(`SELECT * FROM platform_product_verification_runs ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY id DESC LIMIT ?`).bind(...binds,n).all()).results||[];
  return rows.map(x=>({...x,id:Number(x.id),operation_id:x.operation_id==null?null:Number(x.operation_id),company_id:x.company_id==null?null:Number(x.company_id),mission_id:x.mission_id==null?null:Number(x.mission_id),launch_id:x.launch_id==null?null:Number(x.launch_id),result:json(x.result_json,{})}));
}
export async function productVerificationSummary(env){
  const rows=(await env.DB.prepare(`SELECT status,COUNT(*) count FROM platform_product_verification_runs GROUP BY status`).all()).results||[];const counts={succeeded:0,failed:0,blocked:0,executing:0,preparing:0,verifying:0};for(const r of rows)if(counts[r.status]!=null)counts[r.status]=Number(r.count||0);
  const latest=(await env.DB.prepare(`SELECT id,country_code,sector_code,company_id,status,passed_count,failed_count,blocked_count,completed_at FROM platform_product_verification_runs ORDER BY id DESC LIMIT 10`).all()).results||[];
  return {engineVersion:PRODUCT_VERIFICATION_ENGINE_VERSION,counts,latest:latest.map(x=>({...x,id:Number(x.id),company_id:x.company_id==null?null:Number(x.company_id)}))};
}
