import fs from 'node:fs';
const s=fs.readFileSync('public/assets/js/frontend/admin/data-studio.js','utf8');
if(!s.includes('dataStudioPreviewCommit'))throw Error('preview commit action missing');
if(!s.includes("box.addEventListener('click',event=>{const target=event.target?.closest?.('#dataStudioPreviewCommit')"))throw Error('preview commit delegated binding missing');
if(!s.includes("draft?.entry?.validation?.valid===true"))throw Error('commit is not gated on validation');
if(!s.includes("draft.entry.dependencies?.blockers?.length"))throw Error('commit is not gated on dependencies');
console.log('PASS Data Studio preview commit contract');
