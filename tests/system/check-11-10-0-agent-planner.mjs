import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {composeAgentPlan,AGENT_PLANNER_VERSION,AGENT_PLAN_STAGES} from '../../src/worker/extensions/agentic-layer/agent-planner.service.js';

const root=process.cwd();
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const version=read('VERSION').trim();
assert.ok(['11.10.0','11.11.0','11.12.0','11.13.0','11.14.0','11.15.0','11.16.0','11.17.0','11.18.0','12.0.0','12.0.1','12.1.0','12.2.0','12.3.0','12.4.0','12.4.1','12.5.0','12.5.1','12.5.2','12.5.3','12.6.0','12.7.0','12.8.0','12.9.0','13.0.0','13.1.0','13.2.0','13.3.0','13.4.0','13.5.0','13.6.0','13.7.0','13.8.0','13.9.0','14.0.0','14.2.0','14.3.0','14.4.0','14.5.0','14.6.0','14.7.0','14.8.0','14.9.0','15.0.0','15.0.1','15.1.0','15.2.0','15.3.0','15.5.0','16.0.0','16.2.0','16.4.0','16.5.0','16.6.0','16.7.0','16.8.0','16.9.0','16.9.1','16.9.2','16.9.3','16.9.4','16.10.0','16.10.1','16.10.10','16.10.11','16.10.12','16.10.13','16.10.14','16.10.15','16.10.16','16.10.17','16.10.18','16.10.19','16.10.20','16.10.21','16.10.22','16.10.23','16.10.24','16.10.25','16.10.26','16.10.27','16.10.28','16.10.29','16.10.30','16.10.31','16.10.32','16.10.33','16.10.34','16.10.35','16.10.36','16.10.37','16.10.39','16.10.40','16.10.41','16.10.43','16.10.44','16.10.45','16.10.46','16.10.47','16.10.48','16.10.49'].includes(version));
assert.equal(JSON.parse(read('package.json')).version,version);

const context={
  kind:'agent_mission_context',
  identity:{missionId:42,companyId:7},
  canonical:{
    stateToken:'v:9',
    mission:{lifecycle:{status:'Pending',terminal:false}},
    flow:{status:'Pending',terminal:false,next:{action:{code:'confirm_arrival',label:'Confirm Arrival'},viewerCanExecute:true,waitingFor:null,reasonCode:null},readiness:{state:'READY'}}
  },
  actions:{available:[{code:'confirm_arrival',label:'Confirm Arrival'}]},
  calibration:{actions:[{actionCode:'confirm_arrival',deferenceState:'TRUSTED'}]},
  semanticMemory:{status:'READY',results:[{missionId:41,sourceType:'MISSION_OUTCOME',score:.81}]},
  constraints:{canonicalTruthOnly:true,authorizationRequired:true,verificationRequired:true}
};
const decisions={decisions:[
  {actionCode:'confirm_arrival',state:'READY',ready:true,reason:'Canonical action is ready.',target:{kind:'mission'},stateToken:'v:9',next:{kind:'execute'}},
  {actionCode:'message',state:'REQUIRES_INPUT',ready:false,reason:'Message requires input.',next:{kind:'collect_input'}},
  {actionCode:'delete_mission',state:'READY',ready:true,reason:'Canonical action is ready.',next:{kind:'execute'}}
]};
const governance={mode:'RECOMMEND_ONLY',autonomyLevel:1,executionEnabled:false,policyVersion:'11.10.0-PLANNER'};
const plan=composeAgentPlan({context,contextHash:'ctx-hash',decisions,governance,input:{goal:'Move the mission forward'}});
assert.equal(plan.version,AGENT_PLANNER_VERSION);
assert.deepEqual(plan.stages,AGENT_PLAN_STAGES);
assert.equal(plan.contextHash,'ctx-hash');
assert.equal(plan.stateToken,'v:9');
assert.equal(plan.intent.goal,'Move the mission forward');
assert.equal(plan.alignment.authoritativeAction,'confirm_arrival');
assert.equal(plan.semanticMemory.advisoryOnly,true);
assert.equal(plan.recommendedNextAction.actionCode,'confirm_arrival');
assert.equal(plan.recommendedNextAction.state,'READY');
assert.equal(plan.risk.policyGate.executionAllowed,false);
assert.equal(plan.plan.noMutationPerformed,true);
assert.equal(plan.authority.canonicalTruth,'authoritative');
assert.equal(plan.authority.learnedSignals,'advisory_only');
assert.equal(plan.authority.semanticMemory,'advisory_only');

const terminal=composeAgentPlan({
  context:{...context,canonical:{...context.canonical,mission:{lifecycle:{status:'Completed',terminal:true}},flow:{...context.canonical.flow,status:'Completed',terminal:true,next:{action:null,viewerCanExecute:false}}}},
  contextHash:'terminal',decisions,governance,input:{}
});
assert.equal(terminal.recommendedNextAction,null);
assert.equal(terminal.risk.policyGate.state,'DEFER');
assert.ok(terminal.risk.policyGate.reasons.includes('MISSION_TERMINAL'));
assert.ok(terminal.plan.steps.includes('VERIFY_TERMINAL_STATE'));

const highRisk=composeAgentPlan({context,contextHash:'high',decisions:{decisions:[{actionCode:'delete_mission',state:'READY',ready:true,reason:'ready',next:{kind:'execute'}}]},governance:{...governance,mode:'CONTROLLED_EXECUTION',executionEnabled:true,autonomyLevel:5},input:{}});
assert.equal(highRisk.recommendedNextAction.actionCode,'delete_mission');
assert.equal(highRisk.recommendedNextAction.humanApprovalRequired,true);
assert.equal(highRisk.risk.policyGate.executionAllowed,false);
assert.ok(highRisk.risk.policyGate.reasons.includes('HUMAN_APPROVAL_REQUIRED'));

const defer=composeAgentPlan({context:{...context,calibration:{actions:[{actionCode:'confirm_arrival',deferenceState:'DEFER'}]}},contextHash:'defer',decisions:{decisions:[decisions.decisions[0]]},governance,input:{}});
assert.equal(defer.recommendedNextAction.deferenceState,'DEFER');
assert.ok(defer.recommendedNextAction.advisoryWeight<1);
assert.equal(defer.risk.policyGate.executionAllowed,false);

const source=read('src/worker/extensions/agentic-layer/agent-planner.service.js');
for(const token of ['SITUATION','INTENT','ALIGNMENT','SEMANTIC_MEMORY','CANDIDATE_ACTIONS','PLAN','RISK','CONFIDENCE','RECOMMENDED_NEXT_ACTION','executionAllowed:false','advisory_only','canonical_action_decision'])assert(source.includes(token),`missing planner contract token ${token}`);
const routes=read('src/worker/extensions/agentic-layer/agentic-layer.routes.js');
assert(routes.includes('agent\\/planner\\/missions'));
const ui=read('public/assets/js/frontend/admin/operating-system.js');
assert(ui.includes('Mission Planner'));
assert(ui.includes('/api/agent/planner/missions/'));
console.log('11.10.0 agent planner: PASS');
console.log('Planner is read-only, canonical-action aligned, calibration/semantic advisory-only, and execution remains disabled at the planner boundary.');
