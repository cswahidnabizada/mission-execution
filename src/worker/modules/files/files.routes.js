import { cleanText, json, assertContentLength } from "../../core/http.js";
import { requireSession } from "../../core/auth-session.js";
import {limitAction} from "../../security/action-limit.js";
import { listFiles, readFile, uploadPhoto,uploadDeliveryProof,getDeliveryProof } from "./files.service.js";
import { disposeFileByPolicy } from "./file-governance.service.js";
import {getForSession} from "../missions/missions.service.js";
import {guardedMissionMutation} from "../transitions/transition-route.helper.js";

export function registerFileRoutes(router) {
  router.post(/^\/api\/missions\/(?<missionId>\d+)\/files$/, async ({ request, env, params }) => {
    try {
      const session = await requireSession(request, env);
      assertContentLength(request, 10 * 1024 * 1024);
      await limitAction(env,session,"file-upload",{limit:10,windowSeconds:60});
      const form = await request.formData();
      const file = form.get("file");
      const caption = cleanText(form.get("caption"), 2000);
      const saved = await uploadPhoto(env, session, Number(params.missionId), file, caption);
      return json({ success: true, file: saved }, 201);
    } catch (e) { return fail(e); }
  });

  router.post(/^\/api\/missions\/(?<missionId>\d+)\/delivery-proof$/, async ({ request, env, params }) => {
    try {
      const session = await requireSession(request, env);
      assertContentLength(request, 10 * 1024 * 1024);
      await limitAction(env,session,"delivery-proof-upload",{limit:5,windowSeconds:300});
      await limitAction(env,session,`delivery-proof-upload:${Number(params.missionId)}`,{limit:2,windowSeconds:60});
      const missionId=Number(params.missionId),mission=await getForSession(env,session,missionId);
      if(!mission)return json({success:false,error:"Mission not found or access denied"},404);
      const form=await request.formData(),file=form.get("file");
      const proof=await guardedMissionMutation({
        env,session,request,body:{},companyId:Number(mission.company_id),missionId,actionCode:"capture_delivery_proof",requireStateToken:true,
        reconciliationHint:{missionId},
        run:(_,fence)=>uploadDeliveryProof(env,session,missionId,file,fence)
      });
      return json({success:true,missionId,stateToken:proof.stateToken,proof},201);
    } catch(e){return fail(e);}
  });

  router.get(/^\/api\/missions\/(?<missionId>\d+)\/delivery-proof$/, async ({ request, env, params }) => {
    try{
      const session=await requireSession(request,env);
      await limitAction(env,session,"delivery-proof-read",{limit:60,windowSeconds:60});
      return json({success:true,...await getDeliveryProof(env,session,Number(params.missionId))});
    }catch(e){return fail(e);}
  });

  router.get(/^\/api\/missions\/(?<missionId>\d+)\/files$/, async ({ request, env, params, url }) => {
    try {
      const session = await requireSession(request, env);
      await limitAction(env,session,"file-list",{limit:60,windowSeconds:60});
      const limit=Math.min(Math.max(Number(url.searchParams.get("limit"))||100,1),200);
      const offset=Math.min(Math.max(Number(url.searchParams.get("offset"))||0,0),50000);
      const files = await listFiles(env, session, Number(params.missionId),{limit:limit+1,offset});
      const hasMore=files.length>limit;
      return json({ success: true, missionId: Number(params.missionId), files:files.slice(0,limit), hasMore, nextOffset:hasMore?offset+limit:null });
    } catch (e) { return fail(e); }
  });

  router.post(/^\/api\/files\/(?<fileId>\d+)\/disposition-review$/, async ({ request, env, params }) => {
    try {
      const session = await requireSession(request, env);
      await limitAction(env,session,"file-disposition-review",{limit:20,windowSeconds:300});
      const result = await disposeFileByPolicy(env,session,Number(params.fileId),{reason:"admin_policy_review"});
      return json({success:true,...result});
    } catch (e) { return fail(e); }
  });

  router.get(/^\/api\/files\/(?<fileId>\d+)$/, async ({ request, env, params }) => {
    try {
      const session = await requireSession(request, env);
      await limitAction(env,session,"file-read",{limit:120,windowSeconds:60});
      const { file, object, access } = await readFile(env, session, Number(params.fileId));
      const headers = new Headers();
      headers.set("Content-Type", file.mime_type || "application/octet-stream");
      headers.set("Content-Disposition", "inline");
      headers.set("Cache-Control", "private, no-store");
      headers.set("X-Content-Type-Options","nosniff");
      if (object.httpEtag) headers.set("ETag", object.httpEtag);
      headers.set("X-ONM-File-Classification", String(access.classification||file.classification||"CONFIDENTIAL"));
      headers.set("X-ONM-File-Purpose", String(access.purposeCode||file.purpose_code||"MISSION_EXECUTION"));
      headers.set("X-ONM-File-Evidence-Type", String(access.evidenceType||file.evidence_type||"attachment"));
      return new Response(object.body, { status: 200, headers });
    } catch (e) { return fail(e); }
  });
}

function fail(e) {
  const status = e?.status || (e.message === "AUTH_REQUIRED" ? 401 : 500);
  return json({ success: false, error: e.message === "AUTH_REQUIRED" ? "Authentication required" : e.message==="TOO_MANY_ATTEMPTS" ? "Too many requests. Please wait briefly and try again." : e.message, details:e?.details||null }, status);
}
