import {json,readJson,publicErrorMessage} from "../../core/http.js";
import {requireSession} from "../../core/auth-session.js";
import {limitAction} from "../../security/action-limit.js";
import {getForSession} from "../../modules/missions/missions.service.js";
import {listMissionExceptions} from "../../modules/attention/attention.service.js";
import {unifiedActionForMission} from "./unified-action.service.js";

export function registerUnifiedActionRoutes(router){
  router.get(/^\/api\/unified-actions\/missions\/(?<missionId>\d+)$/,async({request,env,params})=>{
    try{
      const session=await requireSession(request,env);
      await limitAction(env,session,"unified-action-read",{limit:180,windowSeconds:60});
      const item=await one(env,session,Number(params.missionId));
      if(!item)return json({success:false,error:"Mission not found or access denied"},404);
      return json({success:true,...item});
    }catch(e){return fail(e);}
  });

  router.post("/api/unified-actions/batch",async({request,env})=>{
    try{
      const session=await requireSession(request,env);
      await limitAction(env,session,"unified-action-batch",{limit:60,windowSeconds:60});
      const body=await readJson(request);
      const ids=[...new Set((Array.isArray(body.missionIds)?body.missionIds:[]).map(Number).filter(Number.isFinite))].slice(0,25);
      const rows=await mapLimit(ids,4,id=>one(env,session,id).catch(error=>({missionId:id,error:publicErrorMessage(error,"Unavailable")})));
      const actions={};
      for(const row of rows)if(row?.missionId)actions[row.missionId]=row.surface||null;
      return json({success:true,actions});
    }catch(e){return fail(e);}
  });
}
async function one(env,session,missionId){
  const mission=await getForSession(env,session,missionId);
  if(!mission)return null;
  const exceptions=await listMissionExceptions(env,session,missionId);
  const {surface,problems}=await unifiedActionForMission(env,session,mission,{exceptions});
  if(problems.length)console.warn("UNIFIED_ACTION_CONTRACT_VIOLATION",{missionId,problems});
  return {missionId,surface,problems};
}
async function mapLimit(items,limit,fn){
  const out=new Array(items.length),workers=[];
  let cursor=0;
  async function worker(){
    while(cursor<items.length){
      const i=cursor++;
      out[i]=await fn(items[i]);
    }
  }
  for(let i=0;i<Math.min(limit,items.length);i++)workers.push(worker());
  await Promise.all(workers);
  return out;
}
function fail(e){
  const status=e?.status||(e?.message==="AUTH_REQUIRED"?401:e?.message==="FORBIDDEN"?403:500);
  return json({success:false,error:publicErrorMessage(e,"Unified Actions unavailable")},status);
}
