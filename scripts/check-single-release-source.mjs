import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const version=fs.readFileSync(path.join(root,'VERSION'),'utf8').trim();
const rootReleaseDocs=fs.readdirSync(root).filter(x=>/^RELEASE-\d+\.\d+\.\d+\.md$/.test(x));
if(!fs.existsSync(path.join(root,'RELEASE.md')))throw new Error('Canonical RELEASE.md is missing.');
if(rootReleaseDocs.length)throw new Error(`Versioned root release documents are forbidden: ${rootReleaseDocs.join(', ')}`);
const manifest=JSON.parse(fs.readFileSync(path.join(root,'RELEASE-MANIFEST.json'),'utf8'));
if(manifest.version!==version||manifest.release!=='RELEASE.md')throw new Error('Release manifest does not point to VERSION and canonical RELEASE.md.');
const generatedWorker=fs.readFileSync(path.join(root,'src/worker/core/release.js'),'utf8');
const generatedBrowser=fs.readFileSync(path.join(root,'public/assets/js/core/release.js'),'utf8');
if(!generatedWorker.includes(`RELEASE_VERSION=${JSON.stringify(version)}`)||!generatedBrowser.includes(`RELEASE_VERSION=${JSON.stringify(version)}`))throw new Error('Generated runtime release identity does not match VERSION. Run npm run build.');
const stale=[];
for(const dir of ['public','src/worker']){
  for(const f of walk(path.join(root,dir))){
    if(!/\.(html|css|js|mjs)$/.test(f))continue;
    const text=fs.readFileSync(f,'utf8');
    const matches=[...text.matchAll(/\?v=(10\.\d+\.\d+)/g)].map(m=>m[1]);
    for(const v of matches)if(v!==version)stale.push(`${path.relative(root,f)} -> ?v=${v}`);
  }
}
if(stale.length){console.error('Stale runtime asset versions:');stale.slice(0,100).forEach(x=>console.error(`- ${x}`));process.exit(1);}
const staleRuntime=[];
const stripComments=(text)=>text.replace(/\/\*[\s\S]*?\*\//g,'').replace(/(^|\n)\s*\/\/.*(?=\n|$)/g,'$1');
for(const dir of ['src/worker','public']){
  for(const f of walk(path.join(root,dir))){
    if(!/\.(html|css|js|mjs)$/.test(f))continue;
    if(f.endsWith('src/worker/core/release.js')||f.endsWith('public/assets/js/core/release.js'))continue;
    const text=stripComments(fs.readFileSync(f,'utf8'));
    for(const m of text.matchAll(/(?:['\"]|`)(10\.\d+\.\d+)(?:['\"]|`)/g)){
      if(m[1]!==version)staleRuntime.push(`${path.relative(root,f)} -> ${m[1]}`);
    }
  }
}
if(staleRuntime.length){console.error('Stale runtime semantic release literals remain:');staleRuntime.slice(0,100).forEach(x=>console.error(`- ${x}`));process.exit(1);}
const hardcoded=[];
for(const dir of ['src/worker','public']){
  for(const f of walk(path.join(root,dir))){
    if(!/\.(html|css|js|mjs)$/.test(f))continue;
    if(f.endsWith('src/worker/core/release.js')||f.endsWith('public/assets/js/core/release.js'))continue;
    const text=fs.readFileSync(f,'utf8');
    for(const [i,line] of text.split('\n').entries()){
      if(/\bversion\s*:\s*['\"]10\.\d+\.\d+['\"]/.test(line)||/export const \w*VERSION\s*=\s*['\"]10\./.test(line))hardcoded.push(`${path.relative(root,f)}:${i+1}`);
    }
  }
}
if(hardcoded.length){console.error('Hardcoded runtime semantic versions remain:');hardcoded.slice(0,100).forEach(x=>console.error(`- ${x}`));process.exit(1);}
console.log(`Single semantic release source gate: PASS (${version})`);
function* walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())yield* walk(p);else yield p;}}
