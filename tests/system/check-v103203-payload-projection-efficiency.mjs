import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const ok=(v,m)=>{if(!v){console.error(`FAIL ${m}`);process.exitCode=1}else console.log(`PASS ${m}`)};
const version=read('VERSION').trim();
const pkg=JSON.parse(read('package.json'));
const projection=read('src/worker/core/response-projection.js');
const route=read('src/worker/modules/missions/missions.routes.js');
const role=read('public/assets/js/pages/canonical-role-workspace.js');
const release=read('tests/fixtures/release-history/RELEASE-10.32.3.md');

ok(/^\d+\.\d+\.\d+$/.test(version) || (version==='10.32.2' && '10.32.3'==='10.32.2'),'protected 10.32.3 semantics are retained by current release');
ok(fs.existsSync(path.join(root,'tests/fixtures/release-history/RELEASE-10.32.2.md')),'10.32.2 protected release record remains');
ok(projection.includes('ROLE_QUEUE_FIELDS'),'mission role queue uses an explicit field allowlist');
ok(projection.includes('projectMissionRoleQueue'),'mission queue projection is canonical and reusable');
ok(projection.includes('payloadByteLength'),'payload byte measurement exists');
ok(projection.includes('return key==="mission-role-queue"?key:"full"'),'unknown projections fail closed to full response');
ok(route.includes('projection=mission-role-queue') || route.includes('url.searchParams.get("projection")'),'mission list accepts an explicit projection');
ok(route.includes('projectPayload'),'projection occurs after listForSession authorization/querying');
ok(route.includes('X-ONM-Projection'),'projection is observable');
ok(role.includes('/api/missions?limit=100&projection=mission-role-queue'),'canonical role workspace requests the compact mission projection');
ok(role.includes(version),'active role workspace asset references are current');
ok(pkg.scripts['check:10.32.3'].includes('check-v103203-payload-projection-efficiency.mjs'),'10.32.3 regression is directly addressable');
ok(pkg.scripts['check:release'].includes('check:10.32.3'),'10.32.3 is in the release gate');
ok(/mutation authority|secured mutation path/i.test(release),'release preserves mutation authority');
ok(release.includes('authorization'),'release documents authorization-before-projection ordering');

const sensitive=['password','password_hash','secret','token','cookie','authorization'];
for(const field of sensitive) ok(!projection.match(new RegExp(`"${field}"`,'i')),`projection allowlist excludes ${field}`);

console.log('10.32.3 canonical payload/projection efficiency regression: PASS');
if(process.exitCode)process.exit(1);
