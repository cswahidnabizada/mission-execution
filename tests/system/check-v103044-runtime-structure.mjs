import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const publicRoot=path.join(root,'public');
const failures=[];
const exists=p=>fs.existsSync(p) && fs.statSync(p).isFile();
const read=p=>fs.readFileSync(p,'utf8');
const stripQuery=x=>String(x).split(/[?#]/,1)[0];
const resolveBrowserRef=(from,ref)=>{
  const clean=stripQuery(ref);
  if(clean.startsWith('/')) return path.join(publicRoot,clean.slice(1));
  return path.resolve(path.dirname(from),clean);
};
const jsImportRe=/(?:import\s+(?:[^;]*?\s+from\s+)?|import\s*)["']([^"']+)["']/g;
const scriptRe=/<script[^>]+src=["']([^"']+)["']/gi;
const linkRe=/<link[^>]+href=["']([^"']+)["']/gi;

function checkJsGraph(entry){
  const queue=[entry],seen=new Set();
  while(queue.length){
    const file=queue.pop();
    if(seen.has(file)) continue;
    seen.add(file);
    if(!exists(file)){failures.push(`missing active runtime file: ${path.relative(root,file)}`);continue;}
    const text=read(file); let m;
    jsImportRe.lastIndex=0;
    while((m=jsImportRe.exec(text))){
      const ref=m[1];
      if(!ref.startsWith('.')) continue;
      const target=resolveBrowserRef(file,ref);
      if(!exists(target)) failures.push(`missing active JS import: ${path.relative(root,file)} -> ${ref}`);
      else if(/\.m?js$/.test(target)) queue.push(target);
    }
  }
}

const admin=path.join(publicRoot,'admin.html');
const html=read(admin);
for(const re of [scriptRe,linkRe]){
  re.lastIndex=0; let m;
  while((m=re.exec(html))){
    const ref=stripQuery(m[1]);
    if(!ref.startsWith('/')) continue;
    const target=resolveBrowserRef(admin,ref);
    if(!exists(target) && !ref.endsWith('.html')) failures.push(`missing active HTML asset: public/admin.html -> ${ref}`);
    if(exists(target) && /\.m?js$/.test(target)) checkJsGraph(target);
  }
}

const dashboard=path.join(publicRoot,'assets/js/extensions/dashboard-experience-103056.js');
const action=path.join(publicRoot,'assets/js/extensions/canonical-action-experience-103043.js');
if(!exists(dashboard)) failures.push('10.30.43 dashboard runtime is missing');
if(!exists(action)) failures.push('10.30.43 canonical action bridge is missing');
if(exists(dashboard) && !read(dashboard).includes('./canonical-action-experience-103043.js')) failures.push('10.30.43 dashboard does not point to its canonical action bridge');
if(exists(action) && !read(action).includes('hasCanonicalAction')) failures.push('10.30.43 canonical action bridge is not backed by the canonical Action Registry');
if(html.includes('dashboard-experience-103042.js')) failures.push('10.30.42 dashboard remains active');
if(html.includes('canonical-action-experience-103042.js')) failures.push('10.30.42 canonical action bridge remains active');

if(failures.length){
  console.error('FAIL 10.30.44 Runtime Structure Integrity');
  for(const f of [...new Set(failures)]) console.error(`- ${f}`);
  process.exit(1);
}
console.log('PASS 10.30.44 Runtime Structure Integrity: active HTML assets and reachable JS import graph are complete');
