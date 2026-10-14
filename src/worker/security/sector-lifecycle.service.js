import {RELEASE_VERSION} from '../core/release.js';

export const SECTOR_LIFECYCLE_VERSION=RELEASE_VERSION;
const clean=(v,max=160)=>String(v??'').trim().slice(0,max);
const int=v=>Number.isFinite(Number(v))?Number(v):0;
const json=(v,f)=>{try{return JSON.parse(v||'null')??f}catch{return f}};
const fail=(message,status=400,code='SECTOR_LIFECYCLE_INVALID')=>Object.assign(new Error(message),{status,code});

export async function getLifecycleDefinition(env,id){
  const d=await env.DB.prepare(`SELECT * FROM platform_lifecycle_definitions WHERE id=? LIMIT 1`).bind(int(id)).first();
  if(!d)return null;
  const [states,transitions]=await Promise.all([
    env.DB.prepare(`SELECT * FROM platform_lifecycle_states WHERE lifecycle_definition_id=? ORDER BY sequence_no,id`).bind(int(id)).all(),
    env.DB.prepare(`SELECT * FROM platform_lifecycle_transitions WHERE lifecycle_definition_id=? ORDER BY sequence_no,id`).bind(int(id)).all()
  ]);
  return normalizeDefinition(d,states.results||[],transitions.results||[]);
}

export async function listLifecycleDefinitions(env,{countryCode='',sectorCode='',status=''}={}){
  const where=[];const args=[];
  if(countryCode){where.push(`(country_code=? OR country_code IS NULL)`);args.push(clean(countryCode,2).toUpperCase());}
  if(sectorCode){where.push(`sector_code=?`);args.push(clean(sectorCode).toLowerCase());}
  if(status){where.push(`status=?`);args.push(clean(status,30));}
  const q=`SELECT * FROM platform_lifecycle_definitions${where.length?' WHERE '+where.join(' AND '):''} ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'validated' THEN 1 WHEN 'draft' THEN 2 ELSE 3 END,sector_code,version DESC,id DESC LIMIT 200`;
  const rows=(await env.DB.prepare(q).bind(...args).all()).results||[];
  return Promise.all(rows.map(r=>getLifecycleDefinition(env,r.id)));
}

export async function createOrUpdateLifecycleDefinition(env,actor,input={}){
  const sectorCode=clean(input.sectorCode,120).toLowerCase();
  const countryCode=input.countryCode?clean(input.countryCode,2).toUpperCase():null;
  const key=clean(input.lifecycleKey,160)||`${sectorCode}.${clean(input.keySuffix||'custom',80)}`.toLowerCase();
  const name=clean(input.name,180);
  const states=normalizeStates(input.states);
  const transitions=normalizeTransitions(input.transitions);
  if(!sectorCode||!name||!states.length)throw fail('Lifecycle sector, name and states are required');
  const initial=clean(input.initialStateCode||states[0].stateCode,80).toUpperCase();
  if(!states.some(s=>s.stateCode===initial))throw fail('Initial lifecycle state does not exist');
  for(const t of transitions){
    if(!states.some(s=>s.stateCode===t.fromStateCode)||!states.some(s=>s.stateCode===t.toStateCode))throw fail(`Lifecycle transition ${t.transitionCode} references an unknown state`);
  }
  const previous=input.lifecycleDefinitionId?await env.DB.prepare(`SELECT version FROM platform_lifecycle_definitions WHERE id=? LIMIT 1`).bind(int(input.lifecycleDefinitionId)).first():null;
  const version=previous?Number(previous.version)+1:Math.max(1,Number(input.version||1));
  const r=await env.DB.prepare(`INSERT INTO platform_lifecycle_definitions(lifecycle_key,name,description,country_code,sector_code,product_definition_id,launch_id,version,status,initial_state_code,terminal_states_json,liveness_policy_json,metadata_json,created_by_type,created_by_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(key,name,clean(input.description,2000),countryCode,sectorCode,input.productDefinitionId?int(input.productDefinitionId):null,input.launchId?int(input.launchId):null,version,'draft',initial,JSON.stringify(states.filter(s=>s.terminal).map(s=>s.stateCode)),JSON.stringify(input.livenessPolicy||{terminalRequiresNoNextAction:true,nonTerminalRequiresNextActionOrWaiting:true}),JSON.stringify(input.metadata||{}),actor?.role||'platform_super_administrator',actor?.id==null?null:String(actor.id)).run();
  const id=int(r.meta?.last_row_id||r.last_row_id);
  await env.DB.batch(states.map(s=>env.DB.prepare(`INSERT INTO platform_lifecycle_states(lifecycle_definition_id,state_code,label,stage,terminal,custody_active,sequence_no,metadata_json) VALUES(?,?,?,?,?,?,?,?)`).bind(id,s.stateCode,s.label,s.stage,s.terminal?1:0,s.custodyActive?1:0,s.sequenceNo,JSON.stringify(s.metadata||{}))));
  if(transitions.length)await env.DB.batch(transitions.map(t=>env.DB.prepare(`INSERT INTO platform_lifecycle_transitions(lifecycle_definition_id,from_state_code,to_state_code,transition_code,action_code,reason_code,required_role_codes_json,guard_json,evidence_policy_json,sequence_no) VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(id,t.fromStateCode,t.toStateCode,t.transitionCode,t.actionCode||null,t.reasonCode||null,JSON.stringify(t.requiredRoles||[]),JSON.stringify(t.guard||{}),JSON.stringify(t.evidencePolicy||{}),t.sequenceNo)));
  return getLifecycleDefinition(env,id);
}

export async function validateLifecycleDefinition(env,id){
  const d=await getLifecycleDefinition(env,id);if(!d)throw fail('Lifecycle definition not found',404,'LIFECYCLE_NOT_FOUND');
  if(!d.states.some(s=>s.stateCode===d.initialStateCode))throw fail('Lifecycle initial state is missing',422);
  const stateCodes=new Set(d.states.map(s=>s.stateCode));
  const blockers=[];
  for(const t of d.transitions){if(!stateCodes.has(t.fromStateCode)||!stateCodes.has(t.toStateCode))blockers.push(`UNKNOWN_STATE:${t.transitionCode}`);}
  const terminal=new Set(d.terminalStates);
  for(const s of d.states){if(!terminal.has(s.stateCode)&&!d.transitions.some(t=>t.fromStateCode===s.stateCode))blockers.push(`NO_NEXT_TRANSITION:${s.stateCode}`);}
  if(blockers.length)throw fail(`Lifecycle definition is invalid: ${blockers.join(',')}`,422,'LIFECYCLE_VALIDATION_BLOCKED');
  await env.DB.prepare(`UPDATE platform_lifecycle_definitions SET status='validated',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status IN ('draft','validated')`).bind(int(id)).run();
  return getLifecycleDefinition(env,id);
}

export async function activateLifecycleForLaunchSector(env,actor,{launchId,sectorCode,lifecycleDefinitionId,productDefinitionId=null}={}){
  const launch=await env.DB.prepare(`SELECT id,status,active FROM country_product_launches WHERE id=? LIMIT 1`).bind(int(launchId)).first();
  if(!launch)throw fail('Product launch not found',404,'LAUNCH_NOT_FOUND');
  if(!['draft','validated','active'].includes(String(launch.status)))throw fail('Product launch is not lifecycle-editable',409,'LAUNCH_LIFECYCLE_LOCKED');
  const definition=await getLifecycleDefinition(env,lifecycleDefinitionId);
  if(!definition||!['validated','active'].includes(definition.status))throw fail('Lifecycle must be validated before binding',409,'LIFECYCLE_NOT_VALIDATED');
  if(definition.sectorCode!==clean(sectorCode,120).toLowerCase())throw fail('Lifecycle sector does not match binding sector',409,'LIFECYCLE_SECTOR_MISMATCH');
  await env.DB.prepare(`UPDATE platform_product_sector_lifecycles SET status='retired',active=0,updated_at=CURRENT_TIMESTAMP WHERE launch_id=? AND sector_code=? AND active=1`).bind(int(launchId),clean(sectorCode,120).toLowerCase()).run();
  await env.DB.prepare(`INSERT INTO platform_product_sector_lifecycles(launch_id,product_definition_id,sector_code,lifecycle_definition_id,status,active,effective_at,created_by_type,created_by_id) VALUES(?,?,?,?, 'active',1,CURRENT_TIMESTAMP,?,?)`).bind(int(launchId),productDefinitionId?int(productDefinitionId):null,clean(sectorCode,120).toLowerCase(),int(lifecycleDefinitionId),actor?.role||'platform_super_administrator',actor?.id==null?null:String(actor.id)).run();
  return resolveLaunchSectorLifecycle(env,int(launchId),clean(sectorCode,120).toLowerCase());
}

export async function resolveLaunchSectorLifecycle(env,launchId,sectorCode){
  const row=await env.DB.prepare(`SELECT p.*,l.country_code FROM platform_product_sector_lifecycles p JOIN country_product_launches l ON l.id=p.launch_id WHERE p.launch_id=? AND p.sector_code=? AND p.active=1 LIMIT 1`).bind(int(launchId),clean(sectorCode,120).toLowerCase()).first();
  if(!row)return null;
  const definition=await getLifecycleDefinition(env,row.lifecycle_definition_id);
  return {binding:{...row,id:int(row.id),launchId:int(row.launch_id),lifecycleDefinitionId:int(row.lifecycle_definition_id),active:Number(row.active)===1},definition};
}

export function normalizeLifecycleState(v){return normalizeState(v);}

export async function resolveLifecycleForNewMission(env,companyId){
  const context=await env.DB.prepare(`SELECT cmp.country_code,cmp.sector_code,l.id launch_id,psl.product_definition_id,psl.lifecycle_definition_id FROM company_management_profiles cmp LEFT JOIN country_product_launches l ON l.country_code=cmp.country_code AND l.status='active' AND l.active=1 LEFT JOIN platform_product_sector_lifecycles psl ON psl.launch_id=l.id AND psl.sector_code=cmp.sector_code AND psl.status='active' AND psl.active=1 WHERE cmp.company_id=? LIMIT 1`).bind(int(companyId)).first();
  const sector=clean(context?.sector_code||'general',120).toLowerCase();
  if(context?.launch_id){
    if(!context.lifecycle_definition_id)throw fail(`Active product launch has no lifecycle contract for sector ${sector}`,503,'LIFECYCLE_AUTHORITY_UNAVAILABLE');
    const d=await getLifecycleDefinition(env,context.lifecycle_definition_id);
    if(!d||!['validated','active'].includes(String(d.status)))throw fail('Active product lifecycle contract is unavailable',503,'LIFECYCLE_AUTHORITY_UNAVAILABLE');
    return {countryCode:context.country_code||'ZZ',sectorCode:sector,launchId:int(context.launch_id),productDefinitionId:context.product_definition_id==null?null:int(context.product_definition_id),definition:d};
  }
  const sectorRow=await env.DB.prepare(`SELECT id FROM platform_lifecycle_definitions WHERE lower(sector_code)=? AND version=1 AND status IN ('active','validated') ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END,id DESC LIMIT 1`).bind(sector).first();
  const row=sectorRow||await env.DB.prepare(`SELECT id FROM platform_lifecycle_definitions WHERE lifecycle_key=? AND version=1 AND status='active' LIMIT 1`).bind('general.default').first();
  if(!row)throw fail('No lifecycle contract is available for this sector',503,'LIFECYCLE_AUTHORITY_UNAVAILABLE');
  const d=await getLifecycleDefinition(env,row.id);if(!d)throw fail('Lifecycle authority is unavailable',503,'LIFECYCLE_AUTHORITY_UNAVAILABLE');
  return {countryCode:context?.country_code||'ZZ',sectorCode:sector,launchId:null,productDefinitionId:null,definition:d};
}

export async function resolveLifecycleForMission(env,mission){
  if(mission?.lifecycle_definition_id){const d=await getLifecycleDefinition(env,mission.lifecycle_definition_id);if(d)return d;}
  const sector=clean(mission?.sector_code||'general',120).toLowerCase();
  const sectorRow=await env.DB.prepare(`SELECT id FROM platform_lifecycle_definitions WHERE lower(sector_code)=? AND version=1 AND status IN ('active','validated') ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END,id DESC LIMIT 1`).bind(sector).first();
  const row=sectorRow||await env.DB.prepare(`SELECT id FROM platform_lifecycle_definitions WHERE lifecycle_key=? AND version=1 AND status IN ('active','validated') LIMIT 1`).bind('general.default').first();
  if(!row)throw fail('No lifecycle contract is available for this sector',503,'LIFECYCLE_AUTHORITY_UNAVAILABLE');
  const d=await getLifecycleDefinition(env,row.id);if(!d)throw fail('Lifecycle authority is unavailable',503,'LIFECYCLE_AUTHORITY_UNAVAILABLE');
  return d;
}

export async function assertLifecycleTransition(env,mission,fromState,toState){
  const d=await resolveLifecycleForMission(env,mission);
  const from=normalizeState(fromState),to=normalizeState(toState);
  const transition=d.transitions.find(t=>t.fromStateCode===from&&t.toStateCode===to);
  if(!transition)throw fail(`Lifecycle transition ${from} → ${to} is not allowed`,409,'LIFECYCLE_TRANSITION_NOT_ALLOWED');
  return {definition:d,transition};
}

export async function lifecycleHealthForLaunch(env,launchId,sectorCodes=[]){
  const sectors=[...new Set((sectorCodes||[]).map(x=>clean(x,120).toLowerCase()).filter(Boolean))];
  const rows=[];
  for(const sector of sectors){
    const r=await env.DB.prepare(`SELECT p.*,d.name lifecycle_name,d.version lifecycle_version,d.status lifecycle_status FROM platform_product_sector_lifecycles p JOIN platform_lifecycle_definitions d ON d.id=p.lifecycle_definition_id WHERE p.launch_id=? AND p.sector_code=? AND p.active=1 LIMIT 1`).bind(int(launchId),sector).first();
    rows.push({sectorCode:sector,configured:Boolean(r),valid:Boolean(r&&['validated','active'].includes(String(r.lifecycle_status))) ,lifecycleDefinitionId:r?int(r.lifecycle_definition_id):null});
  }
  return {valid:rows.length>0&&rows.every(x=>x.valid),sectors:rows};
}

function normalizeDefinition(d,states,transitions){return {id:int(d.id),lifecycleKey:d.lifecycle_key,name:d.name,description:d.description,countryCode:d.country_code||null,sectorCode:d.sector_code,productDefinitionId:d.product_definition_id==null?null:int(d.product_definition_id),launchId:d.launch_id==null?null:int(d.launch_id),version:int(d.version),status:d.status,initialStateCode:d.initial_state_code,terminalStates:json(d.terminal_states_json,[]),livenessPolicy:json(d.liveness_policy_json,{}),metadata:json(d.metadata_json,{}),states:states.map(s=>({id:int(s.id),stateCode:s.state_code,label:s.label,stage:s.stage,terminal:Number(s.terminal)===1,custodyActive:Number(s.custody_active)===1,sequenceNo:int(s.sequence_no),metadata:json(s.metadata_json,{})})),transitions:transitions.map(t=>({id:int(t.id),fromStateCode:t.from_state_code,toStateCode:t.to_state_code,transitionCode:t.transition_code,actionCode:t.action_code||null,reasonCode:t.reason_code||null,requiredRoles:json(t.required_role_codes_json,[]),guard:json(t.guard_json,{}),evidencePolicy:json(t.evidence_policy_json,{}),sequenceNo:int(t.sequence_no)}))};}
function normalizeStates(value){return (Array.isArray(value)?value:[]).map((s,i)=>({stateCode:clean(s.stateCode||s.code,80).toUpperCase(),label:clean(s.label||s.name||s.code,160),stage:clean(s.stage||'OPERATIONAL',80).toUpperCase(),terminal:Boolean(s.terminal),custodyActive:Boolean(s.custodyActive),sequenceNo:int(s.sequenceNo||((i+1)*10)),metadata:s.metadata||{}})).filter(s=>s.stateCode&&s.label);}
function normalizeTransitions(value){return (Array.isArray(value)?value:[]).map((t,i)=>({fromStateCode:clean(t.fromStateCode||t.from,80).toUpperCase(),toStateCode:clean(t.toStateCode||t.to,80).toUpperCase(),transitionCode:clean(t.transitionCode||t.code,100).toUpperCase(),actionCode:clean(t.actionCode,100)||null,reasonCode:clean(t.reasonCode,120)||null,requiredRoles:Array.isArray(t.requiredRoles)?t.requiredRoles.map(x=>clean(x,80)).filter(Boolean):[],guard:t.guard||{},evidencePolicy:t.evidencePolicy||{},sequenceNo:int(t.sequenceNo||((i+1)*10))})).filter(t=>t.fromStateCode&&t.toStateCode&&t.transitionCode);}
function normalizeState(v){return clean(v,80).toUpperCase().replaceAll('PICKEDUP','PICKED_UP').replaceAll('INTRANSIT','IN_TRANSIT');}
