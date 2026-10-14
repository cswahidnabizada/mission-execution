import {api} from '../core/api.js';

const text=v=>String(v??'').trim();
const num=v=>Number(v||0);
const cleanList=(value,key)=>Array.isArray(value)?value:Array.isArray(value?.[key])?value[key]:[];

export const CONTEXT_TYPES=Object.freeze(['mission','person','organization','network','object','product']);

function hashContext(){
  const raw=location.hash.replace(/^#/,'');
  const [path,query='']=raw.split('?');
  const params=new URLSearchParams(query);
  return {type:CONTEXT_TYPES.includes(path.replace(/^context\//,''))?path.replace(/^context\//,''):'',id:params.get('id')||params.get('mission')||'',back:params.get('back')||'#work'};
}

export function readContextRequest(){
  const raw=location.hash.replace(/^#/,'');
  const [path,query='']=raw.split('?');
  const params=new URLSearchParams(query);
  const type=path==='context'?params.get('type')||'':path.startsWith('context/')?path.slice(8):'';
  return {type:CONTEXT_TYPES.includes(type)?type:'',id:params.get('id')||params.get('mission')||'',back:params.get('back')||'#work'};
}

async function mission(id){
  const d=await api(`/api/missions/${num(id)}/details?history=1`,{cache:'no-store'});
  if(!d?.mission)throw new Error('Mission context is unavailable.');
  return {type:'mission',id:String(d.mission.id),title:d.mission.reference||`Mission ${d.mission.id}`,subtitle:d.mission.status||'Mission',authority:'mission',record:d};
}

async function person(id,s){
  const identityId=num(id)||num(s?.session?.identityId);
  if(!identityId)throw new Error('Person context is unavailable.');
  if(identityId===num(s?.session?.identityId))return {type:'person',id:String(identityId),title:s?.session?.name||s?.session?.email||'Your profile',subtitle:s?.session?.role||'Member',authority:'people',record:{person:{identityId,displayName:s?.session?.name||null,email:s?.session?.email||null,authRole:s?.session?.role||null,active:true},self:true}};
  const d=await api('/api/organization/people?limit=200&offset=0',{cache:'no-store'});
  const rows=cleanList(d,'people');
  const row=rows.find(x=>num(x.identityId||x.id)===identityId);
  if(!row)throw new Error('Person context is unavailable or you do not have access to this person.');
  return {type:'person',id:String(identityId),title:row.displayName||row.email||'Person',subtitle:row.roles?.map(x=>x.label).join(' · ')||row.authRole||'Member',authority:'people',record:{person:row,self:identityId===num(s?.session?.identityId)}};
}

async function organization(s){
  const results=await Promise.allSettled([
    api('/api/network/summary',{cache:'no-store'}),
    api('/api/product/context',{cache:'no-store'}),
    api('/api/organization/people?limit=50&offset=0',{cache:'no-store'})
  ]);
  const [network,product,people]=results;
  const degraded=[];
  if(network.status==='rejected')degraded.push('Network context');
  if(product.status==='rejected')degraded.push('Product context');
  if(people.status==='rejected')degraded.push('People context');
  return {type:'organization',id:String(s?.session?.tenantId||''),title:s?.situation?.organization?.name||s?.session?.companyName||'Organization',subtitle:s?.situation?.responsibility||'Organization context',authority:'organization',record:{network:network.status==='fulfilled'?network.value?.summary||{}:{},product:product.status==='fulfilled'?product.value?.context||{}:{},people:people.status==='fulfilled'?cleanList(people.value,'people'):[],degraded}};
}

async function network(id){
  const d=await api('/api/network/tenant-trust?limit=200&offset=0',{cache:'no-store'});
  const rows=cleanList(d,'relationships');
  const row=rows.find(x=>num(x.id)===num(id));
  if(!row)throw new Error('Network relationship is unavailable.');
  return {type:'network',id:String(row.id),title:row.partner_company_name||row.company_name||'Network relationship',subtitle:row.status||'Relationship',authority:'network',record:{relationship:row}};
}

async function object(id){
  const d=await api('/api/objects',{cache:'no-store'});
  const rows=cleanList(d,'objects');
  const row=rows.find(x=>String(x.id)===String(id)||String(x.id).endsWith(`:${id}`));
  if(!row)throw new Error('Object context is unavailable.');
  return {type:'object',id:String(row.id),title:row.reference||row.name||`Object ${id}`,subtitle:row.type||row.object_type||'Object',authority:'object',record:{object:row}};
}

async function product(){
  const d=await api('/api/product/context',{cache:'no-store'});
  const c=d?.context;
  if(!c)throw new Error('Product context is unavailable.');
  return {type:'product',id:String(c.productId||c.product_id||'current'),title:c.name||c.productName||'Current product',subtitle:c.runtime?.version?`Runtime ${c.runtime.version}`:'Product context',authority:'product',record:{context:c}};
}

export async function loadContext(request,s){
  const type=request?.type;
  if(type==='mission')return mission(request.id);
  if(type==='person')return person(request.id,s);
  if(type==='organization')return organization(s);
  if(type==='network')return network(request.id);
  if(type==='object')return object(request.id);
  if(type==='product')return product();
  throw new Error('Unknown context workspace.');
}

export function contextHref(type,id,back='#work'){
  const params=new URLSearchParams();
  params.set('type',type); if(id!==undefined&&id!==null&&String(id)!=='')params.set('id',String(id));
  params.set('back',back);
  return `#context?${params.toString()}`;
}
