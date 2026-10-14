import fs from "node:fs";
const root=process.cwd(); const read=f=>fs.readFileSync(`${root}/${f}`,'utf8');
const p=read('src/worker/security/subscription-policy.service.js');
const r=read('src/worker/modules/subscriptions/subscription.routes.js');
if(!p.includes('from "../repositories/subscription.repository.js"')) throw new Error('Subscription repository import path is incorrect');
if(p.includes('from "../../repositories/subscription.repository.js"')) throw new Error('Stale subscription repository import remains');
if(!r.includes('policy:await resolveSubscriptionContext(env,s)')) throw new Error('Policy route does not await resolver');
console.log('10.31.67 subscription deployment correction: PASS');
