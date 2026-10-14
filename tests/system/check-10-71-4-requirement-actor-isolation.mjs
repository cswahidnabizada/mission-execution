import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const repo=fs.readFileSync(path.join(root,'src/worker/extensions/mission-management/requirements/management-requirement.repository.js'),'utf8');
const service=fs.readFileSync(path.join(root,'src/worker/extensions/mission-management/management-intent.service.js'),'utf8');
const routes=fs.readFileSync(path.join(root,'src/worker/extensions/mission-management/mission-management.routes.js'),'utf8');

function assert(condition,message){if(!condition)throw new Error(message);}

assert(/requested_actor_type=\? AND COALESCE\(requested_actor_id,0\)=COALESCE\(\?,0\)/.test(repo), 'Requirement resolution must be bound to the requested actor type and id.');
assert(/if\(Number\(result\.meta\?\.changes\|\|0\)!==1\)throw requirementResolutionDenied\(\)/.test(repo), 'Actor mismatch must fail closed when the guarded UPDATE changes zero rows.');
assert(/code='REQUIREMENT_ACTOR_MISMATCH'/.test(repo), 'Requirement actor mismatch needs a stable machine-readable error code.');
assert(/function managementActor\(session\)/.test(service), 'Management intents must derive the canonical acting executor/driver identity.');
assert(/if\(!actor\)throw make\("Only the assigned executor or driver can complete this operational requirement",403\)/.test(service), 'Operational completion intents must reject non-operational actors.');
assert(/actorType:actor\.type,actorId:actor\.id/.test(service), 'Operational requirement completion must pass actor identity into the canonical resolver.');
assert(/guardedMissionMutation/.test(routes), 'Requirement completion must remain behind the canonical mutation fence.');
assert(!/resolveRequirement\(env,tenantId,missionId,reqId,\{role:session\.role,identityId:identityId\(session\)\}\)/.test(service), 'Unscoped requirement resolution must not remain in the management intent service.');

console.log('10.71.4 requirement actor-isolation certification: PASS');
console.log('Operational requirements are now actor-bound, fail-closed, and protected by the canonical mutation fence.');
