import {RELEASE_VERSION} from '../../core/release.js';

export const PRODUCT_PUBLISHER_SEMANTIC_CONFIGURATION_VERSION=`${RELEASE_VERSION}-semantic-config`;

const CAPABILITIES=[
 {key:'organization',label:'Organization',description:'Organization workspace and governance'},
 {key:'people',label:'People',description:'People and responsibility management'},
 {key:'mission',label:'Mission',description:'Mission creation and management'},
 {key:'object',label:'Objects',description:'Objects attached to operational work'},
 {key:'resource',label:'Resources',description:'Operational resources'},
 {key:'communication',label:'Communication',description:'Operational communication and sharing'},
 {key:'evidence',label:'Evidence',description:'Proof, evidence and completion records'},
 {key:'logistics',label:'Logistics',description:'Logistics-specific operational capability'},
 {key:'relationship',label:'Relationships',description:'Network and relationship context',advanced:true},
 {key:'policy',label:'Policy',description:'Policy-driven controls',advanced:true},
 {key:'capability',label:'Capability catalog',description:'Capability composition metadata',advanced:true}
];

const ACTION_LABELS=Object.freeze({
 create_mission:'Create mission',edit_mission:'Edit mission',edit_mission_data:'Edit mission data',delete_mission:'Delete mission',
 assign_driver:'Assign executor',change_driver:'Change executor',share_network:'Share mission (network)',share_foryou:'Share mission (ForYou)',
 repost_foryou:'Republish mission (ForYou)',restart_network:'Restart network sharing',approve_foryou_request:'Approve ForYou request',
 decline_foryou_request:'Decline ForYou request',create_driver:'Create executor',request_foryou_mission:'Request mission (ForYou)',accept_network:'Accept network mission'
});

const ACTION_CATALOG=Object.freeze(Object.entries(ACTION_LABELS).map(([code,label])=>({code,label})));

const clean=v=>String(v??'').trim().slice(0,200);
const parse=v=>{try{return JSON.parse(v||'{}')}catch{return {}}};
const arr=v=>Array.isArray(v)?v:[];

function capabilitySemantic(row){
 const payload=row?.payload&&typeof row.payload==='object'?row.payload:{};
 const enabled=new Set(arr(payload.enabled).map(x=>String(x)));
 return {enabled:CAPABILITIES.filter(x=>enabled.has(x.key)).map(x=>x.key),catalog:CAPABILITIES.map(x=>({...x,enabled:enabled.has(x.key)}))};
}
function roleSemantic(row){
 const actions=row?.payload?.actions&&typeof row.payload.actions==='object'?row.payload.actions:{};
 return Object.entries(actions).map(([role,codes])=>({key:role,label:roleLabel(role),actions:arr(codes).map(code=>({code:String(code),label:ACTION_LABELS[code]||humanize(code),enabled:true}))}));
}
function roleLabel(role){return ({owner:'Owner',admin:'Admin',manager:'Manager',operator:'Operator',developer:'Developer',executor:'Executor',driver:'Executor'}[String(role).toLowerCase()]||humanize(role)).toUpperCase();}
function humanize(value){return clean(value).replaceAll('_',' ').replace(/\b\w/g,x=>x.toUpperCase());}

export function getProductPublisherSemanticConfiguration(configurations=[],required=[]){
 const wanted=arr(required);const byKey=new Map(configurations.map(x=>[`${x.domain_code}:${x.config_key}`,x]));
 const capabilities=byKey.get('capabilities:catalog');
 const roles=byKey.get('roles:action_policy');
 return {
   version:PRODUCT_PUBLISHER_SEMANTIC_CONFIGURATION_VERSION,
   source:'canonical-platform-configuration',
   advancedAvailable:true,
   capabilities:capabilities?{key:'capabilities:catalog',active:capabilities.active,version:capabilities.version,status:capabilities.status,...capabilitySemantic(capabilities),raw:capabilities.payload}:null,
   rolePolicy:roles?{key:'roles:action_policy',active:roles.active,version:roles.version,status:roles.status,roles:roleSemantic(roles),actionCatalog:ACTION_CATALOG,raw:roles.payload}:null,
   other:wanted.filter(k=>k!=='capabilities:catalog'&&k!=='roles:action_policy').map(key=>{const row=byKey.get(key);return {key,domainCode:key.split(':')[0],configKey:key.slice(key.indexOf(':')+1),active:Boolean(row?.active),version:row?.version||null,status:row?.status||'missing',raw:row?.payload||null};})
 };
}

export function semanticConfigurationPayload(configKey,input={}){
 const key=clean(configKey,120);
 if(key==='capabilities:catalog'){
   const enabled=arr(input.enabled).map(x=>String(x).trim()).filter(x=>CAPABILITIES.some(c=>c.key===x));
   if(!enabled.length)throw Object.assign(new Error('At least one product capability must remain enabled'),{status:422,code:'PRODUCT_PUBLISHER_CAPABILITY_REQUIRED'});
   return {enabled:[...new Set(enabled)]};
 }
 if(key==='roles:action_policy'){
   const actions={};
   for(const role of arr(input.roles)){
     const roleKey=clean(role?.key,80).toLowerCase();
     if(!roleKey)continue;
     actions[roleKey]=[...new Set(arr(role.actions).map(x=>typeof x==='string'?x:x?.code).filter(Boolean).map(x=>clean(x,120)))];
   }
   if(!Object.keys(actions).length)throw Object.assign(new Error('At least one role policy must remain configured'),{status:422,code:'PRODUCT_PUBLISHER_ROLE_POLICY_REQUIRED'});
   return {actions};
 }
 if(!input.raw||typeof input.raw!=='object'||Array.isArray(input.raw))throw Object.assign(new Error('Advanced canonical configuration must be an object'),{status:422,code:'PRODUCT_PUBLISHER_RAW_CONFIGURATION_INVALID'});
 return input.raw;
}
