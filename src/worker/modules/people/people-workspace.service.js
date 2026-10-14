import * as driverRepo from "../../repositories/driver.repository.js";
import * as workspaceRepo from "../../repositories/driver-workspace.repository.js";
import {requireWorkTrust} from "../verification/verification.service.js";
import {notifyDirectTenantMessage} from "../notifications/notifications.service.js";
import {isDriverPresent} from "./people-presence.service.js";

const SITUATIONS=new Set(["Available","Driving","Traffic","Break","Unavailable"]);
const VEHICLES=new Set(["PKW","KOMBI","TRANSPORTER","SPRINTER","KASTENWAGEN","LKW_7_5","LKW_OVER_7_5","KUEHLFAHRZEUG","OTHER"]);

export async function adminOverview(env,session,driverId,{history=false}={}){
  const companyId=Number(session.tenantId);
  const driver=await driverRepo.findDriver(env,companyId,driverId);
  if(!driver)throw make("DRIVER_NOT_FOUND",404);
  await workspaceRepo.ensureProfile(env,companyId,driverId);
  const overview=await workspaceRepo.getDriverOverview(env,companyId,driverId,history?12:1);
  if(overview?.driver)overview.driver.online=(Number(overview.driver.active)===1&&await isDriverPresent(env,companyId,driverId))?1:0;
  return overview;
}

export async function adminUpdateProfile(env,session,driverId,data){
  await requireWorkTrust(env,session);
  const companyId=Number(session.tenantId);
  const driver=await driverRepo.findDriver(env,companyId,driverId);
  if(!driver)throw make("DRIVER_NOT_FOUND",404);
  const profile=normalizeProfile(data,true);
  if(data.name!==undefined){
    const name=clean(data.name,160);
    if(!name)throw make("DRIVER_NAME_REQUIRED",400);
    await driverRepo.updateDriverName(env,companyId,driverId,name);
  }
  return workspaceRepo.updateProfile(env,companyId,driverId,profile);
}

export async function driverSelf(env,session){
  const companyId=Number(session.tenantId),driverId=Number(session.driverId);
  const driver=await driverRepo.findDriver(env,companyId,driverId);
  if(!driver||Number(driver.active)!==1)throw make("DRIVER_NOT_FOUND",404);
  await workspaceRepo.ensureProfile(env,companyId,driverId);
  const overview=await workspaceRepo.getDriverOverview(env,companyId,driverId,1);
  if(overview?.driver)overview.driver.online=1;
  return overview;
}

export async function driverUpdateSelf(env,session,data){
  await requireWorkTrust(env,session);
  const companyId=Number(session.tenantId),driverId=Number(session.driverId);
  const driver=await driverRepo.findDriver(env,companyId,driverId);
  if(!driver||Number(driver.active)!==1)throw make("DRIVER_NOT_FOUND",404);
  return workspaceRepo.updateProfile(env,companyId,driverId,normalizeProfile(data,false));
}

export async function getDirectMessages(env,session,driverId){
  const scope=resolveScope(session,driverId);
  const driver=await driverRepo.findDriver(env,scope.companyId,scope.driverId);
  if(!driver)throw make("DRIVER_NOT_FOUND",404);
  return session.role==="driver"
    ?workspaceRepo.listMessagesForDriverView(env,scope.companyId,scope.driverId)
    :workspaceRepo.listMessages(env,scope.companyId,scope.driverId);
}

export async function sendDirectMessage(env,session,driverId,message){
  await requireWorkTrust(env,session);
  const scope=resolveScope(session,driverId);
  const driver=await driverRepo.findDriver(env,scope.companyId,scope.driverId);
  if(!driver)throw make("DRIVER_NOT_FOUND",404);
  const messageId=await workspaceRepo.insertMessage(env,{...scope,senderRole:session.role,senderIdentityId:session.identityId,message});
  if(session.role==="admin")await notifyDirectTenantMessage(env,{tenantId:scope.companyId,driverId:scope.driverId,messageId});
  return messageId;
}

export async function setInitialProfile(env,companyId,driverId,{vehicleType,currentLocation}){
  return workspaceRepo.updateProfile(env,companyId,driverId,normalizeProfile({vehicleType,currentLocation},true));
}

function resolveScope(session,driverId){
  if(session.role==="admin")return {companyId:Number(session.tenantId),driverId:Number(driverId)};
  if(session.role==="driver"){
    if(driverId&&Number(driverId)!==Number(session.driverId))throw make("FORBIDDEN",403);
    return {companyId:Number(session.tenantId),driverId:Number(session.driverId)};
  }
  throw make("FORBIDDEN",403);
}
function normalizeProfile(data,admin){
  const out={};
  if(data.vehicleType!==undefined){const v=String(data.vehicleType||"").trim().toUpperCase();if(v&&!VEHICLES.has(v))throw make("INVALID_VEHICLE_TYPE",400);out.vehicleType=v||null;}
  if(data.currentLocation!==undefined)out.currentLocation=clean(data.currentLocation,180)||null;
  if(data.situation!==undefined){const s=clean(data.situation,32);if(!SITUATIONS.has(s))throw make("INVALID_SITUATION",400);out.situation=s;}
  if(data.situationNote!==undefined)out.situationNote=clean(data.situationNote,300)||"";
  if(!admin)delete out.vehicleType;
  return out;
}
function clean(v,max){return String(v??"").trim().replace(/[\u0000-\u001f\u007f]/g,"").slice(0,max);}
function make(message,status){const e=new Error(message);e.status=status;return e;}


export async function getDriverNotes(env,session){
  const companyId=Number(session.tenantId),driverId=Number(session.driverId);
  const driver=await driverRepo.findDriver(env,companyId,driverId);
  if(!driver||Number(driver.active)!==1)throw make("DRIVER_NOT_FOUND",404);
  return workspaceRepo.listDriverNotes(env,companyId,driverId);
}

export async function addDriverNote(env,session,note){
  await requireWorkTrust(env,session);
  const companyId=Number(session.tenantId),driverId=Number(session.driverId);
  const driver=await driverRepo.findDriver(env,companyId,driverId);
  if(!driver||Number(driver.active)!==1)throw make("DRIVER_NOT_FOUND",404);
  return workspaceRepo.insertDriverNote(env,companyId,driverId,clean(note,2000));
}


export async function clearMyDirectMessages(env,session){
  await requireWorkTrust(env,session);
  if(session.role!=="driver")throw make("FORBIDDEN",403);
  const companyId=Number(session.tenantId),driverId=Number(session.driverId);
  const driver=await driverRepo.findDriver(env,companyId,driverId);
  if(!driver||Number(driver.active)!==1)throw make("DRIVER_NOT_FOUND",404);
  return workspaceRepo.clearDriverMessagesView(env,companyId,driverId);
}

export async function clearMyDriverNotes(env,session){
  await requireWorkTrust(env,session);
  if(session.role!=="driver")throw make("FORBIDDEN",403);
  const companyId=Number(session.tenantId),driverId=Number(session.driverId);
  const driver=await driverRepo.findDriver(env,companyId,driverId);
  if(!driver||Number(driver.active)!==1)throw make("DRIVER_NOT_FOUND",404);
  return workspaceRepo.deleteAllDriverNotes(env,companyId,driverId);
}
