export async function messagingState(env,access,mission){
  const missionId=Number(mission.id),tenantId=Number(access.tenantId);
  let attention=0;
  try{
    const row=await env.DB.prepare(`
      SELECT COUNT(*) AS c FROM mission_messages
      WHERE company_id=? AND mission_id=? AND attention_required=1 AND attention_resolved_at IS NULL
    `).bind(tenantId,missionId).first();
    attention=Number(row?.c||0);
  }catch(error){
    console.warn("ACTION_STATE_MESSAGING",{missionId,error:String(error?.message||error)});
  }
  return Object.freeze({
    feature:"messaging",
    contactAvailable:true,
    escalationNeeded:attention>0,
    unresolvedAttentionMessages:attention
  });
}
