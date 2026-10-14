import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const service=read('src/worker/modules/onboarding/organization-onboarding.service.js');
const routes=read('src/worker/modules/onboarding/onboarding.routes.js');
const migration=read('database/migrations/0080_organization_onboarding_provisioning.sql');
const auth=read('src/worker/modules/auth/auth.routes.js');
const register=read('public/assets/js/pages/register.js');
const verification=read('src/worker/modules/verification/verification.service.js');
const required=[
 [service,'getOrganizationOnboardingRequirements','runtime requirements'],
 [service,'createOrganizationOnboarding','canonical creation'],
 [service,'PROVISIONING_FAILED','failure recovery state'],
 [service,'idempotency_key','idempotent creation'],
 [service,'capabilityEligibility','capability eligibility'],
 [service,'subscriptionEligibility','subscription eligibility'],
 [service,'transitionOrganizationLifecycle','canonical lifecycle'],
 [routes,'/api/organizations/onboarding','organization onboarding endpoint'],
 [routes,'/api/organizations/onboarding/requirements','runtime requirements endpoint'],
 [routes,'/retry','provisioning retry endpoint'],
 [migration,'organization_onboarding_records','onboarding record table'],
 [migration,'organization_provisioning_events','provisioning events'],
 [auth,'/api/auth/tenant/register','legacy endpoint must be removed'],
 [register,'/api/organizations/onboarding','registration uses canonical path'],
 [verification,'transitionOrganizationLifecycle','verification/trust lifecycle convergence']
];
for(const [txt,needle,label] of required){if(needle==='/api/auth/tenant/register'){if(txt.includes(needle))throw new Error(`${label}: legacy route still present`);}else if(!txt.includes(needle))throw new Error(`${label}: missing ${needle}`);}
console.log('10.37.2 Organization + Onboarding contract: PASS');
