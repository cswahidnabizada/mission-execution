const clean=(v,max=500)=>String(v??'').trim().slice(0,max);
const arr=v=>Array.isArray(v)?v.filter(Boolean):[];
const json=(v,f)=>{try{return JSON.parse(String(v??'null'))??f}catch{return f}};
const fail=(m,s=400,c)=>{const e=new Error(m);e.status=s;if(c)e.code=c;return e};

export const PREPARATION_TASK_TEMPLATES=[
 {key:'product-scope',category:'product',title:'Define the country + sector product scope',description:'Confirm the exact country, sector, target organization types and user classes for this product.',research:false,source:false},
 {key:'country-law-research',category:'research',title:'Research country laws and regulatory requirements',description:'Record the applicable country-level laws, regulators, mandatory notices and launch requirements. Do not mark complete without recorded findings and sources.',research:true,source:true},
 {key:'sector-regulatory-research',category:'research',title:'Research sector-specific requirements',description:'Record sector-specific regulatory, operational and data requirements for the selected product scope.',research:true,source:true},
 {key:'data-residency-research',category:'compliance',title:'Confirm data residency and transfer requirements',description:'Confirm the applicable residency, transfer, retention and deletion requirements and map them to existing policy authorities.',research:true,source:true},
 {key:'legal-basis-and-purposes',category:'legal',title:'Confirm legal bases and processing purposes',description:'Confirm the processing purposes and legal bases required by the selected country + sector scope.',research:true,source:true},
 {key:'legal-pages',category:'legal-content',title:'Prepare required legal pages and notices',description:'Prepare and review the country/sector-specific legal content required before launch. Store references/evidence, not unsupported legal conclusions.',research:true,source:true},
 {key:'privacy-content',category:'legal-content',title:'Prepare privacy and data-protection content',description:'Prepare privacy notices, consent wording and data-rights guidance required for the selected scope.',research:false,source:true},
 {key:'roles-and-responsibilities',category:'roles',title:'Configure roles and responsibilities',description:'Confirm the organization roles, executor responsibilities and responsibility boundaries required by the product.',research:false,source:false},
 {key:'capabilities',category:'capabilities',title:'Select required capabilities',description:'Select and verify the canonical capabilities required by the product; capability configuration is not authorization.',research:false,source:false},
 {key:'actions',category:'actions',title:'Confirm canonical actions and action targets',description:'Confirm the product actions, target resolution and Action Service Map coverage required for the selected journeys.',research:false,source:false},
 {key:'data-presentations',category:'ui',title:'Configure data presentations and operator surfaces',description:'Configure the product presentation of the required data without creating a second source of truth.',research:false,source:false},
 {key:'ui-experience',category:'ui',title:'Configure product UI and user guidance',description:'Configure rendering, onboarding guidance, empty states and product-specific user experience for the selected scope.',research:false,source:false},
 {key:'subscription',category:'commercial',title:'Configure subscription and eligibility',description:'Confirm plans, eligibility and capability exposure for the country + sector product.',research:false,source:false},
 {key:'billing',category:'commercial',title:'Configure billing and payment requirements',description:'Confirm billing jurisdiction policy, provider readiness, pricing/currency and commercial requirements.',research:true,source:true},
 {key:'communication',category:'communication',title:'Configure required communication policies',description:'Confirm notification and communication governance required for the product journeys.',research:false,source:false},
 {key:'verification-trust',category:'verification',title:'Configure verification and trust requirements',description:'Confirm registration verification, trust requirements and country-specific verification rules.',research:true,source:true},
 {key:'rollback-plan',category:'operations',title:'Prepare the product rollback path',description:'Document what will be retired, what remains historical truth and how a failed launch can be safely reversed through governed operations.',research:false,source:false},
 {key:'controlled-verification',category:'verification',title:'Complete controlled end-to-end verification',description:'After activation, run the canonical Product Verification Engine and resolve all required journey blockers. This is post-launch proof, not a pre-launch compliance gate.',research:false,source:false,required:false},
 {key:'final-compliance-review',category:'launch',title:'Complete final country + sector compliance review',description:'Confirm every required preparation item, research finding, legal/content reference and verification result is complete before launch.',research:true,source:true}
];

export const PREPARATION_RESEARCH_TEMPLATES=[
 {key:'country-law',topic:'Country law',question:'What laws, regulators, mandatory registrations, notices and operational restrictions apply to this product in the selected country?'},
 {key:'sector-regulation',topic:'Sector regulation',question:'What sector-specific rules, standards, licenses or operating constraints apply to the selected product?'},
 {key:'data-protection',topic:'Data protection',question:'What privacy, data-transfer, residency, retention, deletion and data-rights requirements apply?'},
 {key:'legal-content',topic:'Legal content',question:'Which legal pages, notices, consent text, terms or disclosures must be prepared before launch?'},
 {key:'commercial',topic:'Commercial requirements',question:'What subscription, invoicing, tax, payment-provider and pricing requirements must be satisfied?'},
 {key:'verification',topic:'Identity and trust',question:'What registration, identity, company, executor and trust requirements must be satisfied?'},
];

export async function ensureProductPreparationWorkspace(env,launchId){
 const launch=await env.DB.prepare(`SELECT id,country_code,version,manifest_json FROM country_product_launches WHERE id=? LIMIT 1`).bind(Number(launchId)).first();
 if(!launch)throw fail('Country product launch not found',404,'COUNTRY_PRODUCT_LAUNCH_NOT_FOUND');
 const manifest=json(launch.manifest_json,{});
 const stmts=[];
 for(const t of PREPARATION_TASK_TEMPLATES){
  stmts.push(env.DB.prepare(`INSERT OR IGNORE INTO platform_product_preparation_tasks(launch_id,task_key,category,title,description,required,research_required,source_required) VALUES(?,?,?,?,?,?,?,?)`).bind(Number(launchId),t.key,t.category,t.title,t.description,t.required===false?0:1,t.research?1:0,t.source?1:0));
 }
 for(const r of PREPARATION_RESEARCH_TEMPLATES){
  stmts.push(env.DB.prepare(`INSERT OR IGNORE INTO platform_product_preparation_research(launch_id,research_key,topic,question) VALUES(?,?,?,?)`).bind(Number(launchId),r.key,r.topic,r.question));
 }
 if(stmts.length)await env.DB.batch(stmts);
 await env.DB.prepare(`UPDATE platform_product_preparation_tasks SET required=0 WHERE launch_id=? AND task_key='controlled-verification'`).bind(Number(launchId)).run();
 return getProductPreparationWorkspace(env,launchId,{manifest});
}

export async function getProductPreparationWorkspace(env,launchId,{manifest=null}={}){
 const taskResult=await env.DB.prepare(`SELECT rowid AS id,* FROM platform_product_preparation_tasks WHERE launch_id=? ORDER BY CASE category WHEN 'product' THEN 1 WHEN 'research' THEN 2 WHEN 'legal' THEN 3 WHEN 'legal-content' THEN 4 WHEN 'compliance' THEN 5 WHEN 'roles' THEN 6 WHEN 'capabilities' THEN 7 WHEN 'actions' THEN 8 WHEN 'ui' THEN 9 WHEN 'commercial' THEN 10 WHEN 'communication' THEN 11 WHEN 'verification' THEN 12 WHEN 'operations' THEN 13 WHEN 'launch' THEN 14 ELSE 20 END,rowid`).bind(Number(launchId)).all();
 const tasks=taskResult.results||[];
 const researchResult=await env.DB.prepare(`SELECT rowid AS id,* FROM platform_product_preparation_research WHERE launch_id=? ORDER BY rowid`).bind(Number(launchId)).all();
 const research=researchResult.results||[];
 const required=tasks.filter(x=>Number(x.required)===1);const completed=required.filter(x=>x.status==='completed');
 const blocked=required.filter(x=>x.status==='blocked');
 const missingEvidence=required.filter(x=>x.status==='completed'&&((Number(x.source_required)===1&&arr(json(x.evidence_json,{}).sources).length===0)||(Number(x.research_required)===1&&x.category!=='research'&&research.find(r=>r.status==='completed')===undefined)));
 const researchRequired=research.filter(r=>['country-law','sector-regulation','data-protection','legal-content','commercial','verification'].includes(r.research_key));
 const researchComplete=researchRequired.filter(r=>r.status==='completed');
 const ready=required.length>0&&completed.length===required.length&&blocked.length===0&&missingEvidence.length===0&&researchComplete.length===researchRequired.length;
 return {launchId:Number(launchId),tasks:tasks.map(normalizeTask),research:research.map(normalizeResearch),summary:{total:required.length,completed:completed.length,remaining:required.length-completed.length,blocked:blocked.length,missingEvidence:missingEvidence.length,researchTotal:researchRequired.length,researchCompleted:researchComplete.length,progress:required.length?Math.round((completed.length/required.length)*100):0,ready},manifest:manifest||null};
}
function normalizeTask(r){return {...r,id:Number(r.id),launch_id:Number(r.launch_id),required:Number(r.required)===1,research_required:Number(r.research_required)===1,source_required:Number(r.source_required)===1,evidence:json(r.evidence_json,{}),depends_on_task_id:r.dependency_task_id==null?null:Number(r.dependency_task_id)};}
function normalizeResearch(r){return {...r,id:Number(r.id),launch_id:Number(r.launch_id),sources:json(r.sources_json,[])};}

export async function updateProductPreparationTask(env,actor,taskId,input={}){
 const row=await env.DB.prepare(`SELECT * FROM platform_product_preparation_tasks WHERE id=? LIMIT 1`).bind(Number(taskId)).first();
 if(!row)throw fail('Preparation task not found',404,'PRODUCT_PREPARATION_TASK_NOT_FOUND');
 const status=['todo','in_progress','completed','blocked'].includes(String(input.status||''))?String(input.status):row.status;
 const evidence=input.evidence&&typeof input.evidence==='object'?input.evidence:json(row.evidence_json,{});
 const note=clean(input.completionNote??row.completion_note,2000)||null;
 if(status==='completed'){
  if(Number(row.source_required)===1&&arr(evidence.sources).length===0)throw fail('This task requires source evidence before completion',422,'PRODUCT_PREPARATION_SOURCE_REQUIRED');
  if(Number(row.research_required)===1){const x=await env.DB.prepare(`SELECT COUNT(*) count FROM platform_product_preparation_research WHERE launch_id=? AND status='completed'`).bind(row.launch_id).first();if(Number(x?.count||0)===0)throw fail('Research must be completed before this task can be completed',422,'PRODUCT_PREPARATION_RESEARCH_REQUIRED');}
 }
 const completedAt=status==='completed'?new Date().toISOString():null;
 await env.DB.prepare(`UPDATE platform_product_preparation_tasks SET status=?,evidence_json=?,completion_note=?,completed_by_type=?,completed_by_id=?,completed_at=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(status,JSON.stringify(evidence),note,status==='completed'?actor.role:null,status==='completed'?(actor.id||null):null,completedAt,Number(taskId)).run();
 return getProductPreparationWorkspace(env,row.launch_id);
}

export async function updateProductPreparationResearch(env,actor,researchId,input={}){
 const row=await env.DB.prepare(`SELECT * FROM platform_product_preparation_research WHERE id=? LIMIT 1`).bind(Number(researchId)).first();
 if(!row)throw fail('Research item not found',404,'PRODUCT_RESEARCH_NOT_FOUND');
 const status=['open','in_review','completed','deferred'].includes(String(input.status||''))?String(input.status):row.status;
 const findings=clean(input.findings??row.findings,8000)||null;
 const sources=Array.isArray(input.sources)?input.sources:json(row.sources_json,[]);
 if(status==='completed'&&(!findings||sources.length===0))throw fail('Completed research requires findings and at least one source',422,'PRODUCT_RESEARCH_EVIDENCE_REQUIRED');
 await env.DB.prepare(`UPDATE platform_product_preparation_research SET status=?,findings=?,sources_json=?,reviewed_by_type=?,reviewed_by_id=?,reviewed_at=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(status,findings,JSON.stringify(sources),status==='completed'?actor.role:null,status==='completed'?(actor.id||null):null,status==='completed'?new Date().toISOString():null,Number(researchId)).run();
 return getProductPreparationWorkspace(env,row.launch_id);
}

export async function createProductPreparationTask(env,actor,launchId,input={}){
 const title=clean(input.title,240),description=clean(input.description,1000),category=clean(input.category||'custom',80),key=clean(input.taskKey||`custom-${crypto.randomUUID()}`,120);
 if(!title||!description)throw fail('Task title and description are required',422,'PRODUCT_PREPARATION_TASK_INVALID');
 await env.DB.prepare(`INSERT INTO platform_product_preparation_tasks(launch_id,task_key,category,title,description,required,research_required,source_required) VALUES(?,?,?,?,?,?,?,?)`).bind(Number(launchId),key,category,title,description,input.required===false?0:1,input.researchRequired?1:0,input.sourceRequired?1:0).run();
 return getProductPreparationWorkspace(env,launchId);
}

export async function createProductResearch(env,actor,launchId,input={}){
 const topic=clean(input.topic,240),question=clean(input.question,1000),key=clean(input.researchKey||`custom-${crypto.randomUUID()}`,120);
 if(!topic||!question)throw fail('Research topic and question are required',422,'PRODUCT_RESEARCH_INVALID');
 await env.DB.prepare(`INSERT INTO platform_product_preparation_research(launch_id,research_key,topic,question) VALUES(?,?,?,?)`).bind(Number(launchId),key,topic,question).run();
 return getProductPreparationWorkspace(env,launchId);
}

export async function buildProductDependencyGraph(env,launchId){
 const launch=await env.DB.prepare(`SELECT * FROM country_product_launches WHERE id=? LIMIT 1`).bind(Number(launchId)).first();
 if(!launch)throw fail('Country product launch not found',404,'COUNTRY_PRODUCT_LAUNCH_NOT_FOUND');
 const manifest=json(launch.manifest_json,{}),eligibility=json(launch.eligibility_json,{}),readiness=json(launch.readiness_json,{});
 const nodes=new Map();
 const add=async(type,key,label,status='unknown',metadata={})=>{
  const k=String(key);const idKey=`${type}:${k}`;if(nodes.has(idKey))return nodes.get(idKey);
  await env.DB.prepare(`INSERT INTO platform_product_dependency_nodes(launch_id,node_type,node_key,label,status,metadata_json,updated_at) VALUES(?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(launch_id,node_type,node_key) DO UPDATE SET label=excluded.label,status=excluded.status,metadata_json=excluded.metadata_json,updated_at=CURRENT_TIMESTAMP`).bind(Number(launchId),type,k,label,status,JSON.stringify(metadata)).run();
  const row=await env.DB.prepare(`SELECT * FROM platform_product_dependency_nodes WHERE launch_id=? AND node_type=? AND node_key=? LIMIT 1`).bind(Number(launchId),type,k).first();const n={id:Number(row.id),type,key:k,label,status,metadata};nodes.set(idKey,n);return n;
 };
 const edge=async(a,b,relation,impact={},rollback={},source='canonical',sourceId=null)=>{
  await env.DB.prepare(`INSERT OR IGNORE INTO platform_product_dependency_edges(launch_id,from_node_id,to_node_id,relation,impact_json,rollback_json,source_type,source_id) VALUES(?,?,?,?,?,?,?,?)`).bind(Number(launchId),a.id,b.id,relation,JSON.stringify(impact),JSON.stringify(rollback),source,sourceId).run();
  if(relation==='depends_on') await env.DB.prepare(`INSERT OR IGNORE INTO platform_product_dependency_edges(launch_id,from_node_id,to_node_id,relation,impact_json,rollback_json,source_type,source_id) VALUES(?,?,?,?,?,?,?,?)`).bind(Number(launchId),b.id,a.id,'used_by',JSON.stringify(impact),JSON.stringify(rollback),source,sourceId).run();
 };
 const product=await add('product',`country:${launch.country_code}:version:${launch.version}`,`${launch.country_code} Product v${launch.version}`,launch.status,{countryCode:launch.country_code,version:launch.version,status:launch.status});
 const country=await add('country',launch.country_code,launch.country_code,'configured');await edge(product,country,'depends_on',{affectedCountries:[launch.country_code]},{rollbackPath:'retire country product version'});
 for(const sector of arr(eligibility.sectors).length?arr(eligibility.sectors):['general']){const n=await add('sector',sector,sector,'configured');await edge(product,n,'depends_on',{affectedJourneys:['sector eligibility']});}
 for(const cap of arr(manifest.capabilities)){const n=await add('capability',cap,cap,'configured');await edge(product,n,'depends_on',{affectedJourneys:['capability execution']});}
 for(const cfg of arr(manifest.requiredConfigurations)){const n=await add('configuration',cfg,cfg,'required');await edge(product,n,'depends_on',{affectedJourneys:['product experience']},{rollbackPath:'activate previous configuration version'});}
 const jurisdiction=await env.DB.prepare(`SELECT code,status,framework_code FROM jurisdiction_policies WHERE country_code=? AND status='active' ORDER BY effective_version DESC,code LIMIT 1`).bind(launch.country_code).first();
 if(jurisdiction){const n=await add('policy',`jurisdiction:${jurisdiction.code}`,`Jurisdiction ${jurisdiction.code}`,'active',{framework:jurisdiction.framework_code});await edge(product,n,'depends_on',{affectedCountries:[launch.country_code]});}
 for(const sector of arr(eligibility.sectors).length?arr(eligibility.sectors):['general']){const p=await env.DB.prepare(`SELECT code,status,regulatory_profile FROM sector_policies WHERE sector_code=? AND status='active' ORDER BY effective_version DESC LIMIT 1`).bind(sector).first();if(p){const n=await add('policy',`sector:${p.code}`,`Sector policy ${p.code}`,'active',{sector});await edge(product,n,'depends_on',{affectedJourneys:['compliance']});}}
 const plan=await add('subscription','active-plan-set','Active subscription plans',Number(readiness?.checks?.subscription)===1?'ready':'blocked');await edge(product,plan,'depends_on',{affectedUsers:eligibility.userClasses||[]});
 const bill=await add('billing',`country:${launch.country_code}`,`Billing ${launch.country_code}`,Number(readiness?.checks?.billing)===1?'ready':'blocked');await edge(product,bill,'depends_on',{affectedCountries:[launch.country_code]});
 const ver=await add('verification',`country:${launch.country_code}`,`Product verification ${launch.country_code}`,Number(readiness?.checks?.verification)===1?'ready':'blocked');await edge(product,ver,'verified_by',{affectedJourneys:['all']});
 const workspace=await getProductPreparationWorkspace(env,launchId);for(const task of workspace.tasks){const n=await add('preparation',`task:${task.task_key}`,task.title,task.status,{category:task.category,required:task.required});if(task.status!=='completed')await edge(n,product,'blocks',{affectedCountries:[launch.country_code],affectedJourneys:[task.category]},{rollbackPath:'complete or remove preparation requirement'},'preparation',String(task.id));}
 const readinessBlockers=Array.isArray(readiness?.blockers)?readiness.blockers:[];
 for(const blocker of readinessBlockers){
   if(blocker.code==='capabilities') { for(const key of arr(readiness?.details?.missingCapabilities)){ const n=await add('capability',key,key,'blocked',{reason:blocker.message}); await edge(n,product,'blocks',{affectedJourneys:['capability execution']},{rollbackPath:'configure or remove capability from product scope'}); } }
   if(blocker.code==='configuration') { for(const key of arr(readiness?.details?.missingConfigurations)){ const n=await add('configuration',key,key,'blocked',{reason:blocker.message}); await edge(n,product,'blocks',{affectedJourneys:['product experience']},{rollbackPath:'activate required configuration or update governed product scope'}); } }
   if(blocker.code==='jurisdiction') { const n=await add('policy',`jurisdiction:${launch.country_code}`,`Jurisdiction policy ${launch.country_code}`,'blocked',{reason:blocker.message}); await edge(n,product,'blocks',{affectedCountries:[launch.country_code]},{rollbackPath:'complete country policy preparation'}); }
   if(blocker.code==='sector'||blocker.code==='sectorCoverage'||blocker.code==='sectorEligibility') { const n=await add('policy',`sector-block:${launch.country_code}`,`Sector compliance policy for ${launch.country_code}`,'blocked',{reason:blocker.message}); await edge(n,product,'blocks',{affectedJourneys:['compliance']},{rollbackPath:'complete sector policy research/configuration'}); }
   if(blocker.code==='billing') { const n=await add('billing',`country:${launch.country_code}`,`Billing ${launch.country_code}`,'blocked',{reason:blocker.message}); await edge(n,product,'blocks',{affectedCountries:[launch.country_code]},{rollbackPath:'complete billing configuration'}); }
   if(blocker.code==='subscription') { const n=await add('subscription','active-plan-set','Active subscription plans','blocked',{reason:blocker.message}); await edge(n,product,'blocks',{affectedUsers:eligibility.userClasses||[]},{rollbackPath:'complete subscription product configuration'}); }
   if(blocker.code==='preparation') { const n=await add('preparation','launch-workspace','Product Launch Workspace','blocked',{reason:blocker.message}); await edge(n,product,'blocks',{affectedJourneys:['launch']},{rollbackPath:'complete launch workspace'}); }
 }
 const journeyNames=['registration','authentication','organization_onboarding','verification_trust','subscription','billing','people_executor','mission_creation','assignment','custody_transition','tracking_evidence','mission_completion'];
 for(const j of journeyNames){const n=await add('journey',j,j.replaceAll('_',' '),workspace.summary.ready?'ready':'blocked',{countryCode:launch.country_code,sectorCodes:eligibility.sectors||['general']});await edge(product,n,'depends_on',{affectedJourneys:[j]});for(const u of eligibility.userClasses||[]){const user=await add('user',u,u,'in_scope',{countryCode:launch.country_code,sectorCodes:eligibility.sectors||['general']});await edge(n,user,'affects',{affectedUsers:[u]});}}
 const rows=(await env.DB.prepare(`SELECT e.*,fn.node_type from_node_type,fn.node_key from_node_key,fn.label from_label,tn.node_type to_node_type,tn.node_key to_node_key,tn.label to_label FROM platform_product_dependency_edges e JOIN platform_product_dependency_nodes fn ON fn.id=e.from_node_id JOIN platform_product_dependency_nodes tn ON tn.id=e.to_node_id WHERE e.launch_id=? ORDER BY e.rowid`).bind(Number(launchId)).all()).results||[];
 const ns=[...nodes.values()];return {launchId:Number(launchId),nodes:ns,edges:rows.map(r=>({...r,id:Number(r.id),from_node_id:Number(r.from_node_id),to_node_id:Number(r.to_node_id),impact:json(r.impact_json,{}),rollback:json(r.rollback_json,{})})),summary:{nodes:ns.length,edges:rows.length,blockedNodes:ns.filter(n=>n.status==='blocked').length,ready:workspace.summary.ready}};
}

export async function getProductDependencyGraph(env,launchId){
 const id=Number(launchId);
 if(!Number.isInteger(id)||id<=0)throw fail('Invalid country product launch id',400,'COUNTRY_PRODUCT_LAUNCH_ID_INVALID');
 const launch=await env.DB.prepare(`SELECT id FROM country_product_launches WHERE id=? LIMIT 1`).bind(id).first();
 if(!launch)throw fail('Country product launch not found',404,'COUNTRY_PRODUCT_LAUNCH_NOT_FOUND');
 const nodes=(await env.DB.prepare(`SELECT id,launch_id,node_type,node_key,label,status,metadata_json,created_at,updated_at FROM platform_product_dependency_nodes WHERE launch_id=? ORDER BY node_type,node_key,id`).bind(id).all()).results||[];
 const edges=(await env.DB.prepare(`SELECT e.*,fn.node_type from_node_type,fn.node_key from_node_key,fn.label from_label,tn.node_type to_node_type,tn.node_key to_node_key,tn.label to_label FROM platform_product_dependency_edges e JOIN platform_product_dependency_nodes fn ON fn.id=e.from_node_id JOIN platform_product_dependency_nodes tn ON tn.id=e.to_node_id WHERE e.launch_id=? ORDER BY e.rowid`).bind(id).all()).results||[];
 const normalizedNodes=nodes.map(r=>({id:Number(r.id),launch_id:Number(r.launch_id),type:r.node_type,key:r.node_key,label:r.label,status:r.status,metadata:json(r.metadata_json,{}),created_at:r.created_at,updated_at:r.updated_at}));
 return {launchId:id,nodes:normalizedNodes,edges:edges.map(r=>({...r,id:Number(r.id),launch_id:Number(r.launch_id),from_node_id:Number(r.from_node_id),to_node_id:Number(r.to_node_id),impact:json(r.impact_json,{}),rollback:json(r.rollback_json,{})})),summary:{nodes:normalizedNodes.length,edges:edges.length,blockedNodes:normalizedNodes.filter(n=>n.status==='blocked').length,ready:normalizedNodes.every(n=>!['blocked','error'].includes(n.status))}};
}
