import {listProductDefinitions} from './product-definition.service.js';
import {listCountryBlueprints} from './country-product-blueprint.service.js';
import {listCountryProductLaunches} from './country-product-launch.service.js';
import {listExpansionCases} from './product-expansion.service.js';
import {listDataEntries} from './platform-data-entry.service.js';

export const PRODUCT_BUILD_CONTROL_VERSION='1';
const clean=(v,max=160)=>String(v??'').trim().slice(0,max);
const json=(v,f={})=>{try{return JSON.parse(String(v??''))??f}catch{return f}};
const age=(v)=>{const t=Date.parse(String(v||''));return Number.isFinite(t)?Math.max(0,Math.floor((Date.now()-t)/86400000)):null};

function actionFor(type,row){
  const status=String(row.status||'').toLowerCase();
  if(type==='country_blueprint'){
    if(status==='ready')return {key:'continue',label:'CONTINUE LAUNCH',route:'product-build'};
    if(status==='archived')return {key:'open',label:'OPEN HISTORY',route:'product-build'};
    return {key:'continue',label:'CONTINUE FOUNDATION',route:'product-build'};
  }
  if(type==='product_definition'){
    if(status==='active')return {key:'monitor',label:'MONITOR PRODUCT',route:'product-health'};
    if(status==='compiled'||status==='verified')return {key:'continue',label:'CONTINUE READINESS',route:'product-build'};
    return {key:'edit',label:'EDIT PRODUCT',route:'product-build'};
  }
  if(type==='country_product_launch'){
    if(status==='active')return {key:'monitor',label:'MONITOR PRODUCT',route:'product-health'};
    if(status==='validated')return {key:'continue',label:'CONTINUE ACTIVATION',route:'product-build'};
    if(status==='retired')return {key:'open',label:'OPEN HISTORY',route:'product-build'};
    return {key:'continue',label:'CONTINUE BUILD',route:'product-build'};
  }
  if(type==='expansion_case'){
    if(status==='live')return {key:'monitor',label:'MONITOR PRODUCT',route:'product-health'};
    return {key:'continue',label:'CONTINUE EXPANSION',route:'product-build'};
  }
  return {key:'open',label:'OPEN',route:'product-build'};
}

function item(type,row){
  const action=actionFor(type,row);
  const status=String(row.status||'draft');
  return {
    resourceType:type,
    resourceId:String(row.id),
    key:row.product_key||row.expansion_key||row.entry_id||`${type}:${row.id}`,
    name:row.name||row.country_name||row.product_key||row.expansion_key||row.entry_type||type,
    countryCode:row.country_code||row.target_country_code||row.country_scope||null,
    countryName:row.country_name||null,
    sectorCode:row.sector_code||row.target_sector_code||null,
    status,
    updatedAt:row.updated_at||row.created_at||null,
    ageDays:age(row.updated_at||row.created_at),
    version:row.version||row.definition_version||null,
    active:Boolean(row.active===true||Number(row.active)===1||status==='active'||status==='live'),
    readiness:row.readiness||null,
    preparation:row.preparation||null,
    canonicalResourceType:row.canonical_resource_type||null,
    canonicalResourceId:row.canonical_resource_id==null?null:String(row.canonical_resource_id),
    sourceType:row.source_type||null,
    entryType:row.entry_type||null,
    action
  };
}

export async function getProductBuildControl(env,{countryCode='',sectorCode='',query='',limit=250}={}){
  const country=clean(countryCode,2).toUpperCase();
  const sector=clean(sectorCode,100).toLowerCase();
  const q=clean(query,160).toLowerCase();
  const n=Math.min(250,Math.max(1,Number(limit)||250));
  const [definitions,blueprints,launches,expansions,entries]=await Promise.all([
    listProductDefinitions(env,{countryCode:country,sectorCode:sector,limit:n}),
    listCountryBlueprints(env,{query:country||q,status:null,limit:n}),
    listCountryProductLaunches(env),
    listExpansionCases(env,{limit:n,countryCode:country}),
    listDataEntries(env,{limit:n})
  ]);

  const launchIds=launches.map(x=>Number(x.id)).filter(Boolean);
  let prep=[];
  if(launchIds.length){
    const marks=launchIds.map(()=>'?').join(',');
    const rows=(await env.DB.prepare(`SELECT launch_id,COUNT(*) total,COALESCE(SUM(CASE WHEN required=1 THEN 1 ELSE 0 END),0) required,COALESCE(SUM(CASE WHEN required=1 AND status='completed' THEN 1 ELSE 0 END),0) completed,COALESCE(SUM(CASE WHEN required=1 AND status='blocked' THEN 1 ELSE 0 END),0) blocked FROM platform_product_preparation_tasks WHERE launch_id IN (${marks}) GROUP BY launch_id`).bind(...launchIds).all()).results||[];
    prep=rows.map(r=>({launchId:Number(r.launch_id),total:Number(r.total||0),required:Number(r.required||0),completed:Number(r.completed||0),blocked:Number(r.blocked||0),ready:Number(r.required||0)>0&&Number(r.completed||0)>=Number(r.required||0)}));
  }
  const prepBy=new Map(prep.map(x=>[x.launchId,x]));
  const launchItems=launches.map(x=>({...x,preparation:prepBy.get(Number(x.id))||{total:0,required:0,completed:0,blocked:0,ready:false}}));

  const relevantEntries=entries.filter(x=>['product_component','product_definition','country_blueprint','country_product_launch','expansion_case','platform_configuration_draft'].includes(x.entry_type));
  let items=[
    ...blueprints.map(x=>item('country_blueprint',x)),
    ...definitions.map(x=>item('product_definition',x)),
    ...launchItems.map(x=>item('country_product_launch',x)),
    ...expansions.map(x=>item('expansion_case',x)),
  ];
  items=items.filter(x=>!country||String(x.countryCode||'').toUpperCase()===country);
  if(sector)items=items.filter(x=>!x.sectorCode||String(x.sectorCode).toLowerCase()===sector);
  if(q)items=items.filter(x=>[x.name,x.key,x.countryCode,x.countryName,x.sectorCode,x.status,x.resourceType,x.entryType].some(v=>String(v||'').toLowerCase().includes(q)));
  items.sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||''))||String(a.resourceType).localeCompare(String(b.resourceType)));
  items=items.slice(0,n);

  const active=items.filter(x=>x.active).length;
  const drafts=items.filter(x=>['draft','planning','preparing','composing','in_progress','preview','validated'].includes(String(x.status))).length;
  const blocked=items.filter(x=>String(x.status)==='blocked'||Number(x.preparation?.blocked||0)>0).length;
  const needsAttention=items.filter(x=>String(x.status)==='draft'||String(x.status)==='blocked'||Number(x.preparation?.completed||0)<Number(x.preparation?.required||0)).length;
  const ready=items.filter(x=>['ready','validated','compiled','verified'].includes(String(x.status))).length;
  return {
    version:PRODUCT_BUILD_CONTROL_VERSION,
    authority:'projection-only: canonical product, blueprint, launch and expansion authorities remain owners',
    summary:{total:items.length,active,drafts,blocked,ready,needsAttention},
    filters:{countryCode:country,sectorCode:sector,query:q},
    itemTypes:[
      {type:'country_blueprint',label:'Country Foundation'},
      {type:'product_definition',label:'Product Definition'},
      {type:'country_product_launch',label:'Product Launch'},
      {type:'expansion_case',label:'Expansion'}
    ],
    items
  };
}
