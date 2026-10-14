import {consumeRateLimit,requestIp} from './rate-limit.js';

const COOKIE='onmission_platform_super_admin';
const SESSION_TTL_SECONDS=30*60;
const STEPUP_COOKIE='onmission_platform_super_admin_stepup';
const STEPUP_TTL_SECONDS=5*60;

function allowedIp(request,env){
  const raw=String(env.PLATFORM_SUPER_ADMIN_ALLOWED_IPS||'').trim();
  if(!raw)return true;
  const ip=String(request.headers.get('CF-Connecting-IP')||'').trim();
  const allow=new Set(raw.split(',').map(x=>x.trim()).filter(Boolean));
  return Boolean(ip&&allow.has(ip));
}

function make(message,status){const e=new Error(message);e.status=status;return e;}
function readCookie(request,name){for(const part of String(request.headers.get('Cookie')||'').split(';')){const i=part.indexOf('=');if(i>=0&&part.slice(0,i).trim()===name)return decodeURIComponent(part.slice(i+1).trim())}return ''}
function b64u(bytes){let s='';for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
function ub64u(s){const p=s.replace(/-/g,'+').replace(/_/g,'/');const pad='='.repeat((4-p.length%4)%4);const raw=atob(p+pad);return Uint8Array.from(raw,c=>c.charCodeAt(0));}

async function sign(payload,secret){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(String(secret)),{name:'HMAC',hash:'SHA-256'},false,['sign']);return b64u(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(payload))))}
function equalBytes(a,b){if(a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a[i]^b[i];return d===0;}
async function verify(payload,signature,secret){try{return equalBytes(ub64u(signature),ub64u(await sign(payload,secret)))}catch{return false}}

export async function createPlatformSuperAdminSession(env,request){
  if(!env.PLATFORM_SUPER_ADMIN_SECRET)throw make('PLATFORM_SUPER_ADMIN_NOT_CONFIGURED',503);
  if(request&&!allowedIp(request,env))throw make('PLATFORM_SUPER_ADMIN_IP_NOT_ALLOWED',403);
  const exp=Math.floor(Date.now()/1000)+SESSION_TTL_SECONDS;
  const nonce=crypto.randomUUID()+crypto.randomUUID();
  const generation=String(env.PLATFORM_SUPER_ADMIN_SESSION_GENERATION||'1');
  const payload=`v2|${exp}|${nonce}|${generation}`;
  const sig=await sign(payload,env.PLATFORM_SUPER_ADMIN_SECRET);
  return `${payload}|${sig}`;
}

function normalizeStepUpScope(scope){
  const value=String(scope||'').trim();
  if(!value)return '*';
  if(value==='*')return '*';
  const match=value.match(/^(GET|POST|PUT|PATCH|DELETE):\/(?:[^\s?#]+)(?:\?[^\s#]*)?$/i);
  if(!match)throw make('PLATFORM_SUPER_ADMIN_STEP_UP_SCOPE_INVALID',400);
  return `${match[1].toUpperCase()}:${value.slice(value.indexOf(':')+1)}`;
}

export async function createPlatformSuperAdminStepUpSession(env,request,secret,scope='*'){
  if(!env.PLATFORM_SUPER_ADMIN_SECRET)throw make('PLATFORM_SUPER_ADMIN_NOT_CONFIGURED',503);
  if(request&&!allowedIp(request,env))throw make('PLATFORM_SUPER_ADMIN_IP_NOT_ALLOWED',403);
  const session=await readPlatformSuperAdministrator(request,env);
  if(!session)throw make('PLATFORM_SUPER_ADMIN_REQUIRED',403);
  const supplied=String(secret||'');
  const expected=String(env.PLATFORM_SUPER_ADMIN_SECRET);
  if(!safeEqual(supplied,expected))throw make('FORBIDDEN',403);
  const exp=Math.floor(Date.now()/1000)+STEPUP_TTL_SECONDS;
  const nonce=crypto.randomUUID()+crypto.randomUUID();
  const generation=String(env.PLATFORM_SUPER_ADMIN_SESSION_GENERATION||'1');
  const boundScope=normalizeStepUpScope(scope);
  const payload=`v2-stepup|${exp}|${nonce}|${session.nonce}|${generation}|${boundScope}`;
  const sig=await sign(payload,expected);
  return `${payload}|${sig}`;
}

export async function readPlatformSuperAdminStepUp(request,env,expectedScope=null){
  if(!env.PLATFORM_SUPER_ADMIN_SECRET||!allowedIp(request,env))return null;
  const session=await readPlatformSuperAdministrator(request,env);
  if(!session)return null;
  const token=readCookie(request,STEPUP_COOKIE);
  if(!token)return null;
  const parts=token.split('|');
  if(parts.length!==7||parts[0]!=='v2-stepup')return null;
  const exp=Number(parts[1]);
  if(!Number.isSafeInteger(exp)||exp<=Math.floor(Date.now()/1000))return null;
  const payload=parts.slice(0,6).join('|');
  if(!(await verify(payload,parts[6],env.PLATFORM_SUPER_ADMIN_SECRET)))return null;
  const generation=String(env.PLATFORM_SUPER_ADMIN_SESSION_GENERATION||'1');
  if(parts[3]!==session.nonce||parts[4]!==generation)return null;
  const boundScope=parts[5];
  if(expectedScope!=null){
    const requested=normalizeStepUpScope(expectedScope);
    if(boundScope!=='*'&&boundScope!==requested)return null;
  }
  return Object.freeze({expiresAt:exp*1000,scope:boundScope,sessionNonce:session.nonce,generation});
}

export async function requirePlatformSuperAdminStepUp(request,env,expectedScope=null){
  const url=new URL(request.url);
  const requestScope=expectedScope==null?`${String(request.method||'GET').toUpperCase()}:${url.pathname}${url.search||''}`:expectedScope;
  const session=await readPlatformSuperAdministrator(request,env);
  const stepUp=await readPlatformSuperAdminStepUp(request,env,requestScope);
  if(!session||!stepUp){const e=make('PLATFORM_SUPER_ADMIN_STEP_UP_REQUIRED',403);throw e;}
  return session;
}

export async function requirePlatformSuperAdministrator(request,env){
  const actor=await readPlatformSuperAdministrator(request,env);
  if(!actor)throw make('PLATFORM_SUPER_ADMIN_REQUIRED',403);
  return actor;
}

export async function readPlatformSuperAdministrator(request,env){
  if(!env.PLATFORM_SUPER_ADMIN_SECRET)return null;
  if(!allowedIp(request,env))return null;
  const token=readCookie(request,COOKIE);
  if(!token)return null;
  const parts=token.split('|');
  if(parts.length!==5||parts[0]!=='v2')return null;
  const exp=Number(parts[1]);
  if(!Number.isSafeInteger(exp)||exp<=Math.floor(Date.now()/1000))return null;
  const payload=parts.slice(0,4).join('|');
  if(!(await verify(payload,parts[4],env.PLATFORM_SUPER_ADMIN_SECRET)))return null;
  const generation=String(env.PLATFORM_SUPER_ADMIN_SESSION_GENERATION||'1');
  if(parts[3]!==generation)return null;
  return Object.freeze({role:'platform_super_administrator',sourceRole:'platform_access_admin',expiresAt:exp*1000,nonce:parts[2],generation});
}

export async function destroyPlatformSuperAdministrator(){return true;}

function safeEqual(a,b){const x=new TextEncoder().encode(String(a||'')),y=new TextEncoder().encode(String(b||''));if(x.length!==y.length)return false;let d=x.length^y.length;const n=Math.max(x.length,y.length);for(let i=0;i<n;i++)d|=(x[i%n]||0)^(y[i%n]||0);return d===0}

export const PLATFORM_SUPER_ADMIN_COOKIE=COOKIE;
export const PLATFORM_SUPER_ADMIN_STEPUP_COOKIE=STEPUP_COOKIE;
export const PLATFORM_SUPER_ADMIN_STEPUP_TTL=STEPUP_TTL_SECONDS;
export const PLATFORM_SUPER_ADMIN_TTL=SESSION_TTL_SECONDS;
