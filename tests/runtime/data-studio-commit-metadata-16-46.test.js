import fs from 'node:fs';
const service=fs.readFileSync('src/worker/security/platform-data-studio.service.js','utf8');
const ui=fs.readFileSync('public/assets/js/frontend/admin/data-studio.js','utf8');
if(!service.includes("if(!canonicalRecord||typeof canonicalRecord!=='object')throw fail('DATA_STUDIO_CANONICAL_RECORD_UNAVAILABLE',503,'DATA_STUDIO_CANONICAL_RECORD_UNAVAILABLE')"))throw Error('commit must guard missing canonical record');
if(!service.includes('canonicalRecord.updated_at??canonicalRecord.updatedAt??current?.record?.updatedAt??current?.record?.updated_at'))throw Error('commit must normalize canonical update timestamp aliases');
if(!ui.includes('current?.record?.record?.updated_at??current?.record?.record?.updatedAt??current?.record?.updatedAt??null'))throw Error('UI must safely pass expected update timestamp');
if(!ui.includes("draft?.entry?.validation?.valid===true"))throw Error('commit validation guard missing');
console.log('PASS Data Studio commit metadata guard and timestamp normalization');
