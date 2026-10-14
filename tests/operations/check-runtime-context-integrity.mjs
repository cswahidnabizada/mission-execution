import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const api=read('public/assets/js/core/api.js');
const runtime=read('public/assets/js/extensions/operations-context-runtime.js');
const controller=read('public/assets/js/extensions/operations-controller.js');
const execution=read('public/assets/js/extensions/operations-action-execution.js');
const admin=read('public/admin.html');
const failures=[];
if(/fetchCanonicalMissionStateToken\(missionId,path\)/.test(api)) failures.push('core API passes undefined path into canonical token resolver');
if(!/fetchCanonicalMissionStateToken\(missionId,url\)/.test(api)) failures.push('core API does not pass request URL into canonical token resolver');
for(const [name,text] of [['runtime',runtime],['controller',controller],['execution',execution]]){
  if(/\?v=10\.18\.(49|50|57)(?:["&])/ .test(text)) failures.push(`${name} contains stale release cache token`);
}
if(/operations-context-runtime\.js\?v=10\.18\.57/.test(admin)) failures.push('admin entrypoint uses stale Operations runtime cache token');
if(failures.length){console.error('FAIL runtime context integrity');for(const x of failures)console.error(`- ${x}`);process.exit(1);}
console.log('PASS runtime context integrity across protected mutation and Operations context graph');
