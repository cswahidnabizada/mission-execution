import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const files=[
'src/worker/repositories/driver-workspace.repository.js','src/worker/repositories/awareness.repository.js','src/worker/repositories/driver.repository.js','src/worker/repositories/notification.repository.js','src/worker/repositories/auth.repository.js','src/worker/security/platform-configuration.service.js','src/worker/security/platform-trash.service.js','src/worker/security/mission-access.js','src/worker/security/platform-product-certification.service.js','src/worker/security/subscription-policy.service.js','src/worker/security/platform-data-control.service.js','src/worker/modules/tenant-overview.routes.js','src/worker/modules/transitions/fenced-mutation.context.js','src/worker/modules/analytics/metrics.service.js','src/worker/modules/network/network.service.js','src/worker/modules/admin-control/product-verification-engine.service.js','src/worker/modules/admin-control/system-health.service.js','src/worker/modules/reports/reports.service.js','src/worker/modules/people/people-access.service.js','src/worker/modules/public/public.routes.js','src/worker/extensions/operations-context/marketplace-drivers.repository.js'];
const bad=[];
for(const f of files){const s=fs.readFileSync(path.join(root,f),'utf8'); if(!/\b(?:FROM|JOIN)\s+mission_canonical_projection\b/i.test(s) && !/mission_active_assignment_projection/.test(s)) bad.push(f)}
const mig=fs.readFileSync(path.join(root,'database/migrations/0103_canonical_logistics_read_projection_wave_2.sql'),'utf8');
if(!/CREATE VIEW mission_canonical_projection/i.test(mig)) bad.push('migration-missing-view');
if(bad.length){console.error('LOGISTICS NORMALIZATION WAVE 2 FAILED'); for(const x of bad)console.error(x); process.exit(1)}
console.log('LOGISTICS NORMALIZATION WAVE 2 PASS');
