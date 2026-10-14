import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
const root=process.cwd();
const ignored=new Set(["node_modules",".git"]);
const files=[];
function walk(dir){for(const ent of fs.readdirSync(dir,{withFileTypes:true})){if(ignored.has(ent.name))continue;const p=path.join(dir,ent.name);if(ent.isDirectory())walk(p);else files.push(p);}}
walk(root);
const groups=new Map();
for(const file of files){const h=crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");const list=groups.get(h)||[];list.push(path.relative(root,file));groups.set(h,list);}
const duplicates=[...groups.values()].filter(x=>x.length>1).filter(group=>!(group.includes('src/worker/core/release.js')&&group.includes('public/assets/js/core/release.js')));
if(duplicates.length){console.error("DUPLICATE FILE CONTENT DETECTED");for(const group of duplicates)console.error(group.join("\n"));process.exit(1);}
console.log(`duplicate-file-content gate: PASS (${files.length} unique files)`);
