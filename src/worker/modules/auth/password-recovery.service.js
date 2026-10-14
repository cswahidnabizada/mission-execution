import * as authRepo from '../../repositories/auth.repository.js';
import * as executorRepo from '../../repositories/executor.repository.js';
import * as resetRepo from '../../repositories/password-reset.repository.js';
import { hashPassword } from '../../security/password.js';
import { consumeRateLimit,requestIp } from '../../security/rate-limit.js';
import { sendPasswordResetEmail } from './email.service.js';
import { revokeSessionsForIdentity } from '../../core/auth-session.js';
const TTL_MINUTES=30;
export async function requestPasswordReset(env,request,email){
  if(!env.RESEND_API_KEY||!env.PASSWORD_RESET_FROM_EMAIL){const e=new Error('PASSWORD_RECOVERY_EMAIL_NOT_CONFIGURED');e.status=503;throw e;}
  const normalized=String(email||'').trim().toLowerCase();
  await consumeRateLimit(env,`password-reset:${requestIp(request)}:${normalized}`,{limit:5,windowSeconds:3600});
  let identity=await authRepo.findRecoverableIdentityByEmail(env,normalized),identityType='tenant';
  if(!identity){identity=await executorRepo.findExecutorByEmail(env,normalized);identityType='executor';}
  if(!identity)return {accepted:true};
  const raw=secureToken(),hash=await sha256(raw),expiresAt=new Date(Date.now()+TTL_MINUTES*60000).toISOString();
  await resetRepo.createResetToken(env,{identityType,identityId:identity.id,tokenHash:hash,expiresAt});
  const app=String(env.APP_URL||'').replace(/\/+$/,'');if(!app){const e=new Error('APP_URL_NOT_CONFIGURED');e.status=503;throw e;}
  await sendPasswordResetEmail(env,{to:normalized,resetUrl:`${app}/reset-password.html?token=${encodeURIComponent(raw)}`});
  return {accepted:true};
}
export async function resetPassword(env,{token,password}){
  const hash=await sha256(token),row=await resetRepo.findValidResetToken(env,hash);if(!row){const e=new Error('INVALID_OR_EXPIRED_RESET_TOKEN');e.status=400;throw e;}
  const next=await hashPassword(password);
  if(row.identity_type==='executor')await executorRepo.updateExecutorPassword(env,row.identity_id,next);else await authRepo.updateIdentityPassword(env,row.identity_id,next);
  await resetRepo.markResetUsed(env,row.id);await revokeSessionsForIdentity(env,{identityType:row.identity_type,identityId:row.identity_id});return {reset:true};
}
function secureToken(){const b=new Uint8Array(32);crypto.getRandomValues(b);return Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');}
async function sha256(v){const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(v)));return Array.from(new Uint8Array(d),x=>x.toString(16).padStart(2,'0')).join('');}
