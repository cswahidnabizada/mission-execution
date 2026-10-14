import {readPlatformSuperAdministrator} from './platform-super-administrator.js';

export async function requirePlatformAdministrator(request,env){
  const superAdmin=await readPlatformSuperAdministrator(request,env);
  if(!superAdmin){
    const e=new Error('PLATFORM_ADMINISTRATOR_REQUIRED');
    e.status=403;
    throw e;
  }
  return Object.freeze({role:'platform_administrator',sourceRole:'platform_super_administrator',superAdmin:true});
}
