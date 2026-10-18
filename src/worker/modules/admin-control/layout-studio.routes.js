import {json,publicErrorMessage} from '../../core/http.js';
import {requirePlatformAdministrator} from '../../security/platform-administrator.js';
import {requirePlatformSuperAdminStepUp} from '../../security/platform-super-administrator.js';

const GLOBAL_EXPERIENCE_ID='onmission.global.experience';
// Registry is deliberately explicit about what is known from source and what is not yet wired to canonical renderers.
const EXPERIENCE_REGISTRY=[
 {id:'public-homepage',title:'Public homepage',route:'/',sourcePage:'public/index.html',area:'Public',editability:'INSPECT_ONLY',rendererBinding:'NOT_CONNECTED'},
 {id:'registration',title:'Registration',route:'/register.html',sourcePage:'public/register.html',area:'Identity & onboarding',editability:'INSPECT_ONLY',rendererBinding:'NOT_CONNECTED'},
 {id:'organization-invitation',title:'Accept invitation',route:'/accept-invitation.html',sourcePage:'public/accept-invitation.html',area:'Identity & onboarding',editability:'INSPECT_ONLY',rendererBinding:'NOT_CONNECTED'},
 {id:'mission-list',title:'Missions',route:'/missions.html',sourcePage:'public/missions.html',area:'Mission execution',editability:'INSPECT_ONLY',rendererBinding:'NOT_CONNECTED'},
 {id:'organization-setup',title:'Organization setup',route:'/app/#account?activation=1',sourcePage:'public/app/index.html',area:'Identity & onboarding',editability:'INSPECT_ONLY',rendererBinding:'NOT_CONNECTED'},
 {id:'mission-workspace',title:'Mission workspace',route:'/app/#work',sourcePage:'public/app/index.html',area:'Mission execution',editability:'INSPECT_ONLY',rendererBinding:'NOT_CONNECTED'},
 {id:'executor-workspace',title:'Executor workspace',route:'/driver/dashboard.html',sourcePage:'public/driver/dashboard.html',area:'Mission execution',editability:'INSPECT_ONLY',rendererBinding:'NOT_CONNECTED'},
 {id:'tenant-product-experience',title:'Product experience',route:'/app/',sourcePage:'public/app/index.html',area:'Tenant workspace',editability:'INSPECT_ONLY',rendererBinding:'NOT_CONNECTED'},
 {id:'layout-studio',title:'Layout Studio',route:'/layout-studio.html',sourcePage:'public/layout-studio.html',area:'Platform administration',editability:'INSPECT_ONLY',rendererBinding:'NOT_CONNECTED'}
];
const COMPONENT_REGISTRY=[
 {type:'header',label:'Header',status:'CANONICAL_STUDIO_PREVIEW_ONLY',properties:['label','density']},
 {type:'footer',label:'Footer',status:'CANONICAL_STUDIO_PREVIEW_ONLY',properties:['label']},
 {type:'hero',label:'Hero',status:'CANONICAL_STUDIO_PREVIEW_ONLY',properties:['eyebrow','title','description','cta']},
 {type:'section',label:'Section',status:'CANONICAL_STUDIO_PREVIEW_ONLY',properties:['label','description']},
 {type:'card',label:'Card',status:'CANONICAL_STUDIO_PREVIEW_ONLY',properties:['label','state','description']},
 {type:'button',label:'Button',status:'CANONICAL_STUDIO_PREVIEW_ONLY',properties:['label','variant']},
 {type:'badge',label:'Badge',status:'CANONICAL_STUDIO_PREVIEW_ONLY',properties:['label','tone']},
 {type:'input',label:'Input',status:'CANONICAL_STUDIO_PREVIEW_ONLY',properties:['label','placeholder']},
 {type:'table',label:'Table',status:'CANONICAL_STUDIO_PREVIEW_ONLY',properties:['label','description']},
 {type:'dialog',label:'Dialog',status:'CANONICAL_STUDIO_PREVIEW_ONLY',properties:['label','description']},
 {type:'navigation',label:'Navigation',status:'CANONICAL_STUDIO_PREVIEW_ONLY',properties:['label']},
 {type:'mission-list',label:'Mission list',status:'CANONICAL_STUDIO_PREVIEW_ONLY',properties:['label','description']},
 {type:'evidence-panel',label:'Evidence panel',status:'CANONICAL_STUDIO_PREVIEW_ONLY',properties:['label','description']},
 {type:'status-panel',label:'Status panel',status:'CANONICAL_STUDIO_PREVIEW_ONLY',properties:['label','state','description']},
 {type:'progress',label:'Progress',status:'CANONICAL_STUDIO_PREVIEW_ONLY',properties:['label','state']}
];
const REQUIRED_CONTROLS=['identity','consent','authorization','eligibility','evidence','recovery'];
const COMPONENT_TYPES=new Set(['header','footer','hero','section','card','button','badge','input','table','dialog','navigation','mission-list','evidence-panel','status-panel','progress']);
const PAGE_KINDS=new Set(['public-homepage','onboarding','organization-setup','executor-workspace','mission-experience','shared-components']);
const clean=(v,n)=>String(v??'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,n);
const fail=e=>json({success:false,error:publicErrorMessage(e?.message||'Layout Studio draft authority unavailable'),code:e?.code||e?.message||'LAYOUT_STUDIO_DRAFT_UNAVAILABLE'},e?.status||500);
const actorId=a=>clean(a?.id||a?.actorId||a?.userId||'platform-admin',160);
const uid=()=>crypto.randomUUID();
const parse=v=>{try{return JSON.parse(String(v??'{}'))}catch{return {}}};
async function digest(value){const bytes=new TextEncoder().encode(value);const hash=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('')}
const invalid=code=>Object.assign(new Error(code),{status:400,code});
function validateDraft(d){
 if(!d||typeof d!=='object'||Array.isArray(d))return 'DRAFT_OBJECT_REQUIRED';
 if(d.schemaVersion!==1)return 'DRAFT_SCHEMA_VERSION_UNSUPPORTED';
 if(d.experienceId!==GLOBAL_EXPERIENCE_ID)return 'EXPERIENCE_ID_NOT_SUPPORTED';
 if(typeof d.name!=='string'||!d.name.trim()||d.name.length>120)return 'EXPERIENCE_NAME_INVALID';
 if(!Array.isArray(d.pages)||d.pages.length<1||d.pages.length>30)return 'PAGE_COUNT_INVALID';
 if(!Array.isArray(d.components)||d.components.length>100)return 'COMPONENT_COUNT_INVALID';
 if(!Array.isArray(d.marketVariants)||d.marketVariants.length>100)return 'MARKET_VARIANTS_INVALID';
 if(!d.tokens||typeof d.tokens!=='object'||Array.isArray(d.tokens)||Object.keys(d.tokens).length>300)return 'TOKEN_REGISTRY_INVALID';
 for(const [key,value] of Object.entries(d.tokens)){if(!/^[a-z][a-z0-9.-]{1,119}$/.test(key)||typeof value!=='string'||value.length>120)return 'TOKEN_VALUE_INVALID'}
 const ids=new Set();
 for(const c of d.components){
  if(!c||typeof c!=='object'||Array.isArray(c)||typeof c.id!=='string'||!/^[a-z0-9][a-z0-9._-]{1,79}$/.test(c.id)||ids.has(c.id))return 'COMPONENT_ID_INVALID';
  ids.add(c.id);
  if(!COMPONENT_TYPES.has(c.type))return 'COMPONENT_TYPE_NOT_ALLOWED';
  if(!Array.isArray(c.tokenRefs)||new Set(c.tokenRefs).size!==c.tokenRefs.length||c.tokenRefs.some(t=>typeof t!=='string'||!(t in d.tokens)))return 'COMPONENT_TOKEN_REFERENCE_INVALID';
  if(!c.properties||typeof c.properties!=='object'||Array.isArray(c.properties)||Object.keys(c.properties).length>40)return 'COMPONENT_PROPERTIES_INVALID';
  for(const [key,value] of Object.entries(c.properties)){if(key.length>80||!['string','number','boolean'].includes(typeof value)||(typeof value==='string'&&value.length>300)||(typeof value==='number'&&!Number.isFinite(value)))return 'COMPONENT_PROPERTY_VALUE_INVALID'}
  if(c.required!==undefined&&typeof c.required!=='boolean')return 'COMPONENT_REQUIRED_FLAG_INVALID';
 }
 const pageIds=new Set();
 for(const p of d.pages){
  if(!p||typeof p!=='object'||Array.isArray(p)||typeof p.id!=='string'||!/^[a-z0-9][a-z0-9._-]{1,79}$/.test(p.id)||pageIds.has(p.id))return 'PAGE_ID_INVALID';
  pageIds.add(p.id);
  if(!PAGE_KINDS.has(p.kind)||typeof p.title!=='string'||p.title.length>120)return 'PAGE_DEFINITION_INVALID';
  if(!Array.isArray(p.componentIds)||new Set(p.componentIds).size!==p.componentIds.length||p.componentIds.some(id=>!ids.has(id)))return 'PAGE_COMPOSITION_INVALID';
  if(!p.responsive||typeof p.responsive!=='object'||!['mobile','tablet','desktop'].every(k=>typeof p.responsive[k]==='string'&&p.responsive[k].length<=100))return 'RESPONSIVE_RULES_REQUIRED';
 }
 const marketKeys=new Set();
 for(const m of d.marketVariants){
  if(!m||typeof m!=='object'||!/^[A-Z]{2}(-[A-Z0-9]{2,8})?$/.test(String(m.marketCode||''))||!pageIds.has(m.pageId))return 'MARKET_VARIANT_REFERENCE_INVALID';
  const key=`${m.marketCode}:${m.pageId}`;if(marketKeys.has(key))return 'MARKET_VARIANT_DUPLICATE';marketKeys.add(key);
  if(!Array.isArray(m.themeTokenRefs)||m.themeTokenRefs.some(t=>typeof t!=='string'||!(t in d.tokens)))return 'MARKET_TOKEN_REFERENCE_INVALID';
  if(!m.contentOverrides||typeof m.contentOverrides!=='object'||Array.isArray(m.contentOverrides)||Object.entries(m.contentOverrides).some(([k,v])=>k.length>100||typeof v!=='string'||v.length>500))return 'MARKET_CONTENT_OVERRIDE_INVALID';
 }
 if(!d.governance||typeof d.governance!=='object'||!Array.isArray(d.governance.requiredControls)||REQUIRED_CONTROLS.some(k=>!d.governance.requiredControls.includes(k)))return 'MANDATORY_GOVERNANCE_CONTROLS_REQUIRED';
 if(d.governance.status!==undefined&&!['DRAFT','VALIDATED','AUTHORIZED','PUBLISHED','VERIFIED','ROLLED_BACK'].includes(d.governance.status))return 'GOVERNANCE_STATUS_INVALID';
 if(d.governance.basedOnRelease!==undefined&&d.governance.basedOnRelease!==null&&typeof d.governance.basedOnRelease!=='string')return 'BASE_RELEASE_INVALID';
 if(d.governance.reason!==undefined&&(typeof d.governance.reason!=='string'||d.governance.reason.length>500))return 'GOVERNANCE_REASON_INVALID';
 const bytes=new TextEncoder().encode(JSON.stringify(d)).length;if(bytes>450000)return 'DRAFT_TOO_LARGE';
 return null;
}
function auditStatement({actor,action,experienceId,requestId,revision,contentSha256,reason}){
 return {sql:`INSERT INTO admin_control_audit_events(event_id,actor_role,action,resource_type,resource_id,target_company_id,request_id,metadata) SELECT ?,?,?,?,?,?,?,? WHERE changes()=1`,args:[uid(),String(actor?.role||'platform_administrator'),action,'layout_studio_draft',experienceId,null,requestId,JSON.stringify({revision,contentSha256,reason})]};
}
export function registerLayoutStudioRoutes(router){
 router.get('/api/platform/admin/layout-studio/registry',async({request,env})=>{try{await requirePlatformAdministrator(request,env);return json({success:true,registryVersion:'16.10.51',rendererContractVersion:'16.10.51',source:'curated-source-route-map',experiences:EXPERIENCE_REGISTRY,components:COMPONENT_REGISTRY,contract:{editableProductionRoutes:0,productionRouteBindings:0,previewOnlyComponentTypes:COMPONENT_REGISTRY.length,publicationEnabled:false,rendererMode:'CANONICAL_STUDIO_PREVIEW_ONLY',warning:'Studio preview now uses a deterministic allowlisted renderer contract. Production route bindings and live route parity remain uncertified; publication stays disabled.'}})}catch(e){return fail(e)}});
 router.get('/api/platform/admin/layout-studio/certification',async({request,env})=>{try{await requirePlatformAdministrator(request,env);const routes=EXPERIENCE_REGISTRY.map(e=>({...e,certification:{sourceMapped:Boolean(e.sourcePage),routeAdapter:e.id==='public-homepage'||e.id==='registration'||e.id==='tenant-product-experience'?'INSTALLED':'CANONICAL_REDIRECT_OR_PENDING',rendererParity:'NOT_TESTED',accessibility:'NOT_TESTED',authorizationBoundary:'NOT_TESTED',publicationEligible:false,requiredEvidence:['source route ownership','canonical renderer adapter','desktop/tablet/mobile browser parity','keyboard and accessibility checks','authorization and tenant-isolation checks','failure recovery and rollback evidence']}}));const connected=routes.filter(e=>e.rendererBinding==='CONNECTED'&&e.certification.rendererParity==='PASS').length;return json({success:true,certificationVersion:'16.10.51',routes,summary:{routeCount:routes.length,sourceMapped:routes.filter(e=>e.certification.sourceMapped).length,routeAdapters:routes.filter(e=>e.certification.routeAdapter==='INSTALLED').length,rendererBindings:routes.filter(e=>e.rendererBinding==='CONNECTED').length,certifiedRoutes:connected,publicationEnabled:false,blockers:['PRODUCTION_RENDERER_BINDINGS_NOT_CERTIFIED','BROWSER_PARITY_EVIDENCE_MISSING','RELEASE_AUTHORITY_ADAPTER_NOT_CONNECTED'],notice:'This endpoint is a certification worklist, not proof of live behavior. Routes remain inspect-only until implementation and evidence are recorded.'}})}catch(e){return fail(e)}});
 router.post('/api/platform/admin/layout-studio/impact',async({request,env})=>{try{await requirePlatformAdministrator(request,env);let body;try{body=await request.json()}catch{throw invalid('REQUEST_JSON_INVALID')}const draft=body?.draft,problem=validateDraft(draft);if(problem)throw invalid(problem);const kinds=new Set(draft.pages.map(p=>p.kind));const mapping=[['public-homepage',['public-homepage']],['onboarding',['registration','organization-invitation']],['organization-setup',['tenant-product-experience']],['executor-workspace',['executor-dashboard']],['mission-experience',['mission-list','tenant-product-experience']],['shared-components',EXPERIENCE_REGISTRY.map(e=>e.id)]];const ids=new Set();for(const [kind,targets] of mapping)if(kinds.has(kind))for(const id of targets)ids.add(id);const affected=EXPERIENCE_REGISTRY.filter(e=>ids.has(e.id)).map(e=>({...e,impactReason:kinds.has('shared-components')?'Shared-component page may affect this experience':`Composition contains ${[...kinds].filter(k=>mapping.find(([mk])=>mk===k)?.[1].includes(e.id)).join(', ')}`,publicationBlocked:e.rendererBinding!=='CONNECTED'}));const blockers=[];if(affected.some(e=>e.publicationBlocked))blockers.push('CANONICAL_PRODUCTION_RENDERER_BINDING_MISSING');if(affected.length===0)blockers.push('NO_KNOWN_EXPERIENCE_TARGET');return json({success:true,analysisVersion:'16.10.47',experienceId:draft.experienceId,affectedExperienceCount:affected.length,affectedExperiences:affected,impact:{componentCount:draft.components.length,pageCount:draft.pages.length,marketVariantCount:draft.marketVariants.length,marketCodes:[...new Set(draft.marketVariants.map(m=>m.marketCode))].sort()},blockers,publicationAllowed:false,productionRouteBindings:0,notice:'This is a source-derived impact estimate. It does not prove live route parity and cannot authorize publication.'})}catch(e){return fail(e)}});
 router.get('/api/platform/admin/layout-studio/draft',async({request,env})=>{try{await requirePlatformAdministrator(request,env);const row=await env.DB.prepare('SELECT experience_id,draft_json,revision,schema_version,created_by,updated_by,created_at,updated_at FROM platform_layout_drafts WHERE experience_id=?').bind(GLOBAL_EXPERIENCE_ID).first();if(!row)return json({success:true,exists:false,draft:null,revision:0});return json({success:true,exists:true,draft:parse(row.draft_json),revision:Number(row.revision),updatedAt:row.updated_at,updatedBy:row.updated_by});}catch(e){return fail(e)}});
 router.get('/api/platform/admin/layout-studio/versions',async({request,env})=>{try{await requirePlatformAdministrator(request,env);const rows=await env.DB.prepare('SELECT version_id,experience_id,revision,content_sha256,actor_id,change_reason,created_at FROM platform_layout_draft_versions WHERE experience_id=? ORDER BY revision DESC LIMIT 50').bind(GLOBAL_EXPERIENCE_ID).all();return json({success:true,versions:rows.results||[]});}catch(e){return fail(e)}});
 router.patch('/api/platform/admin/layout-studio/draft',async({request,env,requestId})=>{
  try{
   const actor=await requirePlatformSuperAdminStepUp(request,env);let body;try{body=await request.json()}catch{throw invalid('REQUEST_JSON_INVALID')}
   const draft=body?.draft,reason=clean(body?.reason||'Layout Studio draft save',240),expected=Number(body?.expectedRevision),problem=validateDraft(draft);
   if(problem)throw invalid(problem);if(!Number.isSafeInteger(expected)||expected<0)throw invalid('EXPECTED_REVISION_REQUIRED');
   const experienceId=GLOBAL_EXPERIENCE_ID,serialized=JSON.stringify(draft),hash=await digest(serialized),actorKey=actorId(actor),revision=expected+1,created=expected===0;
   const mutation=created
    ? {sql:`INSERT INTO platform_layout_drafts(experience_id,draft_json,revision,schema_version,created_by,updated_by) SELECT ?,?,1,1,?,? WHERE NOT EXISTS (SELECT 1 FROM platform_layout_drafts WHERE experience_id=?)`,args:[experienceId,serialized,actorKey,actorKey,experienceId]}
    : {sql:`UPDATE platform_layout_drafts SET draft_json=?,revision=?,schema_version=1,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE experience_id=? AND revision=?`,args:[serialized,revision,actorKey,experienceId,expected]};
   const version={sql:`INSERT INTO platform_layout_draft_versions(version_id,experience_id,revision,draft_json,content_sha256,actor_id,change_reason) SELECT ?,?,?,?, ?,?,? WHERE changes()=1`,args:[uid(),experienceId,revision,serialized,hash,actorKey,reason]};
   const event={sql:`INSERT INTO platform_layout_draft_events(experience_id,revision,event_type,actor_id,details_json) SELECT ?,?,?,?,? WHERE changes()=1`,args:[experienceId,revision,created?'DRAFT_CREATED':'DRAFT_SAVED',actorKey,JSON.stringify({requestId,contentSha256:hash,bytes:new TextEncoder().encode(serialized).length})]};
   const audit=auditStatement({actor,action:created?'layout_studio.draft.create':'layout_studio.draft.save',experienceId,requestId,revision,contentSha256:hash,reason});
   const results=await env.DB.batch([env.DB.prepare(mutation.sql).bind(...mutation.args),env.DB.prepare(version.sql).bind(...version.args),env.DB.prepare(event.sql).bind(...event.args),env.DB.prepare(audit.sql).bind(...audit.args)]);
   if(!results?.[0]?.meta?.changes){throw Object.assign(new Error('LAYOUT_DRAFT_REVISION_CONFLICT'),{status:409,code:'LAYOUT_DRAFT_REVISION_CONFLICT'})}
   if(results.length!==4||results.some(r=>r?.success===false))throw Object.assign(new Error('LAYOUT_DRAFT_ATOMIC_WRITE_FAILED'),{status:500,code:'LAYOUT_DRAFT_ATOMIC_WRITE_FAILED'});
   return json({success:true,experienceId,revision,contentSha256:hash,created,activeProductionChanged:false});
  }catch(e){if(e?.code==='LAYOUT_DRAFT_REVISION_CONFLICT'){try{const actor=await requirePlatformAdministrator(request,env);await env.DB.prepare("INSERT INTO platform_layout_draft_events(experience_id,revision,event_type,actor_id,details_json) VALUES(?,0,'DRAFT_CONFLICT',?,'{}')").bind(GLOBAL_EXPERIENCE_ID,actorId(actor)).run()}catch{}}return fail(e)}
 });
}
