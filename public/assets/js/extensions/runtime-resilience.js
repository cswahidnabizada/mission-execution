/* ON Mission 10.35.5 — canonical runtime resilience.
 * Presentation/read orchestration only. Mutations are never retried or replayed.
 */
import {isNetworkOffline,waitForOnline,noteNetworkFailure,noteNetworkCancellation} from "../core/network-continuity.js";

const state={reads:0,retries:0,cancelled:0,races:0,recovered:0,failed:0,coalesced:0,offlineDeferred:0};
const emit=()=>{try{window.dispatchEvent(new CustomEvent('onmission:runtime-performance',{detail:{type:'resilience',...state}}));}catch{}};
const readControllers=new Map();
const refreshIntents=new Map();
const mutationLocks=new Map();

const sleep=(ms,signal)=>new Promise((resolve,reject)=>{const t=setTimeout(resolve,ms);if(!signal)return;const onAbort=()=>{clearTimeout(t);signal.removeEventListener?.('abort',onAbort);reject(Object.assign(new Error('Read cancelled'),{name:'AbortError'}));};if(signal.aborted)onAbort();else signal.addEventListener?.('abort',onAbort,{once:true});});

export function isAbortError(error){return error?.name==='AbortError'||error?.code==='ABORT_ERR';}
export function isRetryableReadFailure(error,response){
  if(isAbortError(error))return false;
  if(!response)return true;
  return [408,425,429,500,502,503,504].includes(Number(response.status));
}
export function retryDelay(attempt,{baseMs=180,maxMs=1200}={}){
  const ceiling=Math.min(maxMs,baseMs*Math.pow(2,Math.max(0,attempt-1)));
  return Math.round(ceiling*(0.75+Math.random()*0.25));
}

export async function resilientRead(key,reader,{signal,maxAttempts=3,deferOffline=false,offlineWaitMs=8000}={}){
  const k=String(key||'read');
  const controller=new AbortController();
  const external=signal;
  const relay=()=>controller.abort();
  if(external?.aborted)controller.abort();
  else external?.addEventListener?.('abort',relay,{once:true});
  const previous=readControllers.get(k);
  if(previous){previous.abort();state.cancelled++;state.races++;emit();}
  readControllers.set(k,controller);state.reads++;emit();
  try{
    let lastError;
    for(let attempt=1;attempt<=Math.max(1,maxAttempts);attempt++){
      if(isNetworkOffline()){
        if(!deferOffline)throw Object.assign(new Error("Network unavailable"),{name:"NetworkOfflineError"});
        state.offlineDeferred++;emit();
        try{await waitForOnline({signal:controller.signal,maxWaitMs:offlineWaitMs});}catch(error){if(isAbortError(error)){state.cancelled++;noteNetworkCancellation();emit();}else{state.failed++;noteNetworkFailure();emit();}throw error;}
      }
      if(controller.signal.aborted)throw Object.assign(new Error('Read cancelled'),{name:'AbortError'});
      try{
        const result=await reader(controller.signal,attempt);
        if(result?.response&&!result.response.ok&&isRetryableReadFailure(null,result.response)){
          const error=Object.assign(new Error(`HTTP_${result.response.status}`),{status:result.response.status,response:result.response});
          if(attempt<maxAttempts){state.retries++;emit();await sleep(retryDelay(attempt),controller.signal);continue;}
          state.failed++;emit();return result;
        }
        if(attempt>1){state.recovered++;emit();}
        return result;
      }catch(error){
        if(isAbortError(error)){state.cancelled++;noteNetworkCancellation();emit();throw error;}
        lastError=error;
        if(attempt>=maxAttempts||!isRetryableReadFailure(error,error?.response)){state.failed++;emit();throw error;}
        state.retries++;emit();await sleep(retryDelay(attempt),controller.signal);
      }
    }
    throw lastError||new Error('Read failed');
  }finally{
    external?.removeEventListener?.('abort',relay);
    if(readControllers.get(k)===controller)readControllers.delete(k);
  }
}

export function reconcileRefresh(key,work){
  const k=String(key||'refresh');
  const previous=refreshIntents.get(k);
  if(previous)return previous;
  const pending=Promise.resolve().then(work).finally(()=>{if(refreshIntents.get(k)===pending)refreshIntents.delete(k);});
  refreshIntents.set(k,pending);state.coalesced++;
  return pending;
}

export function withMutationLock(key,work){
  const k=String(key||'mutation');
  const existing=mutationLocks.get(k);
  if(existing)return existing;
  const pending=Promise.resolve().then(work).finally(()=>{if(mutationLocks.get(k)===pending)mutationLocks.delete(k);});
  mutationLocks.set(k,pending);
  return pending;
}

export function resilienceSnapshot(){return Object.freeze({...state});}
