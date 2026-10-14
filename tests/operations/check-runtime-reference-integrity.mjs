import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const failures=[];

const adaptive=read('public/assets/js/extensions/adaptive-operational-model.js');
const actions=read('public/assets/js/extensions/operations-actions-capability.js');
const context=read('public/assets/js/extensions/operations-context-capability.js');
const custodyUi=read('public/assets/js/extensions/canonical-custody-responsibility-ui-103056.js');
const missionWorkspace=read('public/assets/ui/mission.js');
const custodyService=read('src/worker/extensions/mission-management/custody-responsibility/canonical-custody-responsibility.service.js');
const events=read('src/worker/modules/intelligence/operational-events.service.js');
const notifications=read('src/worker/modules/notifications/notifications.service.js');
const api=read('public/assets/js/core/api.js');

if(/\bm\.(network_pending_invitation_id|pending_request_id)\b/.test(adaptive)) failures.push('adaptive operational model contains an out-of-scope m reference');
if(/\bcontroller\.executeEmbeddedAction\b/.test(actions)) failures.push('Operations actions capability references an unavailable controller variable');
if(/\bstate\.sessionRole\|\|session\?\.role\b/.test(context)) failures.push('Operations context capability references an out-of-scope session variable');
if(/\bconst currentMission=/.test(context) && /\bcurrentMission\b/.test(context)===false) failures.push('Operations context capability lost current mission binding');
if(/if\(false&&isAdmin&&host\)/.test(custodyUi)) failures.push('Custody workspace retains dead code with an undefined action handler');
if(!/const VIEWS=Object.freeze/.test(missionWorkspace)||!/renderMissionWorkbench/.test(missionWorkspace)) failures.push('Canonical Mission Workspace renderer is missing');
if(!/import \{createRequirement,resolveRequirement,findOpenRequirement\}/.test(custodyService)) failures.push('Custody service does not import findOpenRequirement from its authoritative repository');
if(/networkIncoming\(n\)\)/.test(events)) failures.push('Operational events calls networkIncoming without the current session');
if(/function networkIncoming\(n,session\)/.test(events)===false) failures.push('Operational events networkIncoming lacks explicit session context');
if(/operationalMissionHref\(missionId,\{role:session\.role\}\)/.test(notifications)) failures.push('Notification exception builder references an out-of-scope session');
if(!/operationalMissionHref\(missionId,\{role:"admin"\}\)/.test(notifications)) failures.push('Notification exception destination is not explicitly bound to its admin recipient role');
if(/fetchCanonicalMissionStateToken\(missionId,path\)/.test(api)) failures.push('Protected mutation token resolver uses an out-of-scope path variable');
if(!/fetchCanonicalMissionStateToken\(missionId,url\)/.test(api)) failures.push('Protected mutation token resolver does not use the request URL');

if(failures.length){
  console.error('FAIL runtime reference integrity');
  for(const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log('PASS runtime reference integrity across Operations, Workbench, custody, events, notifications and protected API');
