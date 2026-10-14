import {buildCanonicalDecisionActionConsistency,validateCanonicalDecisionActionConsistency} from '../../src/worker/extensions/operations-context/canonical-decision-action-consistency.contract.js';
const c=buildCanonicalDecisionActionConsistency({mission:{id:242},decision:{state:'REVIEW',label:'Review current condition',reason:'Canonical step is not exposed.'},readiness:{next:{code:'assign_driver',label:'Assign Driver'},execution:{state:'NOT_EXPOSED'},waiting:{isActive:false}},responsibility:{responsible:{name:'Aca'}},operatorIntent:{state:'REVIEW'},canonicalCapability:{code:'assign_driver',label:'Assign Driver',exposureState:'NOT_EXPOSED'},primaryAction:{code:'check_assignment',label:'Check Assignment'},actionInventory:{counts:{all:6}}});
if(c.relationship.type!=='SUPPORT_FOR_CANONICAL_STEP')throw new Error('support action was not separated from canonical lifecycle step');
if(!c.relationship.explanation.includes('does not replace'))throw new Error('support explanation missing');
if(!c.reassessment.expected.includes('Check Assignment'))throw new Error('reassessment contract missing');
if(validateCanonicalDecisionActionConsistency(c).length)throw new Error(validateCanonicalDecisionActionConsistency(c).join(','));
console.log('10.29.57 decision-action consistency: PASS');
