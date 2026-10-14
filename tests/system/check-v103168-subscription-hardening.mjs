import fs from 'node:fs';
const ms=fs.readFileSync('src/worker/modules/missions/missions.service.js','utf8');
if(!ms.includes('requireSubscriptionCapacity') || !ms.includes('subscription-policy.service.js')) throw new Error('Mission capacity guard import missing');
const ss=fs.readFileSync('src/worker/modules/subscriptions/subscription.service.js','utf8');
if(!ss.includes('getStripeCustomer') || !ss.includes('resetStripeBillingIdentity')) throw new Error('Stripe customer recovery missing');
if(!ss.includes('isMissingCustomer') || !ss.includes('resource_missing')) throw new Error('Stripe missing-customer recovery missing');
const sr=fs.readFileSync('src/worker/repositories/subscription.repository.js','utf8');
if(!sr.includes("stripe_customer_id=NULL, stripe_subscription_id=NULL, status='inactive'")) throw new Error('Stale Stripe identity reset missing');
console.log('10.31.68 subscription hardening: PASS');
