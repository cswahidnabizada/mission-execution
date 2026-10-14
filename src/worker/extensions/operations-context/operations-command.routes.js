import {json} from "../../core/http.js";
import {requireAdmin} from "../../core/auth-session.js";
import {limitAction} from "../../security/action-limit.js";
import {attentionForSession} from "../../modules/attention/attention.service.js";
import {buildFocusQueue} from "../../modules/intelligence/focus.engine.js";
import {listForSession} from "../../modules/missions/missions.service.js";

/**
 * V3.8 Operational Command Context.
 * Composition only: existing truth, intelligence, liveness and action authorities remain authoritative.
 * This route creates a tenant-scoped command projection for the Operations Command Center.
 */
export function registerOperationsCommandRoutes(router){
  router.get("/api/operations/command",async({request,env,url})=>{
    try{
      const session=await requireAdmin(request,env);
      await limitAction(env,session,"operations-command-read",{limit:60,windowSeconds:60});
      const requested=Math.max(10,Math.min(Number(url.searchParams.get("limit"))||50,100));
      const includeMissionCatalog=url.searchParams.get("includeMissions")==="1";
      const [result,driversResult,requestsResult,custodyResult,missionCatalogResult]=await Promise.allSettled([
        attentionForSession(env,session,{limit:Math.min(requested,50)}),
        env.DB.prepare("SELECT COUNT(*) AS total,SUM(CASE WHEN active=1 THEN 1 ELSE 0 END) AS active FROM drivers WHERE company_id=?").bind(Number(session.tenantId)).first(),
        env.DB.prepare("SELECT COUNT(*) AS pending FROM public_mission_requests WHERE company_id=? AND status='Pending'").bind(Number(session.tenantId)).first(),
        env.DB.prepare("SELECT COUNT(*) AS count FROM mission_custody_cases WHERE company_id=? AND status IN ('open','awaiting_release','ready_to_transfer','awaiting_acceptance')").bind(Number(session.tenantId)).first(),
        includeMissionCatalog ? listForSession(env,session,{limit:5000,offset:0}) : Promise.resolve(null)
      ]);
      const resultValue=result.status==="fulfilled"?result.value:{items:[],summary:{critical:0,attention:0,watch:0,total:0},focus:null,intelligence:null};
      const driversRow=driversResult.status==="fulfilled"?driversResult.value:null;
      const requestsRow=requestsResult.status==="fulfilled"?requestsResult.value:null;
      const custodyRow=custodyResult.status==="fulfilled"?custodyResult.value:null;
      const missionCatalog=missionCatalogResult.status==="fulfilled"?missionCatalogResult.value:null;
      const degraded=[
        result.status!=="fulfilled"?"attention":null,
        driversResult.status!=="fulfilled"?"drivers":null,
        requestsResult.status!=="fulfilled"?"requests":null,
        custodyResult.status!=="fulfilled"?"custody":null,
        missionCatalogResult.status!=="fulfilled"?"missions":null
      ].filter(Boolean);
      const items=Array.isArray(resultValue?.items)?resultValue.items:[];
      const active=Number(resultValue?.intelligence?.awareness?.active||0);
      const critical=Number(resultValue?.summary?.critical||0);
      const attention=Number(resultValue?.summary?.attention||0);
      const watch=Number(resultValue?.summary?.watch||0);
      const waiting=items.filter(x=>["waiting","WAITING"].includes(String(x?.flow?.state||x?.health?.state||""))).length;
      const actionRequired=items.filter(x=>["critical","attention"].includes(String(x?.level||""))).length;
      const atRisk=Math.max(0,watch);
      const focus=resultValue?.focus||resultValue?.intelligence?.focus||null;
      const focusQueue=buildFocusQueue(items,{role:session.role}).map(item=>({
        ...item,
        workState:String(item.workState|| (item.actionable?"ACTION_REQUIRED":"WAITING")),
        responsible:String(item.responsible|| (item.actionable?"Operations team":"Responsible external actor / event")),
        responsibleKind:String(item.responsibleKind|| (item.actionable?"operator":"external")),
        dependency:String(item.dependency|| (item.blocking?String(item.reason||"Blocking dependency"):(item.actionable?"Operational follow-up":"Awaiting valid predecessor or external event"))),
        dependencyKind:String(item.dependencyKind|| (item.blocking?"blocking":"operational")),
        impact:String(item.impact|| (item.criticalImpact?"Critical operational impact":item.blocking?"Progress is blocked":item.actionable?"Intervention can improve progress":"No operator action currently required"))
      }));
      const work=items.map(x=>({
        missionId:Number(x.missionId),
        reference:String(x.reference||`Mission ${x.missionId}`),
        status:String(x.status||"Pending"),
        statusLabel:String(x.statusLabel||x.status||"Pending"),
        level:String(x.level||"watch"),
        score:Number(x.score||0),
        reason:String(x.reasons?.[0]?.label||"Operational signal requires review."),
        reasonCode:String(x.reasons?.[0]?.code||"attention"),
        liveness:String(x.health?.state||x.flow?.state||"unknown"),
        deadlineAtUtc:x.deadlineAtUtc||null,
        stateToken:x.stateToken||null,
        priorityRank:Number(x.score||0),
        impact:String(x.level)==="critical"?"Immediate operational impact":String(x.level)==="attention"?"Progress may be affected":"Monitor before it becomes blocking"
      }));
      work.sort((a,b)=>b.score-a.score||Date.parse(a.deadlineAtUtc||0)-Date.parse(b.deadlineAtUtc||0));
      return json({
        success:true,
        version:"4.1.0",
        generatedAt:new Date().toISOString(),
        health:degraded.length?"degraded":"ready",
        degraded,
        pulse:{active,actionRequired,atRisk,waiting,onTrack:Math.max(0,active-actionRequired-atRisk),signals:critical+attention+watch},
        focus:focus?{available:Boolean(focus.available),missionId:Number(focus.missionId||0)||null,reference:String(focus.reference||""),title:String(focus.title||focus.task||""),reason:String(focus.reason||""),priority:focus.priority||"none",score:Number(focus.score||0),reasonCode:focus.reasonCode||null,actionable:Boolean(focus.actionable)}:{available:false,missionId:null,reference:"",title:"",reason:"",priority:"none",score:0,actionable:false},
        focusQueue:focusQueue.slice(0,50),
        work:work.slice(0,Math.min(requested,50)),
        summary:resultValue?.summary||{critical,attention,watch,total:items.length},
        awareness:resultValue?.intelligence?.awareness||null,
        events:Array.isArray(resultValue?.intelligence?.events)?resultValue.intelligence.events.slice(0,8):[],
        people:{driversTotal:Number(driversRow?.total||0),driversActive:Number(driversRow?.active||0)},
        collaboration:{pendingForYou:Number(requestsRow?.pending||0)},
        custody:{activeCases:Number(custodyRow?.count||0)},
        missions:includeMissionCatalog ? (missionCatalog||[]).map(m=>({
          id:Number(m.id),reference:String(m.reference||`Mission ${m.id}`),status:String(m.status||"Pending"),
          mission_date:m.mission_date||null,updated_at:m.updated_at||m.updatedAt||null,created_at:m.created_at||m.createdAt||null,
          deadline_at_utc:m.deadline_at_utc||m.deadlineAtUtc||null,deadline_at:m.deadline_at||m.deadlineAt||null,
          company_name:m.company_name||m.owner_company_name||null,owner_company_name:m.owner_company_name||m.company_name||null,
          driver_name:m.driver_name||null,executor_name:m.executor_name||null,executing_tenant_name:m.executing_tenant_name||null,
          executing_tenant_driver_name:m.executing_tenant_driver_name||null,public_enabled:Number(m.public_enabled||0),shared_access:Number(m.shared_access||0),
          state_version:Number(m.state_version||m.mission_state_version||0)||null,pickup_address:m.pickup_address||null,delivery_address:m.delivery_address||null
        })) : undefined
      });
    }catch(e){
      return json({success:false,error:e?.message||"Operational command unavailable"},e?.status||500);
    }
  });
}
