const ESSENTIAL_REQUIREMENTS=new Set(["custody_release","custody_acceptance"]);

export function deriveManagementRequirements({flow={},conditions={},featureState={},executionLocation=null,persisted=[],session={}}={}){
  const out=[],personal=Boolean(conditions.perspective?.isPersonal);
  const actor=flow.ownership?.actor||null;

  // Mission Management only surfaces requirements that change mission
  // responsibility/custody or explicitly belong to completion. Old location,
  // traffic and waiting requests are intentionally ignored here.
  for(const row of persisted){
    const code=String(row.code||"");
    if(!ESSENTIAL_REQUIREMENTS.has(code)&&!code.startsWith("completion_"))continue;
    const mine=isRequestedActor(session,row)||
      (personal&&actor&&String(row.requested_actor_type)===String(actor.type)&&Number(row.requested_actor_id||0)===Number(actor.id||0));
    out.push(req(code,mine?"ACTION_REQUIRED":"WAITING",row.id,{
      actor:{type:row.requested_actor_type,id:Number(row.requested_actor_id||0)||null,name:actor?.name||row.requested_actor_type},
      question:question(code),actionCode:actionFor(code),persisted:true,createdAt:row.created_at||null,updatedAt:row.updated_at||null
    }));
  }

  return Object.freeze(out);
}
function req(code,state,id,x){return Object.freeze({code,state,id,...x});}
function question(code){
  if(code==="custody_release")return "Are you ready to hand over the freight? You remain responsible until the receiver accepts custody.";
  if(code==="custody_acceptance")return "Have you physically received the freight and accepted custody?";
  if(String(code).startsWith("completion_"))return "Complete the required mission-closing confirmation.";
  return "Mission management requires your confirmation.";
}
function actionFor(code){
  if(code==="custody_release")return "confirm_custody_release";
  if(code==="custody_acceptance")return "accept_custody";
  return null;
}

function isRequestedActor(session,row){
  const type=String(row?.requested_actor_type||"");
  const id=Number(row?.requested_actor_id||0);
  if(type==="driver")return session?.role==="driver"&&Number(session?.driverId||0)===id;
  if(type==="executor")return session?.role==="executor"&&Number(session?.executorId||0)===id;
  return false;
}
