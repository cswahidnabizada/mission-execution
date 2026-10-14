import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const root=process.cwd();
const version=fs.readFileSync(path.join(root,'VERSION'),'utf8').trim();
if(!/^\d+\.\d+\.\d+$/.test(version))throw new Error(`Invalid canonical VERSION: ${version}`);
const worker=`// GENERATED FILE — do not edit. Source: /VERSION\nexport const RELEASE_VERSION=${JSON.stringify(version)};\nexport const RELEASE_CHANNEL='production';\n`;
const browser=`// GENERATED FILE — do not edit. Source: /VERSION\nexport const RELEASE_VERSION=${JSON.stringify(version)};\nexport const RELEASE_CHANNEL='production';\n`;
fs.mkdirSync(path.join(root,'src/worker/core'),{recursive:true});
fs.mkdirSync(path.join(root,'public/assets/js/core'),{recursive:true});
fs.writeFileSync(path.join(root,'src/worker/core/release.js'),worker);
fs.writeFileSync(path.join(root,'public/assets/js/core/release.js'),browser);
// Keep browser cache-busting references on the same canonical release identity.
// This is deliberately part of the deterministic build so a new VERSION cannot
// ship with stale asset URLs from the previous protected baseline.
const versionedRoots=[path.join(root,'public'),path.join(root,'src/worker')];
function* walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())yield* walk(file);else yield file;}}
for(const base of versionedRoots){for(const file of walk(base)){if(!/\.(html|css|js|mjs)$/.test(file))continue;const text=fs.readFileSync(file,'utf8');const next=text.replace(/\?v=\d+\.\d+\.\d+/g,`?v=${version}`);if(next!==text)fs.writeFileSync(file,next);}}
const manifestPath=path.join(root,'RELEASE-MANIFEST.json');
if(fs.existsSync(manifestPath)){
  const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));manifest.version=version;manifest.release='RELEASE.md';const migrations=fs.readdirSync(path.join(root,'database/migrations')).filter(x=>x.endsWith('.sql')).sort();manifest.migrationHighWaterMark=(migrations.at(-1)||'').split('_')[0]||null;manifest.migrationCount=migrations.length;const schema=fs.readFileSync(path.join(root,'database/schema.current.sql'));manifest.schemaSnapshot={file:'database/schema.current.sql',sha256:crypto.createHash('sha256').update(schema).digest('hex')};manifest.generatedFrom='deterministic-release-pipeline';fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');
}
console.log(`Generated runtime release identity ${version}`);
