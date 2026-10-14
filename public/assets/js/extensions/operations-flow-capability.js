const CONTINUOUS_FLOW_SOURCES=Object.freeze([
  "queue","mission","decision","action","truth","next-work","focus","assignment",
  "custody","network","navigation","inspect","search","notification","mission-tv"
]);

export function createContinuousFlowCapability({state,sortQueue,operationalAction,status,selectItem,n}={}){
  const num=n||((v)=>Number(v||0));
  const flowSource=value=>{const v=String(value||"queue").toLowerCase();return CONTINUOUS_FLOW_SOURCES.includes(v)?v:"queue";};
  const activate=(source,item)=>{
    state.continuousFlow.active=true;
    state.continuousFlow.source=flowSource(source);
    state.continuousFlow.currentMissionId=num(item?.missionId||0);
    state.continuousFlow.nextMissionId=0;
  };
  const clear=()=>{state.continuousFlow.pendingAdvance=false;state.continuousFlow.advancing=false;state.continuousFlow.nextMissionId=0;};
  const needsPrimaryAction=item=>Boolean(operationalAction(item)?.primary?.code);
  const nextWork=currentMissionId=>{
    const ordered=sortQueue(state.primary||[]);
    return ordered.filter(x=>{
      const id=num(x?.missionId);
      if(!id||id===num(currentMissionId))return false;
      if(["completed","complete","delivered","closed","cancelled","canceled"].includes(String(x?.status||x?.missionStatus||"").toLowerCase()))return false;
      const waiting=/waiting|awaiting|pending/i.test(`${x?.status||""} ${x?.subtitle||""} ${x?.reason||""}`);
      return !waiting&&(x?.actionable!==false||String(x?.priorityLevel||"").toLowerCase()==="critical"||x?.queueRisk);
    })[0]||null;
  };
  const continueFlow=async previousMissionId=>{
    if(!state.continuousFlow.active||state.continuousFlow.advancing)return;
    const current=state.selected;
    if(current&&num(current.missionId)===num(previousMissionId)&&needsPrimaryAction(current)){
      clear();state.continuousFlow.active=true;state.continuousFlow.currentMissionId=num(previousMissionId);return;
    }
    const next=nextWork(previousMissionId);
    if(!next){clear();status("No next work","READY");return;}
    state.continuousFlow.advancing=true;
    state.continuousFlow.nextMissionId=num(next.missionId);
    status(`Next work · ${next.title||`Mission ${next.missionId}`}`,"NEXT");
    await new Promise(resolve=>setTimeout(resolve,260));
    if(!state.continuousFlow.active){clear();return;}
    await selectItem(next,{source:"next-work",continueFlow:true});
    state.continuousFlow.lastActionMissionId=num(previousMissionId);
    clear();
  };
  return Object.freeze({flowSource,activate,clear,needsPrimaryAction,nextWork,continueFlow});
}
