/* ON Mission 10.35.5 — canonical network continuity.
 * Read/presentation continuity only. Never creates or changes operational truth.
 */
const listeners=new Set();
const state={status:globalThis.navigator?.onLine===false?"offline":"online",effectiveType:"unknown",rtt:null,downlink:null,saveData:false,changes:0,reconnects:0,revalidations:0,failures:0,cancelled:0,deferred:0};
let reconnectTimer=0,revalidateGeneration=0;

function connection(){return globalThis.navigator?.connection||globalThis.navigator?.mozConnection||globalThis.navigator?.webkitConnection||null;}
function snapshot(){const c=connection();return Object.freeze({...state,effectiveType:String(c?.effectiveType||state.effectiveType||"unknown"),rtt:Number.isFinite(Number(c?.rtt))?Number(c.rtt):null,downlink:Number.isFinite(Number(c?.downlink))?Number(c.downlink):null,saveData:Boolean(c?.saveData),online:state.status==="online",generation:revalidateGeneration});}
function emit(type,extra={}){const detail={type,...snapshot(),...extra};try{window.dispatchEvent(new CustomEvent("onmission:runtime-performance",{detail}));window.dispatchEvent(new CustomEvent("onmission:network-state",{detail}));}catch{}listeners.forEach(fn=>{try{fn(detail);}catch{}});}
function update(status,reason){const changed=state.status!==status;state.status=status;if(changed)state.changes++;if(status==="online"&&reason==="reconnect")state.reconnects++;emit(status==="online"?"network_reconnected":"network_changed",{reason});if(status==="online")scheduleRevalidation();}
function scheduleRevalidation(){clearTimeout(reconnectTimer);const generation=++revalidateGeneration;reconnectTimer=setTimeout(()=>{if(state.status!=="online"||generation!==revalidateGeneration)return;state.revalidations++;emit("network_revalidate",{generation});},500);}
function mount(){if(!document.body||document.querySelector("[data-onmission-network-continuity]"))return;const el=document.createElement("div");el.dataset.onmissionNetworkContinuity="1";el.className="onmission-network-continuity";el.setAttribute("role","status");el.setAttribute("aria-live","polite");el.hidden=true;document.body.appendChild(el);render(el);}
function render(el){const s=snapshot();const degraded=s.online&&(s.saveData||["slow-2g","2g"].includes(s.effectiveType));if(s.online&&!degraded){el.hidden=true;el.textContent="";return;}el.hidden=false;el.innerHTML='<strong>Connection unavailable</strong><span>Current screen is preserved. It is not being presented as current while the network is unavailable.</span>'+(s.effectiveType!=="unknown"?`<small>${s.effectiveType.toUpperCase()} · offline</small>`:"");}
export function networkSnapshot(){return snapshot();}
export function isNetworkOnline(){return state.status==="online";}
export function isNetworkOffline(){return !isNetworkOnline();}
export function onNetworkChange(fn){if(typeof fn!=="function")return()=>{};listeners.add(fn);return()=>listeners.delete(fn);}
export function noteNetworkFailure(){state.failures++;emit("network_read_failure");}
export function noteNetworkCancellation(){state.cancelled++;emit("network_read_cancelled");}
export function noteOfflineDeferral(){state.deferred++;emit("network_read_deferred");}
export function waitForOnline({signal,maxWaitMs=8000}={}){
  if(isNetworkOnline())return Promise.resolve(snapshot());
  noteOfflineDeferral();
  return new Promise((resolve,reject)=>{
    const started=Date.now();let timer=0;
    const cleanup=()=>{clearTimeout(timer);off();signal?.removeEventListener?.("abort",abort);};
    const off=onNetworkChange(detail=>{if(detail.online){cleanup();resolve(detail);}});
    const abort=()=>{cleanup();reject(Object.assign(new Error("Read cancelled"),{name:"AbortError"}));};
    if(signal?.aborted)return abort();
    signal?.addEventListener?.("abort",abort,{once:true});
    timer=setTimeout(()=>{cleanup();reject(Object.assign(new Error("Network unavailable"),{name:"NetworkOfflineError",elapsedMs:Date.now()-started}));},Math.max(0,maxWaitMs));
  });
}
function bind(){if(typeof window==="undefined")return;const onOnline=()=>update("online","reconnect"),onOffline=()=>update("offline","offline");window.addEventListener("online",onOnline);window.addEventListener("offline",onOffline);const c=connection();c?.addEventListener?.("change",()=>{emit("network_quality_changed");const el=document.querySelector("[data-onmission-network-continuity]");if(el)render(el);});const initial=snapshot();emit("network_initialized",{reason:initial.online?"initial_online":"initial_offline"});if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",mount,{once:true});else mount();}
bind();
