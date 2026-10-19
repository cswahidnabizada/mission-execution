function stable(value){
  if(Array.isArray(value))return `[${value.map(stable).join(',')}]`;
  if(value&&typeof value==='object')return `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${stable(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
function fingerprint(value){let h1=0x811c9dc5;for(const ch of stable(value)){h1^=ch.charCodeAt(0);h1=Math.imul(h1,0x01000193)>>>0;}return `fnv1a32-${h1.toString(16).padStart(8,'0')}`;}
function outcomeProjection(run){return {status:run.status,recoveryStatus:run.recoveryStatus,simulatedDurationMinutes:run.simulatedDurationMinutes,checksPassed:run.checksPassed,journey:(run.journey||[]).map(x=>({stage:x.stage,status:x.status,detail:x.detail})),evidence:(run.evidence||[]).map(x=>({classification:x.classification,detail:x.detail})),outcomeComparison:run.outcomeComparison,plan:run.simulationPlan};}
export {fingerprint,outcomeProjection};
