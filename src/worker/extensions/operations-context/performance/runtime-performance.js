/** 10.18.11 — lightweight performance budget helpers. Diagnostic only. */
export function performanceMark(start=performance.now()){
  return Math.max(0,performance.now()-Number(start||0));
}

export function performanceBudget({durationMs=0,budgetMs=150,label="operation"}={}){
  const duration=Number(durationMs)||0;
  const budget=Number(budgetMs)||0;
  return Object.freeze({label:String(label),durationMs:Math.round(duration*10)/10,budgetMs:budget,withinBudget:duration<=budget});
}
