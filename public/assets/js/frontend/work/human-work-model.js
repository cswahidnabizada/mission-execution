import {api} from '../core/api.js';
import {normalizeHumanWorkItem} from './human-work-contract.js';

const TERMINAL=new Set(['Completed','Cancelled','Canceled']);
const text=v=>String(v??'').trim();
const num=v=>Number(v||0);
const missionId=x=>num(x?.missionId||x?.mission_id||x?.id);
const reference=x=>text(x?.reference||`Mission ${missionId(x)}`);
const lower=v=>text(v).toLowerCase();

function reasonOf(item){
  const first=Array.isArray(item?.reasons)?item.reasons[0]:null;
  return first?{code:text(first.code),label:text(first.label),icon:text(first.icon)}:{code:'',label:'',icon:''};
}

function classifyAttention(item){
  const reason=reasonOf(item);
  const hay=lower(`${reason.code} ${reason.label} ${item?.status||''}`);
  if(/waiting|awaiting|pending/.test(hay))return 'waiting';
  if(String(item?.level||'').toLowerCase()==='critical')return 'urgent';
  if(String(item?.level||'').toLowerCase()==='attention')return 'attention';
  return 'watch';
}

function missionFallback(m){
  const status=text(m?.status||'Pending');
  if(TERMINAL.has(status))return 'done';
  if(/pending/i.test(status))return 'waiting';
  return 'working';
}

function dedupe(rows){
  const map=new Map();
  for(const row of rows){const id=missionId(row);if(!id)continue;if(!map.has(id))map.set(id,row);}
  return [...map.values()];
}

export async function loadHumanWork({limit=50}={}){
  const bounded=Math.min(Math.max(Number(limit)||30,10),50);
  const [attentionResult,missionsResult]=await Promise.allSettled([
    api(`/api/attention?limit=${Math.min(bounded,50)}`,{cache:'no-store'}),
    api(`/api/missions?limit=${bounded}&projection=mission-role-queue`,{cache:'no-store'})
  ]);
  const attention=attentionResult.status==='fulfilled'?attentionResult.value||{}:null;
  const missionsPayload=missionsResult.status==='fulfilled'?missionsResult.value||{}:null;
  const attentionItems=Array.isArray(attention?.items)?attention.items:[];
  const missions=Array.isArray(missionsPayload?.missions)?missionsPayload.missions:[];
  const attentionByMission=new Map();
  for(const item of attentionItems){const id=missionId(item);if(id&&!attentionByMission.has(id))attentionByMission.set(id,item);}
  const focus=attention?.focus||null;
  const focusId=num(focus?.missionId);
  const rows=missions.map(m=>{
    const id=missionId(m),a=attentionByMission.get(id),reason=reasonOf(a);
    return {
      id,reference:reference(m),status:text(m?.status||'Pending'),stateVersion:num(m?.state_version)||null,
      pickup:text(m?.pickup_city),delivery:text(m?.delivery_city),updatedAt:m?.updated_at||m?.created_at||null,
      deadlineAt:m?.deadline_at_utc||null,attention:a||null,
      workState:a?classifyAttention(a):missionFallback(m),
      level:text(a?.level||''),score:num(a?.score),reasonCode:reason.code,reason:reason.label,
      link:a?.link||`/app#work?mission=${id}`,
      hasAttention:Boolean(a),
      type:'mission', sourceAuthority:'mission',
      situation:text(a?.statusLabel||m?.status||'Active'),
      responsibility:text(a?.responsibility||m?.responsibility||''),
      priority:{level:text(a?.level||'watch')||'watch',score:num(a?.score)},
      availableAction:{id:'open_mission_workspace',label:'Open work',href:a?.link||`/app#work?mission=${id}`,enabled:true},
      waitingCondition:/waiting|awaiting|pending/i.test(`${a?.status||''} ${reason.label}`)?{active:true,code:reason.code,label:reason.label||'Waiting for a defined dependency.'}:null,
      evidence:[{type:'mission-state',label:`Mission state ${num(m?.state_version)||'current'}`,href:null}],
      nextState:{code:text(m?.status||'Active'),label:text(m?.status||'Active')},
      context:{type:'mission',id:String(id),reference:reference(m),href:a?.link||`/app#work?mission=${id}`,details:{pickup:text(m?.pickup_city),delivery:text(m?.delivery_city)}}
    };
  });
  const attentionOnly=attentionItems.filter(x=>missionId(x)&&!rows.some(r=>r.id===missionId(x))).map(x=>({
    id:missionId(x),reference:reference(x),status:text(x?.status||'Active'),pickup:'',delivery:'',updatedAt:x?.updatedAt||null,
    deadlineAt:x?.deadlineAtUtc||null,attention:x,workState:classifyAttention(x),level:text(x?.level||''),score:num(x?.score),
    reasonCode:reasonOf(x).code,reason:reasonOf(x).label,link:x?.link||`/app#work?mission=${missionId(x)}`,hasAttention:true,
    type:'mission',sourceAuthority:'attention',situation:text(x?.status||'Active'),responsibility:text(x?.responsibility||''),
    priority:{level:text(x?.level||'attention')||'attention',score:num(x?.score)},
    availableAction:{id:'open_mission_workspace',label:'Open work',href:x?.link||`/app#work?mission=${missionId(x)}`,enabled:true},
    waitingCondition:/waiting|awaiting|pending/i.test(`${x?.status||''} ${reasonOf(x).label}`)?{active:true,code:reasonOf(x).code,label:reasonOf(x).label||'Waiting for a defined dependency.'}:null,
    evidence:[{type:'attention-signal',label:'Canonical attention signal',href:null}],
    nextState:{code:text(x?.status||'Active'),label:text(x?.status||'Active')},
    context:{type:'mission',id:String(missionId(x)),reference:reference(x),href:x?.link||`/app#work?mission=${missionId(x)}`,details:{pickup:'',delivery:''}}
  }));
  const all=dedupe([...rows,...attentionOnly]).map(item=>normalizeHumanWorkItem(item,{contextType:'mission'}));
  const by=s=>all.filter(x=>x.state===s).sort((a,b)=>b.priority.score-a.priority.score||Date.parse(b.updatedAt||0)-Date.parse(a.updatedAt||0));
  const urgent=by('urgent'),attentionRows=by('attention'),waiting=by('waiting'),watch=by('watch'),working=by('working');
  const active=all.filter(x=>!TERMINAL.has(x.status));
  const done=all.filter(x=>TERMINAL.has(x.status));
  return {
    ready:Boolean(attentionResult.status==='fulfilled'||missionsResult.status==='fulfilled'),
    degraded:attentionResult.status!=='fulfilled'||missionsResult.status!=='fulfilled',
    attention:attentionItems,summary:attention?.summary||{critical:0,attention:0,watch:0,total:0},focus,
    rows:all,urgent,attentionRows,waiting,watch,working,done,active,
    counts:{urgent:urgent.length,attention:attentionRows.length,waiting:waiting.length,watch:watch.length,working:working.length,done:done.length,active:active.length},
    errors:{attention:attentionResult.status==='rejected'?attentionResult.reason:null,missions:missionsResult.status==='rejected'?missionsResult.reason:null}
  };
}

export function focusMission(model){
  const id=num(model?.focus?.missionId);
  if(id){return model.rows.find(x=>x.id===String(id)||x.id===id)||normalizeHumanWorkItem({id,reference:text(model.focus.reference)||`Mission ${id}`,reason:text(model.focus.reason),workState:'urgent',sourceAuthority:'attention',availableAction:{id:'open_mission_workspace',label:'Open work',href:`/app#work?mission=${id}`}});}
  return model?.urgent?.[0]||model?.attentionRows?.[0]||model?.watch?.[0]||model?.working?.[0]||null;
}
