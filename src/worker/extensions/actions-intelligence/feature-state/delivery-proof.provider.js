import * as fileRepo from "../../../repositories/file.repository.js";

export async function deliveryProofState(env,access,mission){
  const required=Number(mission.delivery_proof_required??1)===1;
  let proof=null;
  try{
    proof=await fileRepo.findDeliveryProof(env,Number(access.tenantId),Number(mission.id));
  }catch(error){
    console.warn("ACTION_STATE_DELIVERY_PROOF",{missionId:Number(mission.id),error:String(error?.message||error)});
  }
  return Object.freeze({
    feature:"delivery_proof",
    required,
    present:Boolean(proof),
    missing:Boolean(required&&!proof),
    complete:Boolean(!required||proof),
    proofId:Number(proof?.id||0)||null,
    fileId:Number(proof?.file_id||0)||null
  });
}
