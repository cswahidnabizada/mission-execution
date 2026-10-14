import fs from 'node:fs';
const runtime=fs.readFileSync('public/assets/js/extensions/operations-context-runtime.js','utf8');
const rootHandlers=(runtime.match(/root\.addEventListener\(["']click["']/g)||[]).length;
const documentGuards=(runtime.match(/document\.addEventListener\(["']click["']/g)||[]).length;
if(rootHandlers!==1) throw new Error(`Operations runtime must have exactly one root click owner; found ${rootHandlers}`);
if(documentGuards!==1) throw new Error(`Operations runtime must have exactly one document interaction guard; found ${documentGuards}`);
if(!runtime.includes('root.addEventListener("click",handleRuntimeClick,true)')) throw new Error('Canonical Operations root click handler missing');
console.log('10.19.13 single Operations application click owner + browser guard contract: PASS');
