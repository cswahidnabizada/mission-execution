import {json} from '../../core/http.js';
import {requireSession} from '../../core/auth-session.js';
import {requirePlatformAdministrator} from '../../security/platform-administrator.js';
import {limitAction} from '../../security/action-limit.js';
import {getForSession} from '../../modules/missions/missions.service.js';
import {getAgentMissionOutcomeHistory} from './mission-outcome-history.service.js';

function fail(e){return json({success:false,error:e?.message||'Agent mission history unavailable',code:e?.code||e?.message||'AGENT_HISTORY_UNAVAILABLE'},e?.status||500);}

export function registerAgenticHistoryRoutes(router){
  router.get(/^\/api\/agent\/history\/missions\/(?<missionId>\d+)$/,async({request,env,params})=>{
    try{
      const session=await requireSession(request,env);
      const missionId=Number(params.missionId||0);
      await limitAction(env,session,'agent-history-read',{limit:60,windowSeconds:60});
      const mission=await getForSession(env,session,missionId);
      if(!mission)throw Object.assign(new Error('Mission not found or access denied'),{status:404,code:'MISSION_NOT_FOUND'});
      const u=new URL(request.url);
      const history=await getAgentMissionOutcomeHistory(env,{companyId:Number(mission.company_id),missionId,limit:u.searchParams.get('limit')});
      return json({success:true,version:history.version,history});
    }catch(e){return fail(e);}
  });

  router.get(/^\/api\/platform\/admin\/agentic-control\/missions\/(?<missionId>\d+)\/history$/,async({request,env,params})=>{
    try{
      await requirePlatformAdministrator(request,env);
      const missionId=Number(params.missionId||0);
      const u=new URL(request.url);
      const history=await getAgentMissionOutcomeHistory(env,{companyId:Number(u.searchParams.get('companyId')||0),missionId,limit:u.searchParams.get('limit')});
      return json({success:true,version:history.version,history});
    }catch(e){return fail(e);}
  });
}
