import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const api=fs.readFileSync(path.join(root,'public/assets/js/core/api.js'),'utf8');
if(/fetchCanonicalMissionStateToken\(missionId,path\)/.test(api)){
  console.error('FAIL api protected mutation token resolver references an out-of-scope path variable');
  process.exit(1);
}
if(!/fetchCanonicalMissionStateToken\(missionId,url\)/.test(api)){
  console.error('FAIL api protected mutation token resolver does not pass the request URL');
  process.exit(1);
}
if(!/const path=String\(url\|\|""\)/.test(api)){
  console.error('FAIL protected mission request parser lost its local path normalization');
  process.exit(1);
}
console.log('PASS protected mutation token runtime reference integrity');
