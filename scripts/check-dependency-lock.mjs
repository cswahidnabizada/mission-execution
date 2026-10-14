import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const lock=path.join(root,'package-lock.json');
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
if(!fs.existsSync(lock)){
  console.error('Dependency lock gate: FAIL');
  console.error('- package-lock.json is missing. Generate it with npm install --package-lock-only in the networked release environment.');
  process.exit(1);
}
const data=JSON.parse(fs.readFileSync(lock,'utf8'));
if(data.lockfileVersion!==3) throw new Error(`package-lock.json must use lockfileVersion 3, got ${data.lockfileVersion}`);
if(data.name!==pkg.name) throw new Error('package-lock name does not match package.json');
if(data.version!==pkg.version) throw new Error('package-lock version does not match package.json');
const rootPkg=data.packages?.[''];
if(!rootPkg) throw new Error('package-lock root package entry is missing');
for(const section of ['dependencies','devDependencies']){
  const expected=pkg[section]||{};
  const actual=rootPkg[section]||{};
  for(const [name,range] of Object.entries(expected)) if(actual[name]!==range) throw new Error(`package-lock ${section} mismatch for ${name}: expected ${range}, got ${actual[name]||'missing'}`);
}
console.log(`Dependency lock gate: PASS (lockfileVersion ${data.lockfileVersion})`);
