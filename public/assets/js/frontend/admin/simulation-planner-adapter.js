/**
 * Simulation-only adapter for the existing canonical planning contracts.
 * It deliberately does not invoke a live mission planner or write mission truth.
 */
export const SIMULATION_PLANNER_CONTRACT = Object.freeze({
  adapterVersion: '16.10.77',
  planningAuthorityVersion: '14.0.0',
  evaluationAuthorityVersion: '13.8.0',
  mode: 'SIMULATION_ONLY',
  executionAllowed: false,
  productionMutation: false
});

const safeInt=(value,fallback,min,max)=>{
  const n=Number(value);
  return Number.isInteger(n)&&n>=min&&n<=max?n:fallback;
};

export function buildSimulationPlan({scenarioId,executorId,deadlineMinutes,seed,resources={}}={}) {
  const requiredMinutes=safeInt(resources.requiredMinutes,28,1,1440);
  const availableCapacity=safeInt(resources.availableCapacity,1,0,10000);
  const requiredCapacity=safeInt(resources.requiredCapacity,1,0,10000);
  const deadline=safeInt(deadlineMinutes,45,1,1440);
  const findings=[];
  if(availableCapacity<requiredCapacity) findings.push({code:'RESOURCE_CAPACITY_INSUFFICIENT',severity:'BLOCK',required:requiredCapacity,available:availableCapacity});
  if(requiredMinutes>deadline) findings.push({code:'DEADLINE_CONSTRAINT_EXCEEDED',severity:'BLOCK',requiredMinutes,deadlineMinutes:deadline});
  const blocked=findings.some(x=>x.severity==='BLOCK');
  return Object.freeze({
    contract:SIMULATION_PLANNER_CONTRACT,
    scenarioId:String(scenarioId||''),
    executorId:String(executorId||''),
    seed:String(seed??'default').slice(0,80),
    constraints:{deadlineMinutes:deadline,requiredMinutes,requiredCapacity,availableCapacity},
    findings,
    status:blocked?'BLOCKED':'PROPOSED',
    steps:blocked?[]:[
      {stage:'OBSERVE',action:'collect_simulated_context'},
      {stage:'UNDERSTAND',action:'normalize_scenario'},
      {stage:'PLAN',action:'select_virtual_execution_path'},
      {stage:'EVALUATE',action:'evaluate_simulated_constraints'}
    ],
    execution:{allowed:false,reason:'SIMULATION_PLANS_NEVER_AUTHORIZE_OR_EXECUTE'},
    productionMutation:false,
    deviceCommandSent:false
  });
}
