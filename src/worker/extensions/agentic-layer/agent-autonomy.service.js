import {canonicalFirst,canonicalAll} from '../../core/canonical-db.js';
import {auditAdminControl} from '../../security/admin-control-audit.service.js';
import {actionDefinition} from '../../application/actions/action-registry.js';


export const AGENT_CONTROLLED_AUTONOMY_VERSION='11.16.0';
export const AUTONOMY_SCOPE_TYPES=Object.freeze(['GLOBAL','COUNTRY','SECTOR','COUNTRY_SECTOR','COMPANY']);
export const AUTONOMY_RECOVERY_POLICIES=Object.freeze(['REASSESS','RETRY_CANDIDATE','ESCALATE_HUMAN']);

const RISK_DEFAULTS=Object.freeze({
  READ:{maxAutonomy:3,humanApproval:false,recovery:'REASSESS'},
  ADVISORY:{maxAutonomy:3,humanApproval:false,recovery:'REASSESS'},
  LOW_RISK:{maxAutonomy:3,humanApproval:false,recovery:'REASSESS'},
  OPERATIONAL:{maxAutonomy:4,humanApproval:false,recovery:'RETRY_CANDIDATE'},
  HIGH_IMPACT:{maxAutonomy:5,humanApproval:true,recovery:'ESCALATE_HUMAN'},
  IRREVERSIBLE:{maxAutonomy:5,humanApproval:true,recovery:'ESCALATE_HUMAN'}
});

export async function resolveAgentAutonomyPolicy(env,{companyId,countryCode,sectorCode,actionCode}={}){
  const code=String(actionCode||'').trim();
  const definition=actionDefinition(code);
  if(!definition)throw Object.assign(new Error('ACTION_NOT_REGISTERED'),{status:404,code:'ACTION_NOT_REGISTERED'});
  const riskClass=classifyRisk(definition);
  const required=requiredAutonomy(riskClass);
  const country=normalizeKey(countryCode||'ZZ');
  const sector=normalizeKey(sectorCode||'general');
  const company=Number(companyId||0)||0;
  const candidates=[];
  if(company)candidates.push({scopeType:'COMPANY',scopeKey:String(company),rank:5});
  if(country&&sector)candidates.push({scopeType:'COUNTRY_SECTOR',scopeKey:`${country}:${sector}`,rank:4});
  if(country)candidates.push({scopeType:'COUNTRY',scopeKey:country,rank:3});
  if(sector)candidates.push({scopeType:'SECTOR',scopeKey:sector,rank:2});
  candidates.push({scopeType:'GLOBAL',scopeKey:'*',rank:1});
  let row=null;
  for(const c of candidates){row=await canonicalFirst(env,`SELECT * FROM agent_action_autonomy_policies WHERE action_code=? AND scope_type=? AND scope_key=? AND active=1 LIMIT 1`,[code,c.scopeType,c.scopeKey],'agent_action_autonomy_policy_authority');if(row){row.scope_rank=c.rank;break;}}
  const defaults=RISK_DEFAULTS[riskClass]||RISK_DEFAULTS.OPERATIONAL;
  const resolved={
    version:AGENT_CONTROLLED_AUTONOMY_VERSION,
    actionCode:code,
    actionLabel:String(definition.label||code),
    riskClass,
    requiredAutonomy:required,
    scopeType:row?.scope_type||'BUILT_IN',
    scopeKey:row?.scope_key||`${riskClass}:safe-default`,
    maxAutonomyLevel:Math.min(defaults.maxAutonomy,Number(row?.max_autonomy_level??defaults.maxAutonomy)),
    executionEnabled:Boolean(Number(row?.execution_enabled||0)),
    humanApprovalRequired:Boolean(defaults.humanApproval||Number(row?.human_approval_required||0)),
    verificationRequired:true,
    providerRequired:Boolean(Number(row?.provider_required||0)),
    recoveryPolicy:normalizeRecovery(row?.recovery_policy||defaults.recovery),
    jurisdictionMode:String(row?.jurisdiction_mode||'POLICY_REQUIRED'),
    policyVersion:String(row?.policy_version||AGENT_CONTROLLED_AUTONOMY_VERSION),
    policyHash:await sha256(stableStringify({actionCode:code,riskClass,scopeType:row?.scope_type||'BUILT_IN',scopeKey:row?.scope_key||`${riskClass}:safe-default`,maxAutonomyLevel:Math.min(defaults.maxAutonomy,Number(row?.max_autonomy_level??defaults.maxAutonomy)),executionEnabled:Boolean(Number(row?.execution_enabled||0)),humanApprovalRequired:Boolean(defaults.humanApproval||Number(row?.human_approval_required||0)),verificationRequired:true,providerRequired:Boolean(Number(row?.provider_required||0)),recoveryPolicy:normalizeRecovery(row?.recovery_policy||defaults.recovery),jurisdictionMode:String(row?.jurisdiction_mode||'POLICY_REQUIRED'),policyVersion:String(row?.policy_version||AGENT_CONTROLLED_AUTONOMY_VERSION)})),
    source:row?'DATABASE_POLICY':'BUILT_IN_SAFE_DEFAULT'
  };
  return Object.freeze(resolved);
}

export async function getCompanyAutonomyConfig(env,companyId){
  const id=Number(companyId||0)||0;
  if(!id)return null;
  const row=await canonicalFirst(env,`SELECT company_id,mode,autonomy_level,execution_enabled,kill_switch_reason,policy_version,updated_by_role,updated_by_id,updated_at,created_at FROM agent_company_autonomy_config WHERE company_id=? LIMIT 1`,[id],'agent_company_autonomy_config');
  return row?normalizeCompanyConfig(row):null;
}

export async function resolveCompanyAutonomy(env,companyId){
  const id=Number(companyId||0)||0;
  const global=await readGlobalControl(env);
  const company=await getCompanyAutonomyConfig(env,id);
  return Object.freeze({
    global,
    company:company||{companyId:id,mode:'DISABLED',autonomyLevel:0,executionEnabled:false,killSwitchReason:'COMPANY_AUTONOMY_NOT_CONFIGURED',policyVersion:AGENT_CONTROLLED_AUTONOMY_VERSION},
    executionEnabled:Boolean(global.executionEnabled&&global.mode==='CONTROLLED_EXECUTION'&&company?.executionEnabled&&company?.mode==='CONTROLLED_EXECUTION'&&!global.killSwitchReason&&!company?.killSwitchReason),
    autonomyLevel:Math.min(Number(global.autonomyLevel||0),Number(company?.autonomyLevel||0))
  });
}

export async function evaluateControlledAutonomy(env,{companyId,countryCode,sectorCode,actionCode,providerAvailable=false}={}){
  const policy=await resolveAgentAutonomyPolicy(env,{companyId,countryCode,sectorCode,actionCode});
  const control=await resolveCompanyAutonomy(env,companyId);
  const failures=[];
  if(policy.jurisdictionMode==='DISABLED')failures.push('AUTONOMY_JURISDICTION_DISABLED');
  if(!policy.executionEnabled)failures.push('ACTION_AUTONOMY_NOT_ENABLED');
  if(!control.executionEnabled)failures.push('COMPANY_AUTONOMY_NOT_ENABLED');
  if(Number(control.autonomyLevel)<Number(policy.requiredAutonomy))failures.push('AUTONOMY_LEVEL_INSUFFICIENT');
  if(Number(control.autonomyLevel)>Number(policy.maxAutonomyLevel))failures.push('ACTION_AUTONOMY_CEILING_REACHED');
  if(policy.humanApprovalRequired)failures.push('HUMAN_APPROVAL_REQUIRED');
  if(!policy.verificationRequired)failures.push('VERIFICATION_REQUIRED');
  const jurisdiction=await resolveJurisdiction(env,{companyId,countryCode});
  if(policy.jurisdictionMode==='POLICY_REQUIRED'&&!jurisdiction.configured)failures.push('JURISDICTION_POLICY_REQUIRED');
  if(policy.providerRequired&&!providerAvailable)failures.push('PROVIDER_CAPABILITY_REQUIRED');
  return Object.freeze({allowed:failures.length===0,failures:Object.freeze(failures),policy,control,jurisdiction,executionMode:failures.length?'RECOMMEND_ONLY':'CONTROLLED_EXECUTION'});
}

export async function listAgentAutonomyPolicies(env,{actionCode=null,scopeType=null,limit=100}={}){
  const n=Math.min(200,Math.max(1,Number(limit)||100));const where=['active=1'];const args=[];
  if(actionCode){where.push('action_code=?');args.push(String(actionCode));}
  if(scopeType){where.push('scope_type=?');args.push(String(scopeType).toUpperCase());}
  return (await canonicalAll(env,`SELECT * FROM agent_action_autonomy_policies WHERE ${where.join(' AND ')} ORDER BY action_code,scope_type,scope_key LIMIT ?`,[...args,n],'agent_action_autonomy_policy_authority'))||[];
}

export async function upsertAgentAutonomyPolicy(env,actor,input={}){
  const actionCode=String(input.actionCode||'').trim();if(!actionDefinition(actionCode))throw fail('ACTION_NOT_REGISTERED',404);
  const scopeType=String(input.scopeType||'GLOBAL').toUpperCase();if(!AUTONOMY_SCOPE_TYPES.includes(scopeType))throw fail('AUTONOMY_SCOPE_INVALID',400);
  const scopeKey=normalizeScopeKey(scopeType,input.scopeKey);
  const max=Number(input.maxAutonomyLevel);if(!Number.isInteger(max)||max<0||max>5)throw fail('AUTONOMY_LEVEL_INVALID',400);
  const risk=classifyAgentActionRisk(actionDefinition(actionCode));
  const required=requiredAgentAutonomy(risk);
  const humanApproval=['HIGH_IMPACT','IRREVERSIBLE'].includes(risk)||Boolean(input.humanApprovalRequired);
  if(max<required&&Boolean(input.executionEnabled))throw fail('AUTONOMY_CEILING_BELOW_REQUIRED',409);
  const recovery=normalizeRecovery(input.recoveryPolicy||RISK_DEFAULTS[risk]?.recovery);
  const policyVersion=String(input.policyVersion||AGENT_CONTROLLED_AUTONOMY_VERSION).slice(0,80);
  const providerRequired=Boolean(input.providerRequired);
  const jurisdictionMode=['POLICY_REQUIRED','RESTRICTED','DISABLED'].includes(String(input.jurisdictionMode||'POLICY_REQUIRED'))?String(input.jurisdictionMode||'POLICY_REQUIRED'):'POLICY_REQUIRED';
  const executionEnabled=Boolean(input.executionEnabled)&&!humanApproval;
  await env.DB.prepare(`INSERT INTO agent_action_autonomy_policies(action_code,scope_type,scope_key,max_autonomy_level,execution_enabled,human_approval_required,verification_required,provider_required,recovery_policy,jurisdiction_mode,policy_version,active,updated_by_role,updated_by_id,updated_at) VALUES(?,?,?,?,?,1,1,?,?,?, ?,1,?,?,CURRENT_TIMESTAMP) ON CONFLICT(action_code,scope_type,scope_key) DO UPDATE SET max_autonomy_level=excluded.max_autonomy_level,execution_enabled=excluded.execution_enabled,human_approval_required=excluded.human_approval_required,verification_required=1,provider_required=excluded.provider_required,recovery_policy=excluded.recovery_policy,jurisdiction_mode=excluded.jurisdiction_mode,policy_version=excluded.policy_version,active=1,updated_by_role=excluded.updated_by_role,updated_by_id=excluded.updated_by_id,updated_at=CURRENT_TIMESTAMP`).bind(actionCode,scopeType,scopeKey,max,executionEnabled?1:0,providerRequired?1:0,recovery,jurisdictionMode,policyVersion,String(actor?.role||'platform_super_administrator'),String(actor?.id||actor?.userId||'platform')).run();
  const saved=await canonicalFirst(env,`SELECT * FROM agent_action_autonomy_policies WHERE action_code=? AND scope_type=? AND scope_key=? LIMIT 1`,[actionCode,scopeType,scopeKey],'agent_action_autonomy_policy_authority');
  await auditAdminControl(env,{actor,action:'platform.agentic.autonomy.policy.updated',resourceType:'agent_autonomy_policy',resourceId:String(saved?.id||''),targetCompanyId:scopeType==='COMPANY'?Number(scopeKey)||null:null,metadata:{actionCode,scopeType,scopeKey,maxAutonomyLevel:max,executionEnabled:Boolean(executionEnabled),humanApprovalRequired:humanApproval,verificationRequired:true,providerRequired,jurisdictionMode,recoveryPolicy:recovery,policyVersion}});
  return saved;
}

export async function upsertCompanyAutonomyConfig(env,actor,input={}){
  const companyId=Number(input.companyId||0)||0;if(!companyId)throw fail('COMPANY_ID_REQUIRED',400);
  const mode=String(input.mode||'DISABLED').toUpperCase();if(!['DISABLED','RECOMMEND_ONLY','CONTROLLED_EXECUTION'].includes(mode))throw fail('COMPANY_AUTONOMY_MODE_INVALID',400);
  const autonomy=Number(input.autonomyLevel);if(!Number.isInteger(autonomy)||autonomy<0||autonomy>5)throw fail('COMPANY_AUTONOMY_LEVEL_INVALID',400);
  const executionEnabled=Boolean(input.executionEnabled);
  const reason=String(input.killSwitchReason||'').trim().slice(0,500)||null;
  if(mode==='DISABLED'&&!reason)throw fail('COMPANY_AUTONOMY_DISABLE_REASON_REQUIRED',400);
  if(executionEnabled&&mode!=='CONTROLLED_EXECUTION')throw fail('COMPANY_EXECUTION_REQUIRES_CONTROLLED_MODE',409);
  if(executionEnabled&&autonomy<3)throw fail('COMPANY_EXECUTION_REQUIRES_LEVEL_3',409);
  await env.DB.prepare(`INSERT INTO agent_company_autonomy_config(company_id,mode,autonomy_level,execution_enabled,kill_switch_reason,policy_version,updated_by_role,updated_by_id,updated_at) VALUES(?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(company_id) DO UPDATE SET mode=excluded.mode,autonomy_level=excluded.autonomy_level,execution_enabled=excluded.execution_enabled,kill_switch_reason=excluded.kill_switch_reason,policy_version=excluded.policy_version,updated_by_role=excluded.updated_by_role,updated_by_id=excluded.updated_by_id,updated_at=CURRENT_TIMESTAMP`).bind(companyId,mode,autonomy,executionEnabled?1:0,reason,String(input.policyVersion||AGENT_CONTROLLED_AUTONOMY_VERSION),String(actor?.role||'platform_super_administrator'),String(actor?.id||actor?.userId||'platform')).run();
  const saved=await getCompanyAutonomyConfig(env,companyId);
  await auditAdminControl(env,{actor,action:'platform.agentic.autonomy.company.updated',resourceType:'agent_company_autonomy',resourceId:String(companyId),targetCompanyId:companyId,metadata:{mode:saved.mode,autonomyLevel:saved.autonomyLevel,executionEnabled:saved.executionEnabled,killSwitch:Boolean(saved.killSwitchReason),policyVersion:saved.policyVersion}});
  return saved;
}

async function resolveJurisdiction(env,{companyId,countryCode}={}){
  const country=String(countryCode||'').trim().toUpperCase();
  if(!/^[A-Z]{2}$/.test(country)||country==='ZZ')return {configured:false,countryCode:country||'ZZ',reason:'COUNTRY_UNRESOLVED'};
  const policy=await canonicalFirst(env,`SELECT code,status FROM jurisdiction_policies WHERE country_code=? AND status='active' ORDER BY effective_version DESC LIMIT 1`,[country],'jurisdiction_policy_authority');
  const compliance=companyId?await canonicalFirst(env,`SELECT status,jurisdiction_code FROM organization_compliance_policies WHERE company_id=? LIMIT 1`,[Number(companyId)],'organization_compliance_policy_authority'):null;
  return {configured:Boolean(policy),countryCode:country,jurisdictionCode:policy?.code||compliance?.jurisdiction_code||null,complianceStatus:compliance?.status||null};
}
function normalizeCompanyConfig(row){return Object.freeze({companyId:Number(row.company_id),mode:String(row.mode),autonomyLevel:Number(row.autonomy_level||0),executionEnabled:Boolean(Number(row.execution_enabled)),killSwitchReason:row.kill_switch_reason||null,policyVersion:String(row.policy_version||''),updatedByRole:row.updated_by_role||null,updatedById:row.updated_by_id||null,updatedAt:row.updated_at||null,createdAt:row.created_at||null});}
function normalizeKey(value){return String(value||'').trim().toLowerCase().replace(/[^a-z0-9:_-]/g,'_').slice(0,120);}
function normalizeScopeKey(type,value){if(type==='GLOBAL')return '*';if(type==='COMPANY'){const n=Number(value||0)||0;if(!n)throw fail('COMPANY_SCOPE_KEY_REQUIRED',400);return String(n);}const key=normalizeKey(value);if(!key)throw fail('AUTONOMY_SCOPE_KEY_REQUIRED',400);if(type==='COUNTRY'&&!/^[a-z]{2}$/.test(key))throw fail('COUNTRY_SCOPE_KEY_INVALID',400);if(type==='COUNTRY_SECTOR'&&!/^[a-z]{2}:[a-z0-9:_-]+$/.test(key))throw fail('COUNTRY_SECTOR_SCOPE_KEY_INVALID',400);return key;}
function normalizeRecovery(value){return AUTONOMY_RECOVERY_POLICIES.includes(String(value))?String(value):'REASSESS';}
function fail(message,status){throw Object.assign(new Error(message),{status,code:message});}
function stableStringify(value){if(value===null||typeof value!=='object')return JSON.stringify(value);if(Array.isArray(value))return `[${value.map(stableStringify).join(',')}]`;return `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;}
async function sha256(value){const bytes=new TextEncoder().encode(String(value));const digest=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');}

function classifyRisk(definition){if(definition?.quality?.executionClass==='HIGH_CONSEQUENCE')return definition.confirmation?'HIGH_IMPACT':'OPERATIONAL';if(definition?.confirmation)return 'HIGH_IMPACT';if(definition?.safeByDefault)return 'LOW_RISK';if(definition?.quality?.executionClass==='READ_ONLY')return 'READ';return 'OPERATIONAL';}
function requiredAutonomy(risk){return risk==='READ'?3:risk==='ADVISORY'?3:risk==='LOW_RISK'?3:risk==='OPERATIONAL'?4:5;}
async function readGlobalControl(env){const row=await canonicalFirst(env,`SELECT id,version,mode,autonomy_level,execution_enabled,policy_version,kill_switch_reason,updated_by_role,updated_by_id,updated_at,created_at FROM agentic_control_config WHERE id=1 LIMIT 1`,[],'agentic_control_config');if(!row)throw Object.assign(new Error('AGENTIC_CONTROL_UNAVAILABLE'),{status:503,code:'AUTHORITY_UNAVAILABLE'});return Object.freeze({version:Number(row.version||1),mode:String(row.mode),autonomyLevel:Number(row.autonomy_level||0),executionEnabled:Boolean(Number(row.execution_enabled)),policyVersion:String(row.policy_version||''),killSwitchReason:row.kill_switch_reason||null,updatedByRole:row.updated_by_role||null,updatedById:row.updated_by_id||null,updatedAt:row.updated_at||null,createdAt:row.created_at||null});}
