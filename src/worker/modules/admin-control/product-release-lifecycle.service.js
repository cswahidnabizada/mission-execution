import {RELEASE_VERSION} from '../../core/release.js';
import {getProductContract} from './product-contract.service.js';
import {getProductDependencyGraph} from '../../security/product-launch-workspace.service.js';
import {runProductTestLab} from './product-test-lab.service.js';
import {auditAdminControl} from './admin-control.audit.js';

import { authorityUnavailable } from '../../core/canonical-db.js';
const clean=(v,max=500)=>String(v??'').trim().slice(0,max);
const json=(v,f={})=>{try{return JSON.parse(String(v??'null'))??f}catch{return f}};
const sha256=async value=>{const bytes=new TextEncoder().encode(value);const digest=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');};
const fail=(m,s=400,c)=>Object.assign(new Error(m),{status:s,code:c});

export const PRODUCT_RELEASE_LIFECYCLE_VERSION=`${RELEASE_VERSION}-release-lifecycle`;
export const RELEASE_STATES=Object.freeze(['draft','validated','authorized','published','verified','live','retired']);

function normalize(row){
 if(!row)return null;
 return {...row,id:Number(row.id),launchId:Number(row.launch_id),previousLaunchId:row.previous_launch_id==null?null:Number(row.previous_launch_id),state:String(row.state),dependencySnapshot:json(row.dependency_snapshot_json,{}),contractSnapshot:json(row.contract_snapshot_json,null),verificationEvidence:json(row.verification_evidence_json,{}),rollbackPath:json(row.rollback_path_json,{}),authorization:row.authorized_at?{byType:row.authorized_by_type,byId:row.authorized_by_id,at:row.authorized_at}:null};
}

export async function beginProductReleaseOperation(env,actor,{launchId,operationType,requestId='',keySuffix=''}={}){
 const id=Number(launchId);const type=String(operationType||'').toLowerCase();if(!Number.isInteger(id)||!['publish','verify','rollback'].includes(type))throw fail('Invalid product release operation.',400,'PRODUCT_RELEASE_OPERATION_INVALID');
 const key=`${type}:${id}:${clean(keySuffix||requestId||crypto.randomUUID(),180)}`;
 const existing=await env.DB.prepare(`SELECT * FROM platform_product_release_operations WHERE operation_key=? LIMIT 1`).bind(key).first();
 if(existing)return {...existing,reused:true,id:Number(existing.id),metadata:json(existing.metadata_json,{})};
 const r=await env.DB.prepare(`INSERT INTO platform_product_release_operations(operation_key,launch_id,operation_type,status,actor_type,actor_id,request_id) VALUES(?,?,?,'precheck',?,?,?)`).bind(key,id,type,actor?.role||actor?.type||null,actor?.id==null?null:String(actor.id),requestId||null).run();
 const row=await env.DB.prepare(`SELECT * FROM platform_product_release_operations WHERE id=?`).bind(Number(r.meta?.last_row_id||r.last_row_id)).first();return {...row,id:Number(row.id),metadata:json(row.metadata_json,{})};
}
export async function setProductReleaseOperationStatus(env,operation,status,metadata={}){
 const allowed=['precheck','preparing','publishing','verifying','committed','failed','reconciliation_required'];if(!allowed.includes(status))throw fail('Invalid product release operation status.',400,'PRODUCT_RELEASE_OPERATION_STATUS_INVALID');
 const updated=await env.DB.prepare(`UPDATE platform_product_release_operations SET status=?,metadata_json=?,updated_at=CURRENT_TIMESTAMP,completed_at=CASE WHEN ? IN ('committed','failed','reconciliation_required') THEN CURRENT_TIMESTAMP ELSE completed_at END WHERE id=? AND status NOT IN ('committed','failed')`).bind(status,JSON.stringify(metadata||{}),status,Number(operation.id)).run();
 if(Number(updated.meta?.changes||0)!==1)throw fail('Product release operation is no longer mutable.',409,'PRODUCT_RELEASE_OPERATION_NOT_MUTABLE');
 return env.DB.prepare(`SELECT * FROM platform_product_release_operations WHERE id=?`).bind(Number(operation.id)).first();
}
export async function failProductReleaseOperation(env,operation,error,metadata={}){
 return setProductReleaseOperationStatus(env,operation,'failed',{...(metadata||{}),errorCode:error?.code||'PRODUCT_RELEASE_OPERATION_FAILED',errorMessage:error?.message||'Product release operation failed'});
}

export async function ensureProductReleaseRecord(env,launchId,{previousLaunchId=null}={}){
 const id=Number(launchId);
 let row=await env.DB.prepare(`SELECT * FROM platform_product_release_lifecycles WHERE launch_id=? LIMIT 1`).bind(id).first();
 if(row)return normalize(row);
 const launch=await env.DB.prepare(`SELECT id,country_code,version,status,active FROM country_product_launches WHERE id=? LIMIT 1`).bind(id).first();
 if(!launch)throw fail('Product launch not found',404,'COUNTRY_PRODUCT_LAUNCH_NOT_FOUND');
 let previous=previousLaunchId;
 if(previous==null){const r=await env.DB.prepare(`SELECT id FROM country_product_launches WHERE country_code=? AND active=1 AND id<>? ORDER BY id DESC LIMIT 1`).bind(launch.country_code,id).first();previous=r?.id??null;}
 const initialState=launch.status==='active'&&Number(launch.active)===1?'live':launch.status==='validated'?'validated':launch.status==='retired'?'retired':'draft';
 await env.DB.prepare(`INSERT INTO platform_product_release_lifecycles(launch_id,previous_launch_id,state) VALUES(?,?,?)`).bind(id,previous==null?null:Number(previous),initialState).run();
 row=await env.DB.prepare(`SELECT * FROM platform_product_release_lifecycles WHERE launch_id=? LIMIT 1`).bind(id).first();
 return normalize(row);
}

export async function getProductReleaseLifecycle(env,{launchId}={}){
 const id=Number(launchId);if(!Number.isInteger(id)||id<=0)throw fail('Invalid product launch id',400,'PRODUCT_RELEASE_LAUNCH_ID_INVALID');
 const release=await ensureProductReleaseRecord(env,id);
 const launch=await env.DB.prepare(`SELECT status,active FROM country_product_launches WHERE id=? LIMIT 1`).bind(id).first();
 if(release.state==='authorized'&&launch?.status==='active'&&Number(launch.active)===1){
   const op=await env.DB.prepare(`SELECT * FROM platform_product_release_operations WHERE launch_id=? AND operation_type='publish' AND status='publishing' ORDER BY id DESC LIMIT 1`).bind(id).first();
   if(op){await env.DB.prepare(`UPDATE platform_product_release_lifecycles SET state='published',published_at=COALESCE(published_at,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP WHERE launch_id=? AND state='authorized'`).bind(id).run();await setProductReleaseOperationStatus(env,op,'committed',{reconciled:true,reason:'Active launch proves publication committed before lifecycle acknowledgement.'});return ensureProductReleaseRecord(env,id);}
 }
 if(release.state==='verified'&&launch?.status==='active'&&Number(launch.active)===1){
   await env.DB.prepare(`UPDATE platform_product_release_lifecycles SET state='live',live_at=COALESCE(live_at,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP WHERE launch_id=? AND state='verified'`).bind(id).run();
 }
 return ensureProductReleaseRecord(env,id);
}

export async function listProductReleaseHistory(env,{countryCode}={}){
 const code=clean(countryCode,2).toUpperCase();
 const rows=(await env.DB.prepare(`SELECT r.*,l.country_code,l.version,l.status launch_status,l.active,l.effective_at,l.created_at launch_created_at FROM platform_product_release_lifecycles r JOIN country_product_launches l ON l.id=r.launch_id WHERE l.country_code=? ORDER BY CAST(l.version AS INTEGER) DESC,l.id DESC`).bind(code).all()).results||[];
 return rows.map(normalize);
}

export async function authorizeProductRelease(env,actor,launchId,requestId=''){
 const id=Number(launchId);
 const launch=await env.DB.prepare(`SELECT * FROM country_product_launches WHERE id=? LIMIT 1`).bind(id).first();
 if(!launch)throw fail('Product launch not found',404,'COUNTRY_PRODUCT_LAUNCH_NOT_FOUND');
 if(launch.status!=='validated')throw fail('Only a validated product version can be authorized.',409,'PRODUCT_RELEASE_NOT_VALIDATED');
 const readiness=json(launch.readiness_json,{});
 if(readiness.valid!==true)throw fail('Product release is not ready for authorization.',409,'PRODUCT_RELEASE_NOT_READY');
 const [contract,testLab,graph]=await Promise.all([
  getProductContract(env,{launchId:id}),
  runProductTestLab(env,{launchId:id}),
  getProductDependencyGraph(env,id)
 ]);
 if(!testLab.summary?.ready)throw fail('Product Test Lab is not ready for authorization.',409,'PRODUCT_TEST_LAB_NOT_READY');
 const release=await ensureProductReleaseRecord(env,id);
 const rollbackPath=release.previousLaunchId?{type:'previous_release',launchId:release.previousLaunchId,path:'Activate the previous verified/live product version after its release gate is satisfied.'}:{type:'none',path:'No previous live release exists for this country.'};
 const launchManifest=json(launch.manifest_json,{});
 let layoutArtifactBinding=null;
 // Layout Studio is only a release dependency when the canonical launch manifest explicitly binds it.
 // Validate the binding against the immutable draft-version row; never infer a market or tenant scope.
 if(launchManifest.layoutArtifactBinding!==undefined){
  const binding=launchManifest.layoutArtifactBinding;
  if(!binding||binding.schema!=='onmission.layout-artifact-binding.v1'||binding.experienceId!=='onmission.global.experience'||typeof binding.versionId!=='string'||typeof binding.contentSha256!=='string'||!/^[a-f0-9]{64}$/.test(binding.contentSha256))throw fail('Layout artifact binding is invalid.',409,'PRODUCT_RELEASE_LAYOUT_BINDING_INVALID');
  const artifact=await env.DB.prepare('SELECT version_id,experience_id,revision,draft_json,content_sha256,created_at FROM platform_layout_draft_versions WHERE version_id=? AND experience_id=? LIMIT 1').bind(binding.versionId,binding.experienceId).first().catch(error=>{throw authorityUnavailable('product_release_layout_artifact_lookup',error)});
  if(!artifact)throw fail('Bound immutable layout artifact was not found.',409,'PRODUCT_RELEASE_LAYOUT_ARTIFACT_MISSING');
  const actualContentHash=await sha256(String(artifact.draft_json));
  if(actualContentHash!==artifact.content_sha256||actualContentHash!==binding.contentSha256||Number(binding.revision)!==Number(artifact.revision))throw fail('Bound immutable layout artifact integrity check failed.',409,'PRODUCT_RELEASE_LAYOUT_ARTIFACT_INTEGRITY_FAILED');
  layoutArtifactBinding={schema:'onmission.layout-artifact-binding.v1',experienceId:artifact.experience_id,versionId:artifact.version_id,revision:Number(artifact.revision),contentSha256:actualContentHash,createdAt:artifact.created_at,verifiedAt:new Date().toISOString(),source:'platform_layout_draft_versions'};
 }
 const dependencySnapshot={version:PRODUCT_RELEASE_LIFECYCLE_VERSION,graph,...(layoutArtifactBinding?{layoutArtifact:layoutArtifactBinding}:{}),layoutArtifactBindingRequired:launchManifest.layoutArtifactBindingRequired===true};
 if(dependencySnapshot.layoutArtifactBindingRequired&&!layoutArtifactBinding)throw fail('This product release requires a verified immutable Layout Studio artifact binding.',409,'PRODUCT_RELEASE_LAYOUT_BINDING_REQUIRED');
 const dependencySnapshotHash=await sha256(JSON.stringify(dependencySnapshot));
 await env.DB.prepare(`UPDATE platform_product_release_lifecycles SET state='authorized',contract_hash=?,contract_snapshot_json=?,dependency_snapshot_json=?,dependency_snapshot_hash=?,rollback_path_json=?,authorized_by_type=?,authorized_by_id=?,authorized_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE launch_id=?`).bind(contract.contractHash,contract.canonicalJson,JSON.stringify(dependencySnapshot),dependencySnapshotHash,JSON.stringify(rollbackPath),actor.role,actor.id||null,id).run();
 await auditAdminControl(env,{actor,action:'admin.product-release.authorized',resourceType:'country_product_launch',resourceId:id,requestId,metadata:{countryCode:launch.country_code,version:launch.version,contractHash:contract.contractHash,previousLaunchId:release.previousLaunchId}}).catch(error=>{throw authorityUnavailable('product_release_audit',error);});
 return getProductReleaseLifecycle(env,{launchId:id});
}

export async function markProductReleasePublished(env,actor,launchId,requestId=''){
 const id=Number(launchId);const release=await ensureProductReleaseRecord(env,id);
 if(release.state!=='authorized')throw fail('Product release must be authorized before publication.',409,'PRODUCT_RELEASE_NOT_AUTHORIZED');
 if(!release.contractHash||!release.contractSnapshot)throw fail('Authorized product contract snapshot is missing.',409,'PRODUCT_RELEASE_CONTRACT_SNAPSHOT_MISSING');
 await env.DB.prepare(`UPDATE platform_product_release_lifecycles SET state='published',published_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE launch_id=?`).bind(id).run();
 await auditAdminControl(env,{actor,action:'admin.product-release.published',resourceType:'country_product_launch',resourceId:id,requestId,metadata:{}}).catch(error=>{throw authorityUnavailable('product_release_audit',error);});
 return getProductReleaseLifecycle(env,{launchId:id});
}

export async function markProductReleaseVerified(env,actor,launchId,verificationResults=[],requestId=''){
 const id=Number(launchId);const release=await ensureProductReleaseRecord(env,id);
 if(release.state!=='published')throw fail('Product release must be published before verification.',409,'PRODUCT_RELEASE_NOT_PUBLISHED');
 const results=Array.isArray(verificationResults)?verificationResults.map(x=>({id:x?.id||null,status:x?.status||null,summary:x?.summary||null})):[];
 if(!results.length||results.some(x=>x.status!=='succeeded'))throw fail('Product release cannot become verified until every required live verification run succeeds.',409,'PRODUCT_RELEASE_VERIFICATION_INCOMPLETE');
 const evidence={verifiedAt:new Date().toISOString(),results};
 await env.DB.prepare(`UPDATE platform_product_release_lifecycles SET state='verified',verification_evidence_json=?,verified_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE launch_id=? AND state='published'`).bind(JSON.stringify(evidence),id).run();
 await auditAdminControl(env,{actor,action:'admin.product-release.verified',resourceType:'country_product_launch',resourceId:id,requestId,metadata:{verificationCount:evidence.results.length}}).catch(error=>{throw authorityUnavailable('product_release_audit',error);});
 return getProductReleaseLifecycle(env,{launchId:id});
}

export async function markProductReleaseLive(env,actor,launchId,requestId=''){
 const id=Number(launchId);const release=await ensureProductReleaseRecord(env,id);
 if(release.state!=='verified')throw fail('Product release must be verified before it can become live.',409,'PRODUCT_RELEASE_NOT_VERIFIED');
 const launch=await env.DB.prepare(`SELECT id,status,active FROM country_product_launches WHERE id=? LIMIT 1`).bind(id).first();
 if(!launch||launch.status!=='active'||Number(launch.active)!==1)throw fail('Verified release is not the active country product.',409,'PRODUCT_RELEASE_ACTIVE_LAUNCH_REQUIRED');
 await env.DB.prepare(`UPDATE platform_product_release_lifecycles SET state='live',live_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE launch_id=? AND state='verified'`).bind(id).run();
 await auditAdminControl(env,{actor,action:'admin.product-release.live',resourceType:'country_product_launch',resourceId:id,requestId,metadata:{}}).catch(error=>{throw authorityUnavailable('product_release_audit',error);});
 return getProductReleaseLifecycle(env,{launchId:id});
}

export async function createNextProductRelease(env,actor,launchId,requestId='',createDraft){
 const source=await env.DB.prepare(`SELECT * FROM country_product_launches WHERE id=? LIMIT 1`).bind(Number(launchId)).first();
 if(!source)throw fail('Source product launch not found',404,'PRODUCT_RELEASE_SOURCE_NOT_FOUND');
 if(Number(source.active)!==1&&source.status!=='active')throw fail('Only the current live product version can create the next release.',409,'PRODUCT_RELEASE_SOURCE_NOT_LIVE');
 const input={countryCode:source.country_code,blueprintId:source.country_blueprint_id,manifest:json(source.manifest_json,{}),reason:`Next version created from ${source.country_code} v${source.version}`};
 const draft=await createDraft(env,actor,input,requestId);
 await ensureProductReleaseRecord(env,draft.id,{previousLaunchId:source.id});
 await auditAdminControl(env,{actor,action:'admin.product-release.next-version-created',resourceType:'country_product_launch',resourceId:draft.id,requestId,metadata:{sourceLaunchId:source.id,sourceVersion:source.version,targetVersion:draft.version}}).catch(error=>{throw authorityUnavailable('product_release_audit',error);});
 return draft;
}
