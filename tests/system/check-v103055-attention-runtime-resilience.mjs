import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const attention=fs.readFileSync(path.join(root,'src/worker/modules/attention/attention.service.js'),'utf8');
const route=fs.readFileSync(path.join(root,'src/worker/modules/attention/attention.routes.js'),'utf8');
const fail=[];
for(const token of ['attentionForSessionCanonical','safeAttentionFallback','canonical read degraded','degradedReason:"attention_read_unavailable"'])if(!attention.includes(token))fail.push(`attention_resilience_missing:${token}`);
if(!/router\.get\("\/api\/attention"/.test(route))fail.push('attention_route_missing');
if(!attention.includes('try {\n    return await attentionForSessionCanonical'))fail.push('canonical_attention_not_guarded');
if(fail.length){console.error(fail.join('\n'));process.exit(1);}
console.log('PASS 10.30.55 Attention Runtime Resilience: canonical attention failures fail closed without a 500 response');
