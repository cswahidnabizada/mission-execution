const LEVEL_WEIGHT={critical:100,attention:70,watch:40,info:10};

/**
 * Priority answers only: "What matters most right now?"
 * It does not choose UI actions and does not mutate state.
 */
export function rankFocusCandidates(candidates=[]){
  return candidates
    .filter(c=>c&&c.valid!==false)
    .map(c=>({...c,...priorityForCandidate(c)}))
    .sort((a,b)=>b.priorityScore-a.priorityScore||compareTime(a,b)||Number(a.missionId||0)-Number(b.missionId||0));
}

export function priorityForCandidate(c={}){
  const severity=Number(LEVEL_WEIGHT[c.level]||0);
  const impact=c.blocking?30:c.criticalImpact?24:0;
  const actionability=c.actionable?18:0;
  const urgency=urgencyWeight(c);
  const freshness=freshnessWeight(c.at);
  const roleRelevance=c.roleRelevant===false?-40:0;
  const priorityScore=Math.max(0,Math.min(220,Number(c.points||0)+severity+impact+actionability+urgency+freshness+roleRelevance));
  return {
    priorityScore,
    priorityLevel:priorityLevel(priorityScore),
    priorityFactors:{severity,impact,actionability,urgency,freshness,roleRelevance}
  };
}

export function priorityLevel(score){
  if(score>=150)return "critical";
  if(score>=100)return "high";
  if(score>=55)return "medium";
  return "low";
}

function urgencyWeight(c){
  const mins=Number(c.remainingMinutes);
  if(Number.isFinite(mins)){
    if(mins<=0)return 35;
    if(mins<=15)return 30;
    if(mins<=30)return 22;
    if(mins<=60)return 12;
  }
  return c.overdue?35:0;
}
function freshnessWeight(at){
  const t=Date.parse(at||"");if(!Number.isFinite(t))return 0;
  const age=Math.max(0,Date.now()-t);
  if(age<=5*60*1000)return 8;
  if(age<=30*60*1000)return 4;
  return 0;
}
function compareTime(a,b){return Date.parse(b.at||0)-Date.parse(a.at||0);}
