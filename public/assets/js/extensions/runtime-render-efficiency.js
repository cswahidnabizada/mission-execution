/* ON Mission 10.35.5 — Canonical render/interaction efficiency.
 * Presentation-only: no authority, lifecycle, authorization, custody or truth writes.
 */
const signatures=new WeakMap();
const intelligenceCache=new Map();
const bound=new WeakMap();
const metrics={renders:0,skipped:0,interactions:0,abortedReads:0,racesPrevented:0,intelligenceHits:0,intelligenceMisses:0};

function stable(value,seen=new WeakSet()){
  if(value===null||typeof value!=="object")return String(value);
  if(seen.has(value))return "[cycle]";
  seen.add(value);
  if(Array.isArray(value))return `[${value.map(v=>stable(v,seen)).join(",")}]`;
  return `{${Object.keys(value).sort().map(k=>`${k}:${stable(value[k],seen)}`).join("|")}}`;
}
export function stateSignature(value){return stable(value);}
export function renderIfChanged(host,signature,render){
  if(!host)return false;
  const next=String(signature||"");
  if(signatures.get(host)===next){metrics.skipped++;return false;}
  const start=performance.now();
  render();
  signatures.set(host,next);metrics.renders++;
  const duration=performance.now()-start;
  try{host.dataset.renderDurationMs=String(Math.round(duration*10)/10);}catch{}
  window.dispatchEvent(new CustomEvent("onmission:runtime-performance",{detail:{type:"render",durationMs:duration,signatureLength:next.length}}));
  return true;
}
export function bindOnce(target,key,handler,options){
  if(!target)return false;
  let keys=bound.get(target);if(!keys){keys=new Set();bound.set(target,keys);}
  const k=String(key);if(keys.has(k))return false;target.addEventListener("click",handler,options);keys.add(k);return true;
}
export function interaction(){metrics.interactions++;}
export function memoizePure(key,input,compute){
  const k=String(key||"")+"::"+stable(input);
  if(intelligenceCache.has(k)){metrics.intelligenceHits++;return intelligenceCache.get(k);}
  metrics.intelligenceMisses++;
  const value=compute();intelligenceCache.set(k,value);
  if(intelligenceCache.size>32)intelligenceCache.delete(intelligenceCache.keys().next().value);
  return value;
}
export function runtimeEfficiencySnapshot(){return Object.freeze({...metrics});}
