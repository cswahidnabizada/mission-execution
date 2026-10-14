import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const situation=read('src/worker/security/user-situation.service.js');
const policy=read('src/worker/security/subscription-policy.service.js');
const gateway=read('src/worker/extensions/actions-intelligence/action-context.gateway.js');
const capability=read('src/worker/extensions/actions-intelligence/action-capability.engine.js');
const execution=read('src/worker/extensions/action-execution/secured-action-execution.routes.js');
const management=read('src/worker/extensions/mission-management/mission-management.service.js');
const foryou=read('public/assets/js/pages/foryou.js');
const access=read('public/assets/js/pages/access.js');
const subPage=read('public/assets/js/pages/subscription.js');

const must=(s,needle,label)=>{if(!s.includes(needle))throw new Error(`Missing ${label}: ${needle}`)};
const forbidden=(s,needle,label)=>{if(s.includes(needle))throw new Error(`Forbidden duplicate authority in ${label}: ${needle}`)};

must(situation,'export async function resolveUserSituation','canonical situation resolver');
must(situation,'actions:buildActionSituation','canonical action decisions');
must(situation,'subscriptionClass','subscription class');
must(situation,'countryCode','jurisdiction');
must(situation,'verification','verification state');
must(situation,'giftGrant','gift access');
must(situation,'period','period state');
must(situation,'restrictions','restriction state');
must(situation,'requireUserSituationAction','secured action gate');
must(situation,'requireUserSituationCapacity','capacity gate');

for(const code of ['share_foryou','request_foryou_mission','share_network','accept_network','repost_foryou','restart_network'])must(situation,code,`canonical action ${code}`);
for(const code of ['cancel_foryou_request','decline_foryou_request','withdraw_foryou','withdraw_network'])must(situation,code,`safety action ${code}`);

must(gateway,'resolveUserSituation','Action Context consumes canonical user situation');
must(gateway,'situation','Action Context exposes canonical user situation');
must(capability,'ctx.situation?.actions','Actions Intelligence consumes canonical action decisions');
must(capability,'commercialActionAllowed(ctx,"accept_network")','Network acceptance respects canonical situation');
must(execution,'requireOperationalAction','secured execution consumes canonical operational gate');
must(management,'resolveUserSituation','Mission Management consumes canonical situation');
must(foryou,'/api/user/situation','ForYou UI consumes canonical situation');
must(access,'/api/user/operational-gate','Access routing consumes canonical operational gate');
must(subPage,'/api/user/situation','Subscription UI consumes canonical situation');
forbidden(foryou,'distributionActionSurface','ForYou UI must not contain a competing local action decision source');

for(const f of ['src/worker/extensions/action-execution/secured-action-execution.routes.js','src/worker/modules/network/network.service.js','src/worker/modules/public/public.service.js','src/worker/extensions/mission-management/custody-responsibility/canonical-custody-responsibility.service.js','src/worker/modules/missions/missions.service.js','src/worker/modules/people/people.service.js','src/worker/extensions/actions-intelligence/action-context.gateway.js','src/worker/extensions/mission-management/mission-management.service.js']){
  const s=read(f);
  forbidden(s,'subscription-policy.service.js',f);
}

// Commercial restrictions must not make safety/completion actions impossible.
for(const code of ['cancel_foryou_request','decline_foryou_request','withdraw_foryou','withdraw_network'])must(situation,'out[code]=Object.freeze({allowed:true,reason:"safety_or_completion"})',`safe action preservation ${code}`);

console.log('10.31.70 canonical user situation: PASS');
