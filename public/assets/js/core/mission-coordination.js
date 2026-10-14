import {api} from "./api.js";

export async function fetchMissionCoordination(missionId){
  const d=await api(`/api/engine-coordinator/missions/${Number(missionId)}`);
  const coordination=d.coordination||null;
  return Object.freeze({
    stateToken:d.stateToken||coordination?.stateToken||null,
    truth:d.truth||coordination?.truth||null,
    surface:d.surface||coordination?.surface||null,
    coordination,
    problems:Object.freeze([...(d.problems||[])])
  });
}

export function coordinationParts(bundle){
  const c=bundle?.coordination||bundle||{};
  return Object.freeze({
    truth:c.truth||null,
    flow:c.flow||null,
    execution:c.execution||null,
    assignment:c.assignment||null,
    management:c.management||null,
    actions:c.actions||null,
    unified:c.unified||null,
    liveness:c.liveness||null,
    surface:c.surface||bundle?.surface||null,
    problems:Object.freeze([...(bundle?.problems||c.problems||[])])
  });
}

export function operatingPrimary(bundle){
  const p=coordinationParts(bundle);
  return p.surface?.primary||p.unified?.primary||null;
}
export function operatingWaiting(bundle){
  const p=coordinationParts(bundle);
  return p.surface?.waiting||p.unified?.waiting||null;
}
