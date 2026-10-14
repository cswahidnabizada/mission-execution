import fs from 'node:fs';
import {buildPredictiveOperations} from '../../src/worker/modules/intelligence/predictive-operations.engine.js';
const engine=fs.readFileSync('src/worker/modules/intelligence/predictive-operations.engine.js','utf8');
const route=fs.readFileSync('src/worker/extensions/operations-context/predictive-operations.routes.js','utf8');
const ui=fs.readFileSync('public/assets/js/extensions/dashboard-work-surface-101920.js','utf8');
if(!engine.includes('authoritative:false')||!engine.includes('readOnly:true'))throw new Error('Predictive contract must be explicitly advisory/read-only.');
if(/\b(?:INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM)\b/i.test(engine))throw new Error('Predictive engine contains mutation SQL.');
if(!route.includes('requireAdmin')||!route.includes('session.tenantId'))throw new Error('Predictive route is not tenant/admin scoped.');
if(!route.includes('limitAction'))throw new Error('Predictive route is missing rate limiting.');
if(!ui.includes('/api/operations/predictive'))throw new Error('Work surface does not consume predictive contract.');
const now=Date.parse('2026-09-08T12:00:00Z');
const model=buildPredictiveOperations({now,missions:[{id:1,reference:'M-1',status:'Pending',deadline_at_utc:'2026-09-08T13:00:00Z',updated_at:'2026-09-08T08:00:00Z',pickup_city:'Oldenburg',delivery_city:'Bremen'}],attentionItems:[{missionId:1,level:'critical',reason:'assignment required',dependency:'executor missing',liveness:'blocked'}],networkPartners:[{recipientId:9,name:'Trusted Partner',kind:'Trusted company'}]});
const p=model.predictions[0];
if(!p||p.missionId!==1)throw new Error('Predictive mission output missing.');
const types=new Set(p.predictions.map(x=>x.predictionType));
for(const needed of ['DEADLINE_RISK','BLOCKAGE_RISK','RESPONSIBILITY_RISK'])if(!types.has(needed))throw new Error(`Missing ${needed} prediction.`);
for(const x of p.predictions){if(!x.reason||!Array.isArray(x.evidence)||!x.confidence)throw new Error('Prediction missing reason/evidence/confidence.');if(x.authoritative!==false||x.readOnly!==true)throw new Error('Prediction authority boundary failed.');}
if(!model.networkNeed.length||!model.workloadPressure.length)throw new Error('Predictive aggregate outputs missing.');
console.log('10.19.21 predictive operations contract: PASS');
