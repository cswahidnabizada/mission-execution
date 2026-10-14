import {consumeRateLimit} from "./rate-limit.js";

export function sessionScope(session){
  if(session?.role==="executor")return `executor:${Number(session.executorId)||0}`;
  const tenant=Number(session?.tenantId)||0;
  const identity=Number(session?.identityId)||0;
  const driver=Number(session?.driverId)||0;
  return `tenant:${tenant}:role:${session?.role||"unknown"}:identity:${identity}:driver:${driver}`;
}

export async function limitAction(env,session,action,{limit,windowSeconds}){
  return consumeRateLimit(env,`${sessionScope(session)}:${action}`,{limit,windowSeconds});
}
