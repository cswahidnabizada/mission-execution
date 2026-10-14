import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const vocabulary=read('src/worker/core/canonical-vocabulary.js');
if(!/PLATFORM_TERMS=.*object:"Object"/.test(vocabulary)) throw new Error('canonical Object term missing');
if(/PLATFORM_TERMS=.*cargo:/.test(vocabulary)) throw new Error('Cargo remains in canonical platform vocabulary');
if(!/LEGACY_USER_TERMS=.*cargo:"Cargo"/.test(vocabulary)) throw new Error('legacy Cargo compatibility boundary missing');
if(!/label:"Object".*capability:"logistics".*legacyType:"cargo"/s.test(vocabulary)) throw new Error('Cargo compatibility does not converge to canonical Object');
if(fs.existsSync(path.join(root,'src/worker/extensions/mission-readiness/providers/driver-availability.provider.js'))) throw new Error('orphan driver availability provider remains');
const refs=[];
function walk(dir){for(const name of fs.readdirSync(dir)){const p=path.join(dir,name);if(name==='node_modules'||name==='.git')continue;const st=fs.statSync(p);if(st.isDirectory())walk(p);else if(/\.(js|mjs)$/.test(name)){const s=fs.readFileSync(p,'utf8');if(s.includes('driver-availability.provider'))refs.push(p);}}}
walk(path.join(root,'src'));
if(refs.length) throw new Error(`retired driver availability provider still referenced: ${refs.join(',')}`);
console.log('10.71.4 vocabulary/dead-code convergence: PASS');
