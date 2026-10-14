import {resolveActivation} from './activation.service.js';
import {consumeOperationalAccess,readOperationalAccess,writeOperationalAccess,clearOperationalAccess} from './operational-access-cache.js';
import {getSessionToken} from '../core/auth-session.js';
import {getCountryProductLaunch} from './country-product-launch.service.js';
import {canonicalFirst} from '../core/canonical-db.js';

export const OPERATIONAL_GATE_VERSION='1.1.0';
const NON_COMMERCIAL=new Set(['open_mission','message','navigate','report_exception','capture_proof','advance_execution','confirm_arrival','lifecycle_flow','exception','start_custody_resolution','confirm_custody_release','accept_custody','reassign_custody_receiver','cancel_foryou_request','decline_foryou_request','withdraw_foryou']);
const ACTION_TO_CAP={create_mission:'createMissions',create_driver:'createDrivers',share_foryou:'shareForYou',request_foryou_mission:'requestForYou',share_network:'shareNetwork',accept_network:'acceptNetwork',repost_foryou:'shareForYou',restart_network:'shareNetwork'};

export async function resolveOperationalGate(env,session,{force=false}={}){
  const activation=await resolveActivation(env,session);
  const items=[];
  const countryCode=String(session?.countryCode||'').toUpperCase();
  if(countryCode && !['ZZ'].includes(countryCode)){
    const launch=await getCountryProductLaunch(env,countryCode,{publicOnly:true});
    if(!launch)items.push({id:'product:country-not-launched',source:'product',priority:'blocking',title:'Product not ready in your country',message:'This country product is still under development or has been retired. ON Mission access will open only after the country product is activated.',action:{label:'View product status',href:'/',kind:'product_status'}});
  }
  if(activation.next)items.push({id:`activation:${activation.next.kind}`,source:'activation',priority:'blocking',title:activation.next.title,message:activation.next.message,action:{label:activation.next.label,href:activation.next.href,kind:activation.next.kind}});
  const b=activation.billing||{},u=b.usage||{},l=b.limits||{};
  // Capacity attention is a billing renewal signal, never a generic readiness signal.
  // Drivers and currently exempt independent executors must never inherit tenant
  // subscription warnings merely because a policy row contains capacity fields.
  const billingEligible=b.subscriptionRequired===true && b.subscriptionClass!=="exempt";
  const remaining=(limit,value)=>Number(limit)>=0?Math.max(0,Number(limit)-Number(value||0)):null;
  const missionLeft=remaining(l.missionsPeriod,u.missionsCreated),driverLeft=remaining(l.drivers,u.activeDrivers);
  if(billingEligible && !activation.next && missionLeft!==null && missionLeft<=20 && missionLeft>=0)items.push({id:'billing:missions-capacity',source:'subscription',priority:'attention',title:`Your current period has ${missionLeft} missions left`,message:'Your mission capacity is getting low. Review your subscription before the period limit is reached.',action:{label:'Update subscription',href:'/app#account?activation=1',kind:'billing'},dismissible:true});
  if(billingEligible && !activation.next && driverLeft!==null && driverLeft<=2 && driverLeft>=0)items.push({id:'billing:drivers-capacity',source:'subscription',priority:'attention',title:`Only ${driverLeft} driver slots remain`,message:'Your current driver capacity is nearly full. Review your subscription before adding more drivers.',action:{label:'Update subscription',href:'/app#account?activation=1',kind:'billing'},dismissible:true});
  const state=String(activation.access?.state||'');
  const block=items.some(x=>x.priority==='blocking')||Boolean(activation.next)||!activation.readyToGo||['payment_required','period_expired','subscription_required','verification_required'].includes(state);
  return Object.freeze({version:OPERATIONAL_GATE_VERSION,decision:block?'BLOCK':'ALLOW',readyToGo:activation.readyToGo===true,items:Object.freeze(items),activation,source:block?'activation':'operational_access',refreshRequired:Boolean(force)});
}
export async function getOperationalGateForRequest(env,request,session,{force=false}={}){
  const token=getSessionToken(request);
  if(!force){const cached=await readOperationalAccess(env,token);if(cached)return Object.freeze({version:OPERATIONAL_GATE_VERSION,decision:cached.decision,readyToGo:cached.readyToGo,activation:cached.activation,items:cached.items||[],source:'session_cache',expiresAt:cached.expiresAt,actionCount:Number(cached.actionCount||0)});}
  const gate=await resolveOperationalGate(env,session,{force});
  if(token)await writeOperationalAccess(env,token,{decision:gate.decision,readyToGo:gate.readyToGo,activation:gate.activation,items:gate.items});
  return gate;
}
export async function primeOperationalAccess(env,token,session){
  const gate=await resolveOperationalGate(env,session,{force:true});
  await writeOperationalAccess(env,token,{decision:gate.decision,readyToGo:gate.readyToGo,activation:gate.activation,items:gate.items});
  return gate;
}
export async function invalidateOperationalAccess(env,request){return clearOperationalAccess(env,getSessionToken(request));}
export async function refreshOperationalAccessForSession(env,session){const token=session?.__sessionToken;if(!token)return null;const gate=await resolveOperationalGate(env,session,{force:true});await writeOperationalAccess(env,token,{decision:gate.decision,readyToGo:gate.readyToGo,activation:gate.activation,items:gate.items});session.operationalAccess={...session.operationalAccess,decision:gate.decision,readyToGo:gate.readyToGo,activation:gate.activation,items:gate.items,expiresAt:Date.now()+60000,actionCount:0};return gate;}
export async function requireOperationalAction(env,request,session,actionCode){
  let gate=await getOperationalGateForRequest(env,request,session);
  if(gate.decision!=='ALLOW')return {allowed:false,gate};
  const token=getSessionToken(request);
  let used=await consumeOperationalAccess(env,token);
  if(!used){
    gate=await getOperationalGateForRequest(env,request,session,{force:true});
    if(gate.decision!=='ALLOW')return {allowed:false,gate};
    // A refreshed lease is never sufficient by itself. Consume the newly
    // issued lease before allowing the action, closing the rollover bypass.
    used=await consumeOperationalAccess(env,token);
    if(!used)return {allowed:false,gate};
  }
  session.__operationalGateConsumed=true;
  session.operationalAccess=used;
  const code=String(actionCode||'');
  const cap=ACTION_TO_CAP[code];
  if(cap && gate.activation?.actions?.[code]?.allowed!==true)return {allowed:false,gate};
  if(NON_COMMERCIAL.has(code)||!cap)return {allowed:true,gate};
  return {allowed:true,gate};
}
