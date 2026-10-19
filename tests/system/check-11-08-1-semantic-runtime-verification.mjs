import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {semanticRuntimeStatus,semanticMemorySummary,verifySemanticRuntime,AGENT_SEMANTIC_VERSION,AGENT_EMBEDDING_DIMENSIONS} from '../../src/worker/extensions/agentic-layer/agent-semantic-memory.service.js';

const root=process.cwd();
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
assert.ok(['11.08.1','11.09.0','11.10.0','11.11.0','11.12.0','11.13.0','11.14.0','11.15.0','11.16.0','11.17.0','11.18.0','12.0.0','12.0.1','12.1.0','12.2.0','12.3.0','12.4.0','12.4.1','12.5.0','12.5.1','12.5.2','12.5.3','12.6.0','12.7.0','12.8.0','12.9.0','13.0.0','13.1.0','13.2.0','13.3.0','13.4.0','13.5.0','13.6.0','13.7.0','13.8.0','13.9.0','14.0.0','14.2.0','14.3.0','14.4.0','14.5.0','14.6.0','14.7.0','14.8.0','14.9.0','15.0.0','15.0.1','15.1.0','15.2.0','15.3.0','15.5.0','16.0.0','16.2.0','16.4.0','16.5.0','16.6.0','16.7.0','16.8.0','16.9.0','16.9.1','16.9.2','16.9.3','16.9.4','16.10.0','16.10.1','16.10.10','16.10.11','16.10.12','16.10.13','16.10.14','16.10.15','16.10.16','16.10.17','16.10.18','16.10.19','16.10.20','16.10.21','16.10.22','16.10.23','16.10.24','16.10.25','16.10.26','16.10.27','16.10.28','16.10.29','16.10.30','16.10.31','16.10.32','16.10.33','16.10.34','16.10.35','16.10.36','16.10.37','16.10.39','16.10.40','16.10.41','16.10.43','16.10.44','16.10.45','16.10.46','16.10.47','16.10.48','16.10.49','16.10.50','16.10.51','16.10.52','16.10.53','16.10.54','16.10.55','16.10.56','16.10.57','16.10.60','16.10.65','16.10.66','16.10.67','16.10.68','16.10.69','16.10.70','16.10.71','16.10.72','16.10.73','16.10.74','16.10.75','16.10.76','16.10.77','16.10.78'].includes(read('VERSION').trim()));
assert.ok(['11.08.1','11.09.0','11.10.0','11.11.0','11.12.0','11.13.0','11.14.0','11.15.0','11.16.0','11.17.0','11.18.0','12.0.0','12.0.1','12.1.0','12.2.0','12.3.0','12.4.0','12.4.1','12.5.0','12.5.1','12.5.2','12.5.3','12.6.0','12.7.0','12.8.0','12.9.0','13.0.0','13.1.0','13.2.0','13.3.0','13.4.0','13.5.0','13.6.0','13.7.0','13.8.0','13.9.0','14.0.0','14.2.0','14.3.0','14.4.0','14.5.0','14.6.0','14.7.0','14.8.0','14.9.0','15.0.0','15.0.1','15.1.0','15.2.0','15.3.0','15.5.0','16.0.0','16.2.0','16.4.0','16.5.0','16.6.0','16.7.0','16.8.0','16.9.0','16.9.1','16.9.2','16.9.3','16.9.4','16.10.0','16.10.1','16.10.10','16.10.11','16.10.12','16.10.13','16.10.14','16.10.15','16.10.16','16.10.17','16.10.18','16.10.19','16.10.20','16.10.21','16.10.22','16.10.23','16.10.24','16.10.25','16.10.26','16.10.27','16.10.28','16.10.29','16.10.30','16.10.31','16.10.32','16.10.33','16.10.34','16.10.35','16.10.36','16.10.37','16.10.39','16.10.40','16.10.41','16.10.43','16.10.44','16.10.45','16.10.46','16.10.47','16.10.48','16.10.49','16.10.50','16.10.51','16.10.52','16.10.53','16.10.54','16.10.55','16.10.56','16.10.57','16.10.60','16.10.65','16.10.66','16.10.67','16.10.68','16.10.69','16.10.70','16.10.71','16.10.72','16.10.73','16.10.74','16.10.75','16.10.76','16.10.77','16.10.78'].includes(JSON.parse(read('package.json')).version));
const wrangler=read('wrangler.jsonc');
assert.match(wrangler,/"binding":\s*"AI"/);
assert.match(wrangler,/"binding":\s*"AGENT_VECTORIZE"/);
assert.match(wrangler,/"index_name":\s*"onmission-agent-memory"/);
const routes=read('src/worker/extensions/agentic-layer/agentic-control.routes.js');
assert(routes.includes('/api/platform/admin/agentic-control/semantic/verify'));
assert(routes.includes('verifySemanticRuntime'));
assert(routes.includes('semanticMemorySummary'));
const ui=read('public/assets/js/frontend/admin/operating-system.js');
assert(ui.includes('Semantic Runtime'));
assert(ui.includes('/api/platform/admin/agentic-control/semantic/verify'));
assert(ui.includes('VERIFY PROVIDERS'));

const schema=read('database/schema.current.sql');
const db=new DatabaseSync(':memory:');db.exec(schema);
const env={DB:{prepare(sql){const stmt=db.prepare(sql);return {bind(...args){return {run(){return stmt.run(...args);},first(){return stmt.get(...args)||null;},all(){return {results:stmt.all(...args)};}};}}}}};

db.prepare(`INSERT INTO companies(id,name) VALUES(1,'Verification Tenant')`).run();
const status=semanticRuntimeStatus(env);
assert.equal(status.version,AGENT_SEMANTIC_VERSION);
assert.equal(status.enabled,false);
assert.equal(status.retrievalIsAdvisory,true);
assert.equal(status.canonicalRevalidationRequired,true);
const summary=await semanticMemorySummary(env);
assert.deepEqual(summary,{totalDocuments:0,tenantCount:0,indexedDocuments:0,pendingDocuments:0,retryDocuments:0,disabledDocuments:0,lastIndexedAt:null});
const unavailable=await verifySemanticRuntime(env);
assert.equal(unavailable.state,'UNAVAILABLE');
assert.equal(unavailable.healthy,false);
assert.equal(unavailable.checks.tenantIsolation.ok,true);

const mockEnv={...env,AI:{async run(model,input){assert.equal(model,'@cf/baai/bge-base-en-v1.5');assert.equal(input.text.length,1);return {data:[Array(AGENT_EMBEDDING_DIMENSIONS).fill(0.01)]};}},AGENT_VECTORIZE:{async query(vector,options){assert.equal(vector.length,AGENT_EMBEDDING_DIMENSIONS);assert.equal(options.namespace,'company:__platform_health__');assert.equal(options.topK,1);return {matches:[]};}}};
const ready=await verifySemanticRuntime(mockEnv);
assert.equal(ready.state,'READY');
assert.equal(ready.healthy,true);
assert.equal(ready.checks.workersAI.ok,true);
assert.equal(ready.checks.vectorize.ok,true);
assert.equal(ready.checks.vectorize.matches,0);

const badAI={...mockEnv,AI:{async run(){return {data:[Array(384).fill(0.01)]};}}};
const degraded=await verifySemanticRuntime(badAI);
assert.equal(degraded.state,'DEGRADED');
assert.equal(degraded.healthy,false);
assert.equal(degraded.checks.workersAI.ok,false);

const badVector={...mockEnv,AGENT_VECTORIZE:{async query(){throw new Error('provider failure');}}};
const vectorDegraded=await verifySemanticRuntime(badVector);
assert.equal(vectorDegraded.state,'DEGRADED');
assert.equal(vectorDegraded.healthy,false);
assert.equal(vectorDegraded.checks.workersAI.ok,true);
assert.equal(vectorDegraded.checks.vectorize.ok,false);

console.log('11.08.1 semantic runtime verification: PASS (carried forward)');
console.log('Control Plane exposes non-mutating provider verification; semantic retrieval remains advisory and canonical authority remains unchanged.');
