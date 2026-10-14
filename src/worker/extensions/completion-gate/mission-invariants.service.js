export async function missionInvariantState(env,mission){
  const companyId=Number(mission.company_id),missionId=Number(mission.id);
  const [ownerDriver,executor,shared,pendingNetwork,pendingForYou,openRequirements,openCustody]=await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) n FROM mission_active_assignment_projection WHERE company_id=? AND mission_id=? AND assignment_type='owner_driver' AND assignee_type='driver' AND status='active'`).bind(companyId,missionId).first(),
    env.DB.prepare(`SELECT COUNT(*) n FROM mission_active_assignment_projection WHERE company_id=? AND mission_id=? AND assignment_type='executor' AND assignee_type='executor' AND status='active'`).bind(companyId,missionId).first(),
    env.DB.prepare(`SELECT COUNT(*) n FROM mission_active_assignment_projection WHERE company_id=? AND mission_id=? AND assignment_type='tenant_driver' AND assignee_type='driver' AND status='active'`).bind(companyId,missionId).first(),
    env.DB.prepare(`SELECT COUNT(*) n FROM network_mission_invitations WHERE owner_company_id=? AND mission_id=? AND status='Pending'`).bind(companyId,missionId).first(),
    env.DB.prepare(`SELECT COUNT(*) n FROM public_mission_requests WHERE company_id=? AND mission_id=? AND status='Pending'`).bind(companyId,missionId).first(),
    env.DB.prepare(`SELECT COUNT(*) n FROM mission_management_requirements WHERE company_id=? AND mission_id=? AND status='open' AND (code LIKE 'completion_%' OR code IN ('custody_release','custody_acceptance'))`).bind(companyId,missionId).first(),
    env.DB.prepare(`SELECT COUNT(*) n FROM mission_custody_cases WHERE company_id=? AND mission_id=? AND status IN ('open','awaiting_release','ready_to_transfer','awaiting_acceptance')`).bind(companyId,missionId).first()
  ]);

  const executionOwners=Number(ownerDriver?.n||0)+Number(executor?.n||0)+Number(shared?.n||0);
  const terminal=["Completed","Cancelled","Canceled"].includes(String(mission.status||""));

  const violations=[];
  if(executionOwners>1)violations.push(issue("multiple_execution_owners","Execution ownership is conflicting."));
  if(Number(mission.public_enabled||0)===1&&executionOwners>0)violations.push(issue("marketplace_with_execution_owner","ForYou is active while an execution owner is already active."));
  if(Number(pendingNetwork?.n||0)>0&&(Number(mission.public_enabled||0)===1||executionOwners>0))violations.push(issue("pending_network_conflict","A pending Network invitation conflicts with the current execution path."));
  if(terminal&&Number(pendingNetwork?.n||0)>0)violations.push(issue("terminal_pending_network","A closed mission still has a pending Network invitation."));
  if(terminal&&Number(pendingForYou?.n||0)>0)violations.push(issue("terminal_pending_foryou","A closed mission still has a pending ForYou request."));
  if(terminal&&Number(openRequirements?.n||0)>0)violations.push(issue("terminal_open_requirement","A closed mission still has an open management requirement."));
  if(terminal&&Number(openCustody?.n||0)>0)violations.push(issue("terminal_open_custody","A closed mission still has an open custody case."));

  return Object.freeze({
    valid:violations.length===0,
    executionOwners,
    pendingNetwork:Number(pendingNetwork?.n||0),
    pendingForYou:Number(pendingForYou?.n||0),
    openRequirements:Number(openRequirements?.n||0),
    openCustody:Number(openCustody?.n||0),
    violations:Object.freeze(violations)
  });
}
function issue(code,message){return Object.freeze({code,message});}
