import {api,jsonOptions} from "../core/api.js";

export async function fetchUnifiedAction(missionId){
  const d=await api(`/api/unified-actions/missions/${Number(missionId)}`);
  return d.surface||null;
}
export async function fetchUnifiedActions(missionIds=[]){
  const ids=[...new Set((missionIds||[]).map(Number).filter(Number.isFinite))].slice(0,25);
  if(!ids.length)return {};
  const d=await api("/api/unified-actions/batch",jsonOptions("POST",{missionIds:ids}));
  return d.actions||{};
}
export function unifiedActionFor(map,missionId){return map?.[Number(missionId)]||map?.[String(Number(missionId))]||null;}
