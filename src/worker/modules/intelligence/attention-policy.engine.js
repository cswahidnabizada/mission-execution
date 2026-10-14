/**
 * Attention Policy — decides whether a mission-health signal deserves user awareness.
 * Pure/read-only. Health remains the truth about execution quality; this layer is only relevance.
 */
const POLICY={
  assignment_required:{points:40,level:"attention",roles:["admin"],actionable:true},
  execution_partner_unassigned:{points:35,level:"attention",roles:["admin"],actionable:true},
  marketplace_waiting:{points:12,level:"watch",roles:["admin","executor"],actionable:true},
  required_data_missing:{points:35,level:"attention",roles:["admin"],actionable:true},
  overdue:{points:60,level:"critical",roles:["admin","driver","executor"],actionable:true},
  deadline_critical:{points:45,level:"critical",roles:["admin","driver","executor"],actionable:true},
  deadline_soon:{points:30,level:"attention",roles:["admin","driver","executor"],actionable:true},
  deadline_watch:{points:12,level:"watch",roles:["admin","driver","executor"],actionable:false},
  pickup_late:{points:25,level:"attention",roles:["admin","driver","executor"],actionable:true},
  pickup_waiting:{points:22,level:"attention",roles:["admin","driver","executor"],actionable:true},
  completion_pending:{points:18,level:"watch",roles:["admin","driver","executor"],actionable:true},
  stale_progress:{points:10,level:"watch",roles:["admin","driver","executor"],actionable:false}
};

export function attentionFromHealthSignal(signal,{role=""}={}){
  const p=POLICY[signal?.code];
  if(!p)return null;
  if(p.roles?.length&&!p.roles.includes(role))return null;
  return {
    code:signal.code,
    label:signal.label,
    points:p.points,
    level:p.level,
    actionable:Boolean(p.actionable),
    healthSeverity:signal.severity,
    domain:signal.domain
  };
}

export function attentionLevelFromScore(score){
  const n=Number(score||0);
  return n>=70?"critical":n>=35?"attention":n>0?"watch":"none";
}
