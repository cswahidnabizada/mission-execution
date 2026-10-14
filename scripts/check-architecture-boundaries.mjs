import fs from "node:fs";
import path from "node:path";

const root=process.cwd();
const worker=path.join(root,"src","worker");
const js=[];
function walk(dir){for(const name of fs.readdirSync(dir)){const p=path.join(dir,name);const st=fs.statSync(p);if(st.isDirectory())walk(p);else if(name.endsWith(".js"))js.push(p);}}
walk(worker);
const rel=p=>path.relative(root,p).replaceAll(path.sep,"/");
const graph=new Map(js.map(p=>[p,[]]));
const importRe=/(?:from\s+|import\s*\(\s*)["'](\.[^"']+)["']/g;
for(const p of js){const text=fs.readFileSync(p,"utf8");for(const m of text.matchAll(importRe)){let q=path.normalize(path.join(path.dirname(p),m[1]));if(!q.endsWith(".js"))q+=".js";if(graph.has(q))graph.get(p).push(q);}}

const violations=[];
const frozenCompatibilityFiles=new Set([
  "src/worker/modules/missions/status-transition.repository.js",
  "src/worker/modules/transitions/execution-transition.service.js",
  "src/worker/repositories/network.repository.js"
]);
const frozenStatusFiles=new Set([
  "src/worker/modules/missions/status-transition.repository.js",
  "src/worker/repositories/mission.repository.js"
]);
for(const [p,imports] of graph){const r=rel(p);for(const q of imports){const iq=rel(q);if((r.startsWith("src/worker/core/")||r.startsWith("src/worker/security/"))&&(iq.startsWith("src/worker/modules/")||iq.startsWith("src/worker/extensions/"))){violations.push(`${r} imports higher-level domain code ${iq}`);}if(r.startsWith("src/worker/repositories/")&&(iq.startsWith("src/worker/modules/")||iq.startsWith("src/worker/extensions/"))&&!frozenCompatibilityFiles.has(r)){violations.push(`${r} imports higher-level domain code ${iq}`);}}}

const statusWriteRe=/UPDATE\s+missions\s+SET\s+status\s*=|INSERT\s+INTO\s+mission_status_history\s*\(/i;
const statusWrites=[];
for(const p of js){const r=rel(p),text=fs.readFileSync(p,"utf8");if(statusWriteRe.test(text))statusWrites.push(r);}
const unexpectedStatus=statusWrites.filter(r=>!r.includes("modules/transitions/mission-transition.service.js")&&!r.includes("modules/missions/missions.service.js")&&!frozenStatusFiles.has(r));
if(unexpectedStatus.length)violations.push(`non-canonical mission status mutation path(s): ${unexpectedStatus.join(", ")}`);

// cycle detection
const state=new Map(),stack=[],cycles=[];
function dfs(v){state.set(v,1);stack.push(v);for(const w of graph.get(v)||[]){if(state.get(w)===1){const i=stack.indexOf(w);cycles.push(stack.slice(i).concat(w).map(rel).join(" -> "));}else if(!state.get(w))dfs(w);}stack.pop();state.set(v,2);}
for(const p of js)if(!state.get(p))dfs(p);
if(cycles.length)violations.push(`import cycle(s): ${cycles.slice(0,5).join(" | ")}`);

const frozenStatusPaths=statusWrites.filter(r=>frozenStatusFiles.has(r)).length;
const metrics={files:js.length,edges:[...graph.values()].reduce((n,v)=>n+v.length,0),cycles:cycles.length,statusWritePaths:statusWrites.length,frozenStatusPaths};
console.log(`Architecture boundaries: ${metrics.files} JS files, ${metrics.edges} local imports, ${metrics.cycles} cycles`);
console.log(`Mission lifecycle write paths: ${metrics.statusWritePaths} detected; ${metrics.frozenStatusPaths} frozen compatibility path(s)`);
if(statusWrites.length)for(const r of statusWrites)console.log(`- lifecycle write: ${r}${frozenStatusFiles.has(r)?" [FROZEN]":" [CANONICAL]"}`);
if(violations.length){console.error("ARCHITECTURE BOUNDARY CHECK FAILED");for(const v of violations)console.error(`- ${v}`);process.exit(1);}
console.log("Architecture boundaries OK");
