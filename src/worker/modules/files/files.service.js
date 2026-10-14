import * as fileRepo from '../../repositories/file.repository.js';
import * as messageRepo from '../../repositories/message.repository.js';
import { resolveMissionAccess } from '../../security/mission-access.js';
import { assertPhoto,assertImageBytes } from '../../security/validation.js';
import { audit } from '../../security/audit.js';
import { requireWorkTrust } from '../verification/verification.service.js';
import { prepareMissionFileRecord, authorizeFileAccess } from './file-governance.service.js';
import {resolveExternalProviderGovernance} from '../../security/external-provider-governance.service.js';
export async function uploadPhoto(env,session,missionId,file,caption=''){
  await requireWorkTrust(env,session);
  const a=await resolveMissionAccess(env,session,missionId);if(!a)throw forbidden();assertPhoto(file);const tenantId=a.tenantId;
  const r2Key=buildKey(tenantId,missionId,file.type),bytes=await file.arrayBuffer();assertImageBytes(bytes,file.type);
  const contentSha256=await sha256(bytes);
  const record=await prepareMissionFileRecord(env,session,{missionId,file,tenantId,purposeCode:'MISSION_EXECUTION',evidenceType:'attachment',r2Key,contentSha256});
  await resolveExternalProviderGovernance(env,{providerCode:'r2_primary',companyId:Number(record.controllerCompanyId),countryCode:String(record.countryCode||session?.countryCode||'').toUpperCase(),purposeCode:'mission_execution',classification:record.classification,dataFields:['file_bytes','content_type','mission_id','company_id','evidence_type','integrity_hash'],authorizationScope:'mission_file_storage',authorizationGranted:true,operation:'file_upload'});
  await env.FILES.put(r2Key,bytes,{httpMetadata:{contentType:file.type},customMetadata:{companyId:String(record.controllerCompanyId),missionId:String(missionId),driverId:session.driverId?String(session.driverId):'',role:session.role,classification:record.classification,purpose:record.purposeCode,evidenceType:record.evidenceType,retentionPolicy:record.retentionPolicyCode}});
  let fileId=null;try{
    fileId=await fileRepo.insertMissionFile(env,record);
    await messageRepo.insertMessage(env,{tenantId,missionId,senderRole:session.role==='admin'?'admin':session.role==='executor'?'executor':'driver',driverId:session.role==='driver'?session.driverId:null,message:caption||'Photo',messageType:'photo',fileId});
    await audit(env,{session:{...session,tenantId},action:'file.upload',resourceType:'mission',resourceId:missionId,metadata:{fileId}});return {id:fileId,missionId,mimeType:file.type,originalName:file.name||'photo',fileSize:file.size};
  }catch(error){if(fileId){try{await fileRepo.markUploadFailed(env,tenantId,fileId)}catch{}}try{await env.FILES.delete(r2Key)}catch{}throw error;}
}
export async function listFiles(env,session,missionId,filters={}){const a=await resolveMissionAccess(env,session,missionId);if(!a)throw forbidden();return fileRepo.listMissionFiles(env,a.tenantId,missionId,filters);}
export async function readFile(env,session,fileId){const file=await fileRepo.findFileAny(env,fileId);if(!file)throw notFound();const decision=await authorizeFileAccess(env,session,file);if(!decision.allowed)throw Object.assign(new Error(decision.reason||'Not authorized for this file'),{status:403});const object=await env.FILES.get(file.r2_key);if(!object)throw notFound();return {file,object,access:decision};}
function buildKey(t,m,type){const ext=type==='image/png'?'png':type==='image/webp'?'webp':'jpg';return `tenants/${t}/missions/${m}/photos/${crypto.randomUUID()}.${ext}`;}
function forbidden(){const e=new Error('Not authorized for this file');e.status=403;return e;}function notFound(){const e=new Error('File not found');e.status=404;return e;}


export async function uploadDeliveryProof(env,session,missionId,file){
  await requireWorkTrust(env,session);
  if(!["driver","executor"].includes(session.role)){const e=new Error("Delivery proof must be submitted by the assigned driver or executor");e.status=403;throw e;}
  const a=await resolveMissionAccess(env,session,missionId);if(!a)throw forbidden();
  const missionStatus=String(a.mission?.status||"");
  if(!["InTransit","Delivered"].includes(missionStatus)){const e=new Error("Delivery proof is only accepted during delivery or Delivered recovery.");e.status=409;throw e;}
  assertPhoto(file);
  const tenantId=Number(a.tenantId),bytes=await file.arrayBuffer();assertImageBytes(bytes,file.type);
  const contentSha256=await sha256(bytes);
  const r2Key=`tenants/${tenantId}/missions/${missionId}/delivery-proof/${crypto.randomUUID()}.${file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg'}`;
  const record=await prepareMissionFileRecord(env,session,{missionId,file,tenantId,purposeCode:'EVIDENCE',evidenceType:'critical_evidence',r2Key,contentSha256});
  await resolveExternalProviderGovernance(env,{providerCode:'r2_primary',companyId:Number(record.controllerCompanyId),countryCode:String(record.countryCode||session?.countryCode||'').toUpperCase(),purposeCode:'mission_execution',classification:record.classification,dataFields:['file_bytes','content_type','mission_id','company_id','evidence_type','integrity_hash'],authorizationScope:'mission_file_storage',authorizationGranted:true,operation:'file_upload'});
  await env.FILES.put(r2Key,bytes,{httpMetadata:{contentType:file.type},customMetadata:{companyId:String(record.controllerCompanyId),missionId:String(missionId),role:session.role,classification:record.classification,purpose:record.purposeCode,evidenceType:record.evidenceType,retentionPolicy:record.retentionPolicyCode}});
  let fileId=null;
  try{
    fileId=await fileRepo.insertMissionFile(env,record);
    const proofId=await fileRepo.insertDeliveryProof(env,{tenantId,missionId,fileId,role:session.role,driverId:session.role==='driver'?Number(session.driverId):null,executorId:session.role==='executor'?Number(session.executorId):null});
    await messageRepo.insertMessage(env,{tenantId,missionId,senderRole:session.role,driverId:session.role==='driver'?Number(session.driverId):null,message:'Delivery proof',messageType:'photo',fileId});
    await audit(env,{session:{...session,tenantId},action:'mission.delivery_proof',resourceType:'mission',resourceId:missionId,metadata:{proofId,fileId,role:session.role}});
    return {id:proofId,fileId,missionId,mimeType:file.type,fileSize:file.size,createdAt:new Date().toISOString()};
  }catch(error){
    if(fileId){try{await fileRepo.markUploadFailed(env,tenantId,fileId)}catch{}}
    try{await env.FILES.delete(r2Key)}catch{}
    throw error;
  }
}

export async function getDeliveryProof(env,session,missionId){
  const a=await resolveMissionAccess(env,session,missionId);if(!a)throw forbidden();
  return {proof:await fileRepo.findDeliveryProof(env,Number(a.tenantId),Number(missionId)),required:Number(a.mission?.delivery_proof_required??1)===1};
}

async function sha256(bytes){const digest=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');}
