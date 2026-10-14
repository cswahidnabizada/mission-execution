/* ON Mission 11.03.0 — Platform Admin Mission Query projection.
 * Mission-domain query only. Mission truth remains owned by missions.service/repository.
 * This file intentionally contains no mutation path and is invoked only after the
 * Platform Administrator boundary has been established by the caller.
 */
export async function searchMissionsForPlatformAdministrator(env,query,{limit=24}={}){
 const q=`%${String(query||'').replace(/[\u0000-\u001f]/g,' ').trim().slice(0,120)}%`;
 const max=Math.min(50,Math.max(1,Number(limit)||24));
 const result=await env.DB.prepare(`SELECT id,company_id,reference,status,country_code,sector_code,updated_at,created_at FROM missions WHERE reference LIKE ? OR country_code LIKE ? OR sector_code LIKE ? ORDER BY id DESC LIMIT ?`).bind(q,q,q,max).all();
 return result.results||[];
}

export async function getPlatformAdministratorMissionSummary(env){ const row=await env.DB.prepare(`SELECT COUNT(*) count FROM missions WHERE status NOT IN ('Completed','Cancelled')`).first(); return Number(row?.count||0); }

export async function getPlatformAdministratorMissionById(env,{companyId,missionId}={}){ const row=await env.DB.prepare(`SELECT id,company_id,reference,status,country_code,sector_code,updated_at,created_at FROM missions WHERE id=? AND company_id=? LIMIT 1`).bind(Number(missionId||0),Number(companyId||0)).first(); return row||null; }
