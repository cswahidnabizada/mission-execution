import {getProductDependencyGraph} from '../../security/product-launch-workspace.service.js';
import {RELEASE_VERSION} from '../../core/release.js';

export const PRODUCT_DEPENDENCY_IMPACT_VERSION=`${RELEASE_VERSION}-dependency-impact`;
const RELATIONS=['depends_on','used_by','blocks','affects','enables','verified_by'];
const clean=(v,max=240)=>String(v??'').trim().slice(0,max);
const arr=v=>Array.isArray(v)?v:[];
const uniq=a=>[...new Set(a.filter(Boolean).map(String))];
const human=v=>clean(v).replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());

function nodeRef(n){return {id:Number(n.id),type:n.type,key:n.key,label:n.label,status:n.status,metadata:n.metadata||{}}}
function edgeRef(e,direction){
 return {id:Number(e.id),relation:e.relation,direction,from:{id:Number(e.from_node_id),type:e.from_node_type,key:e.from_node_key,label:e.from_label},to:{id:Number(e.to_node_id),type:e.to_node_type,key:e.to_node_key,label:e.to_label},impact:e.impact||{},rollback:e.rollback||{}};
}

export async function getProductDependencyImpact(env,{launchId,nodeId=null,nodeType='',nodeKey=''}={}){
 const graph=await getProductDependencyGraph(env,Number(launchId));
 const nodes=arr(graph.nodes);
 const selected=nodes.find(n=>nodeId!=null&&Number(n.id)===Number(nodeId))||nodes.find(n=>String(n.type)===clean(nodeType,80)&&String(n.key)===clean(nodeKey,240));
 if(!selected){const e=new Error('Dependency graph node not found');e.status=404;e.code='PRODUCT_DEPENDENCY_NODE_NOT_FOUND';throw e;}
 const edges=arr(graph.edges);
 const outgoing=edges.filter(e=>Number(e.from_node_id)===Number(selected.id));
 const incoming=edges.filter(e=>Number(e.to_node_id)===Number(selected.id));
 const groups={dependsOn:[],usedBy:[],blocks:[],affects:[],enables:[],verifiedBy:[],rollbackImpact:[]};
 const add=(bucket,e,direction)=>groups[bucket].push(edgeRef(e,direction));
 for(const e of outgoing){
  if(e.relation==='depends_on')add('dependsOn',e,'outgoing');
  if(e.relation==='blocks')add('blocks',e,'outgoing');
  if(e.relation==='affects')add('affects',e,'outgoing');
  if(e.relation==='enables')add('enables',e,'outgoing');
  if(e.relation==='verified_by')add('verifiedBy',e,'outgoing');
 }
 for(const e of incoming){
  if(e.relation==='used_by')add('usedBy',e,'incoming');
  if(e.relation==='enables')add('enables',e,'incoming');
  if(e.relation==='verified_by')add('verifiedBy',e,'incoming');
  if(e.relation==='depends_on')add('dependsOn',e,'incoming');
  if(e.relation==='blocks')add('blocks',e,'incoming');
  if(e.relation==='affects')add('affects',e,'incoming');
 }
 // Existing graph storage already contains explicit inverse used_by edges for depends_on.
 // We expose impact as a projection; we do not create another authority or mutate graph truth.
 const direct=[...outgoing,...incoming];
 const affected={countries:[],journeys:[],users:[],resources:[]};
 const rollback=[];
 for(const e of direct){const impact=e.impact||{};affected.countries.push(...arr(impact.affectedCountries));affected.journeys.push(...arr(impact.affectedJourneys));affected.users.push(...arr(impact.affectedUsers));if(impact.resources)affected.resources.push(...arr(impact.resources));const rb=e.rollback||{};if(rb.rollbackPath)rollback.push({relation:e.relation,path:String(rb.rollbackPath),target:e.to_label||e.from_label});}
 const relationCounts=Object.fromEntries(RELATIONS.map(r=>[r,edges.filter(e=>e.relation===r&& (Number(e.from_node_id)===Number(selected.id)||Number(e.to_node_id)===Number(selected.id))).length]));
 const connectedIds=new Set(direct.flatMap(e=>[Number(e.from_node_id),Number(e.to_node_id)]));
 connectedIds.delete(Number(selected.id));
 const connectedNodes=nodes.filter(n=>connectedIds.has(Number(n.id))).map(nodeRef);
 return {
  version:PRODUCT_DEPENDENCY_IMPACT_VERSION,
  launchId:Number(launchId),
  selected:nodeRef(selected),
  relations:{dependsOn:groups.dependsOn,usedBy:groups.usedBy,blocks:groups.blocks,affects:groups.affects,enables:groups.enables,verifiedBy:groups.verifiedBy},
  rollbackImpact:rollback,
  impact:{countries:uniq(affected.countries),journeys:uniq(affected.journeys),users:uniq(affected.users),resources:uniq(affected.resources)},
  connectedNodes,
  relationCounts,
  note:'Computed from the canonical product dependency graph. This view is informational and does not replace any domain authority.'
 };
}
