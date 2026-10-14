import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const health=read('src/worker/modules/admin-control/system-health.service.js');
const command=read('src/worker/modules/admin-control/command-center.service.js');
const route=read('src/worker/modules/admin-control/admin-build-data.routes.js');
const ui=read('public/assets/js/frontend/admin/admin.js')+read('public/assets/js/frontend/admin/oversight/product-operations.js');
const cc=read('public/assets/js/frontend/admin/command-center.js');
for(const token of ["const observe=async(label,fn)=>", "status:'unavailable'", "no missing/empty state is inferred."]){if(!health.includes(token))throw new Error(`system health missing explicit degraded semantics: ${token}`)}
if(!health.includes("observe('admin.system_health.certification'"))throw new Error('system health must isolate certification authority failures');
if(!command.includes("unavailableAuthorities"))throw new Error('command center must explicitly expose unavailable authorities');
if(!route.includes("authority:'platform.product_certification'"))throw new Error('product certification observation route must expose degraded authority state');
if(!ui.includes('degradedAuthorities'))throw new Error('system health UI must surface degraded authorities');
if(!cc.includes('AUTHORITY AVAILABILITY'))throw new Error('command center UI must render unavailable authority state explicitly');
console.log('Admin observability resilience: PASS');
