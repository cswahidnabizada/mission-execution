import {json,cleanText} from "../../core/http.js";
import {requireAdmin} from "../../core/auth-session.js";
import {limitAction} from "../../security/action-limit.js";
import {missionReport} from "./reports.service.js";
export function registerReportRoutes(router){
  router.get("/api/reports/missions",async({request,env,url})=>{try{const s=await requireAdmin(request,env);await limitAction(env,s,"mission-report",{limit:20,windowSeconds:60});const from=cleanText(url.searchParams.get("from"),10),to=cleanText(url.searchParams.get("to"),10),type=cleanText(url.searchParams.get("type"),20).toLowerCase()||"company",entityId=Number(url.searchParams.get("entityId")||0),partnerType=cleanText(url.searchParams.get("partnerType"),20).toLowerCase();if(!["company","customer","network","driver","partner"].includes(type))return json({success:false,error:"Invalid report type"},400);return json({success:true,report:await missionReport(env,s,{from,to,type,entityId,partnerType})});}catch(e){return json({success:false,error:e?.message||"Report unavailable"},e?.status||500);}});
}
