/**
 * Evidence-gated launch supervisor. It selects the next governed action from the
 * canonical Market Factory workbench; it never mutates package, release, or tenant state.
 */
const humanPrefixes = ['legal:', 'content:'];
const humanKeys = new Set(['runtime-certification','mission-journey','publication-recovery']);
const terminal = new Set(['LIVE']);
const nonLaunchable = new Set(['SUSPENDED','RETIRED']);

function taskIsVerified(task) {
  return String(task?.status || '').toUpperCase() === 'COMPLETE' &&
    !String(task?.gate || '').trim() &&
    task?.evidence && typeof task.evidence === 'object' &&
    Object.keys(task.evidence).length > 0;
}
function taskNeedsHuman(task) {
  const key = String(task?.key || '');
  return humanPrefixes.some(prefix => key.startsWith(prefix)) || humanKeys.has(key);
}
function gateForTask(task) {
  if (String(task?.gate || '').trim()) return taskNeedsHuman(task) ? 'HUMAN_INPUT_REQUIRED' : 'BLOCKED';
  if (!taskIsVerified(task)) return taskNeedsHuman(task) ? 'HUMAN_INPUT_REQUIRED' : 'SYSTEM_ACTION_REQUIRED';
  return 'VERIFIED';
}

export function assessControlledMarketLaunch({market = {}, workbench = {}, authorityHealth = {status:'UNKNOWN', unavailable:[]}, runtimeEvidence = null} = {}) {
  const tasks = Array.isArray(workbench.tasks) ? workbench.tasks : [];
  const marketStatus = String(market.status || workbench.marketStatus || 'UNKNOWN').toUpperCase();
  const packageStatus = String(market.packageStatus || workbench.packageStatus || 'UNKNOWN').toUpperCase();
  const unavailable = Array.isArray(authorityHealth.unavailable) ? authorityHealth.unavailable : [];
  const conflicts = Number(workbench.preview?.conflicts?.length || 0);
  const assessedTasks = tasks.map(task => ({key:task.key,title:task.title,status:gateForTask(task),owner:taskNeedsHuman(task)?'Human reviewer / evidence provider':'Canonical launch workflow',reason:String(task.gate || (!taskIsVerified(task) ? 'Required evidence has not yet been verified by the owning authority.' : 'Verified evidence recorded.'))}));
  let status = 'IN_PROGRESS';
  let nextAction = null;
  let stopReason = null;
  if (terminal.has(marketStatus) && packageStatus === 'LIVE') {
    status = 'COMPLETE';
    stopReason = 'The canonical market and package are already LIVE.';
  } else if (nonLaunchable.has(marketStatus)) {
    status = 'BLOCKED';
    stopReason = `Market lifecycle is ${marketStatus}; resolve it through the governed lifecycle before continuing.`;
  } else if (unavailable.length) {
    status = 'WAITING_CANONICAL_AUTHORITY';
    stopReason = 'One or more canonical authorities are unavailable. Unknown state is not treated as ready.';
  } else if (conflicts > 0) {
    status = 'BLOCKED';
    stopReason = 'Canonical reconciliation conflicts must be resolved by their owning authorities.';
  } else {
    const next = tasks.find(task => !taskIsVerified(task));
    if (next) {
      const gate = gateForTask(next);
      nextAction = {taskKey:next.key,title:next.title,owner:taskNeedsHuman(next)?'Human reviewer / evidence provider':'Canonical launch workflow',mode:gate==='HUMAN_INPUT_REQUIRED'?'REQUEST_INPUT_OR_REVIEW':gate==='BLOCKED'?'RESOLVE_BLOCKER':'RUN_GOVERNED_STEP',reason:String(next.gate || 'Continue this task through its canonical authority, then refresh certification.')};
      if (gate === 'BLOCKED') { status='BLOCKED'; stopReason=nextAction.reason; }
      else if (gate === 'HUMAN_INPUT_REQUIRED') status='WAITING_FOR_USER';
      else status='READY_TO_CONTINUE';
    } else {
      const verifiedRuntime = runtimeEvidence?.verified === true && runtimeEvidence?.source && runtimeEvidence?.observedAt;
      if (!verifiedRuntime) {
        status='WAITING_FOR_RUNTIME_EVIDENCE';
        stopReason='All listed workbench tasks appear complete, but fresh independent runtime certification evidence is missing.';
      } else if (!['VERIFIED','PUBLISHED'].includes(packageStatus)) {
        status='READY_FOR_GOVERNED_VALIDATION';
        nextAction={taskKey:'validate-release',title:'Validate the immutable package version',owner:'Market Factory',mode:'RUN_GOVERNED_STEP',reason:'Task evidence is complete; invoke the existing validation lifecycle and respect its blockers.'};
      } else {
        status='WAITING_FOR_AUTHORIZED_RELEASE_TRANSITION';
        stopReason='Release publication, verification, and activation remain separate governed transitions requiring their existing authorization gates.';
      }
    }
  }
  const counts = assessedTasks.reduce((acc,t)=>{acc.total++;acc[t.status]=(acc[t.status]||0)+1;return acc;},{total:0,VERIFIED:0,BLOCKED:0,HUMAN_INPUT_REQUIRED:0,SYSTEM_ACTION_REQUIRED:0});
  return {schemaVersion:1,mode:'CONTROLLED_CONTINUATION',readOnly:true,marketStatus,packageStatus,status,nextAction,stopReason,counts,tasks:assessedTasks,authorityHealth:{status:String(authorityHealth.status||'UNKNOWN'),unavailableCount:unavailable.length},reconciliation:{conflictCount:conflicts,safeToApply:workbench.preview?.safeToApply===true},completionRule:'COMPLETE only when canonical market and package are LIVE; workbench completion or a readiness score alone is insufficient.',assessedAt:new Date().toISOString()};
}
