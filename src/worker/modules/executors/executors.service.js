import * as execRepo from '../../repositories/executor.repository.js';
import * as authRepo from '../../repositories/auth.repository.js';
import { hashPassword } from '../../security/password.js';
import { consumeRateLimit,requestIp } from '../../security/rate-limit.js';
import {evaluateCountryEligibility} from '../../security/country-product-launch.service.js';
export async function registerExecutor(env,request,data){
  await consumeRateLimit(env,`executor-register:${requestIp(request)}:${data.email}`,{limit:5,windowSeconds:3600});
  const eligibility=await evaluateCountryEligibility(env,{countryCode:data.countryCode,email:data.email,organizationType:'company',sectorCode:'general',userClass:'independent_executor'});
  if(!eligibility.allowed){const e=new Error(eligibility.reason==='COUNTRY_NOT_LAUNCHED'?'This country is still under development.':'Independent executor access is not currently available for this country.');e.status=422;throw e;}
  if(await authRepo.findIdentityByLogin(env,data.email)||await execRepo.findExecutorByEmail(env,data.email)){const e=new Error('ACCOUNT_ALREADY_EXISTS');e.status=409;throw e;}
  const password=await hashPassword(data.password);
  const executorId=await execRepo.createExecutor(env,{email:data.email,displayName:data.name,passwordHash:password.hash,passwordSalt:password.salt,passwordIterations:password.iterations},data);
  return execRepo.findExecutorById(env,executorId);
}
export async function updateProfile(env,session,data){return execRepo.updateExecutorProfile(env,Number(session.executorId),data);}
