/**
 * Canonical Human Work presentation contract.
 *
 * This is a read/composition contract only. It does not own mission, assignment,
 * lifecycle, authorization, action, network, or evidence truth. Mutation remains
 * owned by canonical Action Registry / secured command paths.
 */

const STATES=Object.freeze(new Set(['urgent','attention','waiting','watch','working','done','escalated','breach']));
const AUTHORITIES=Object.freeze(new Set([
  'mission','attention','liveness','assignment','network','people','object','product','system'
]));

const text=v=>String(v??'').trim();
const num=v=>Number(v||0);
const asNullableText=v=>{const s=text(v);return s||null;};

function freeze(value){
  if(!value||typeof value!=='object'||Object.isFrozen(value))return value;
  Object.freeze(value);
  for(const child of Object.values(value))freeze(child);
  return value;
}

function cleanReason(reason={}){
  if(typeof reason==='string')return {code:null,label:text(reason),icon:null};
  return {code:asNullableText(reason?.code),label:asNullableText(reason?.label),icon:asNullableText(reason?.icon)};
}

function cleanContext(context={},fallback={}){
  return {
    type:asNullableText(context?.type||fallback.type),
    id:asNullableText(context?.id||fallback.id),
    reference:asNullableText(context?.reference||fallback.reference),
    href:asNullableText(context?.href||fallback.href),
    details:context?.details&&typeof context.details==='object'?Object.freeze({...context.details}):null
  };
}

function cleanAction(action=null,fallbackHref=null){
  if(!action&&!fallbackHref)return null;
  if(typeof action==='string')return {id:null,label:text(action),href:asNullableText(fallbackHref),enabled:true};
  return {
    id:asNullableText(action?.id||action?.code),
    label:asNullableText(action?.label||action?.title),
    href:asNullableText(action?.href||fallbackHref),
    enabled:action?.enabled!==false
  };
}

function cleanWaiting(waiting=null,state='working'){
  if(!waiting&&state!=='waiting')return null;
  if(typeof waiting==='string')return {active:true,code:null,label:text(waiting)};
  return {
    active:waiting?.active!==false,
    code:asNullableText(waiting?.code),
    label:asNullableText(waiting?.label||waiting?.reason)
  };
}

function cleanEvidence(evidence=[]){
  const rows=Array.isArray(evidence)?evidence:[evidence];
  return rows.filter(Boolean).slice(0,20).map(x=>typeof x==='string'
    ? {type:'reference',label:text(x),href:null}
    : {type:asNullableText(x?.type)||'reference',label:asNullableText(x?.label||x?.title)||'Evidence',href:asNullableText(x?.href)}
  );
}

function cleanNextState(nextState,status,state){
  if(typeof nextState==='string')return {code:null,label:text(nextState)};
  return {
    code:asNullableText(nextState?.code||status),
    label:asNullableText(nextState?.label||nextState?.status||state)
  };
}

/**
 * Normalize one human work item. Domain adapters should call this function;
 * application surfaces must consume the returned contract rather than inventing
 * another work-item shape.
 */
export function normalizeHumanWorkItem(input={},defaults={}){
  const state=STATES.has(text(input.workState||input.state).toLowerCase())
    ? text(input.workState||input.state).toLowerCase()
    : 'working';
  const context=cleanContext(input.context,{
    type:input.contextType||defaults.contextType||'mission',
    id:input.id||input.missionId||defaults.id,
    reference:input.reference||defaults.reference,
    href:input.link||input.href||defaults.href
  });
  const status=text(input.status||defaults.status||'Active');
  const source=text(input.sourceAuthority||defaults.sourceAuthority||'mission').toLowerCase();
  const sourceAuthority=AUTHORITIES.has(source)?source:'mission';
  const priority=input.priority&&typeof input.priority==='object'
    ? {level:asNullableText(input.priority.level)||state,score:num(input.priority.score??input.score)}
    : {level:asNullableText(input.level)||state,score:num(input.score)};
  const item={
    id:asNullableText(input.id||input.missionId||context.id),
    type:asNullableText(input.type)||context.type||'mission',
    situation:asNullableText(input.situation||defaults.situation)||status,
    priority,
    responsibility:asNullableText(input.responsibility||defaults.responsibility)||null,
    sourceAuthority,
    reason:cleanReason(input.reason||{code:input.reasonCode,label:input.reasonLabel||input.reason}),
    context,
    availableAction:cleanAction(input.availableAction||input.action,context.href),
    waitingCondition:cleanWaiting(input.waitingCondition,state),
    evidence:cleanEvidence(input.evidence||[]),
    nextState:cleanNextState(input.nextState,status,state),
    state,
    status,
    updatedAt:asNullableText(input.updatedAt||input.updated_at),
    deadlineAt:asNullableText(input.deadlineAt||input.deadlineAtUtc||input.deadline_at_utc),
    degraded:Boolean(input.degraded)
  };
  if(!item.id)throw new TypeError('HumanWorkItem requires a stable id.');
  return freeze(item);
}

export function assertHumanWorkItem(item){
  const required=['id','situation','priority','responsibility','sourceAuthority','reason','context','availableAction','waitingCondition','evidence','nextState'];
  const missing=required.filter(key=>!(key in (item||{})));
  if(missing.length)throw new TypeError(`Invalid HumanWorkItem: missing ${missing.join(', ')}`);
  if(!AUTHORITIES.has(item.sourceAuthority))throw new TypeError(`Invalid HumanWorkItem sourceAuthority: ${item.sourceAuthority}`);
  if(!STATES.has(item.state))throw new TypeError(`Invalid HumanWorkItem state: ${item.state}`);
  if(!Object.isFrozen(item))throw new TypeError('HumanWorkItem must be immutable.');
  return true;
}

export function normalizeHumanWorkItems(items=[],defaults={}){
  return (Array.isArray(items)?items:[]).map(item=>normalizeHumanWorkItem(item,defaults));
}
