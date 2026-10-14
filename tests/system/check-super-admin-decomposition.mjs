import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const assert=(ok,msg)=>{if(!ok)throw new Error(msg)};
const files={
  routes:'src/worker/modules/admin-control/admin-control.routes.js',
  routeContext:'src/worker/modules/admin-control/admin-route-context.js',
  utils:'src/worker/modules/admin-control/admin-control.utils.js',
  controlPlane:'src/worker/modules/admin-control/control-plane.service.js',
  commandCenter:'src/worker/modules/admin-control/command-center.service.js',
  systemHealth:'src/worker/modules/admin-control/system-health.service.js',
  company:'src/worker/modules/admin-control/company-admin.service.js',
  governance:'src/worker/modules/admin-control/governance.service.js',
  evidence:'src/worker/modules/admin-control/compliance-evidence.service.js'
};
for(const [name,file] of Object.entries(files)) assert(fs.existsSync(path.join(root,file)),`decomposed admin module missing: ${name}`);
assert(!fs.existsSync(path.join(root,'src/worker/modules/admin-control/admin-control.service.js')),'legacy monolithic admin-control.service.js must be removed');
const routes=read(files.routes), routeContext=read(files.routeContext);
assert(!routes.includes("./admin-control.service.js"),'admin routes still import the retired monolithic service');
const control=read(files.controlPlane), command=read(files.commandCenter), health=read(files.systemHealth), company=read(files.company), governance=read(files.governance), evidence=read(files.evidence);
assert(control.includes('export async function getControlPlane'),'Control Plane has one canonical owner');
assert(command.includes('export async function getPlatformCommandCenter'),'Command Center has one canonical owner');
assert(health.includes('export async function getSystemHealth'),'System Health has one canonical owner');
assert(company.includes('export async function getCompany')&&company.includes('export async function updateCompany'),'Company administration has one canonical owner');
assert(governance.includes('export async function getPrivacyAdministrationSummary')&&governance.includes('export async function getExternalProviderGovernance'),'Governance authorities are physically grouped under one governance owner');
assert(evidence.includes('export async function getComplianceEvidence')&&evidence.includes('export async function recordComplianceEvidence'),'Compliance evidence has one canonical owner');
for(const token of ['./control-plane.service.js','./command-center.service.js','./system-health.service.js','./company-admin.service.js','./governance.service.js','./compliance-evidence.service.js']) assert(routeContext.includes(token),`route context missing canonical module import: ${token}`);
for(const token of ['./admin-access.routes.js','./admin-build-data.routes.js','./admin-verification-company.routes.js','./admin-governance.routes.js','./admin-launch-config.routes.js','./admin-operations.routes.js']) assert(routes.includes(token),`route registry missing decomposed route module: ${token}`);
console.log('Super Admin physical decomposition: PASS');
