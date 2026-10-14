import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const fail=[];
const idem=read('src/worker/security/idempotency.js');
const routes=read('src/worker/modules/missions/missions.routes.js');
const service=read('src/worker/modules/missions/missions.service.js');
const schema=read('database/schema.current.sql');
const migration=read('database/migrations/0120_idempotency_resource_reference.sql');

for(const [name,text,tokens] of [
 ['idempotency',idem,['resource_reference','bindIdempotencyReference','resource_id,resource_reference']],
 ['mission route',routes,['missionRepo.findMissionByReference','reconciled:true','createMission(env, session, data,{scopeKey,actionKey:"mission-create",key:idempotencyKey})']],
 ['mission service',service,['bindIdempotencyReference','resourceReference:reference']],
 ['schema',schema,['resource_reference TEXT','idx_request_idempotency_resource_reference']],
 ['migration',migration,['ALTER TABLE request_idempotency ADD COLUMN resource_reference TEXT','CREATE INDEX IF NOT EXISTS idx_request_idempotency_resource_reference']]
]) for(const token of tokens) if(!text.includes(token)) fail.push(`${name}: missing ${token}`);
if(/if\(idempotencyKey\)await releaseIdempotency\(env,\{scopeKey,actionKey:"mission-create",key:idempotencyKey\}\);/.test(routes) && !routes.includes('finalizeIdempotency')) fail.push('mission create has no idempotency finalization');
if(/claim\.resourceReference/.test(routes)===false) fail.push('retry reconciliation does not consume resource reference');
if(/DELETE\s+FROM\s+request_idempotency[\s\S]*resource_id\s+IS\s+NULL/.test(idem)===false) fail.push('idempotency release safety contract changed unexpectedly');
console.log(`Wave G idempotency recovery gate: ${fail.length?'FAIL':'PASS'} (${5} connected layers)`);
if(fail.length){for(const x of fail)console.error(` - ${x}`);process.exit(1)}
