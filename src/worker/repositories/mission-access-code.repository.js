const ALPHABET='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function normalizeAccessCode(code){return String(code||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,32);}

export async function hashAccessCode(code){
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(normalizeAccessCode(code)));
  return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
}

export function generateAccessCode(){
  const bytes=crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes,b=>ALPHABET[b%ALPHABET.length]).join('');
}

export async function issueMissionAccessCode(env,{missionId,ownerCompanyId,identityId,expiresAt=null}={}){
  const code=generateAccessCode();
  const hash=await hashAccessCode(code);
  const storedHash=hash;
  await env.DB.batch([
    env.DB.prepare(`UPDATE mission_access_codes SET status='revoked',updated_at=CURRENT_TIMESTAMP WHERE mission_id=? AND owner_company_id=? AND status='active'`).bind(Number(missionId),Number(ownerCompanyId)),
    env.DB.prepare(`INSERT INTO mission_access_codes(mission_id,owner_company_id,code_hash,code_version,status,expires_at,created_by_identity_id) VALUES(?,?,?,1,'active',?,?)`).bind(Number(missionId),Number(ownerCompanyId),storedHash,expiresAt,identityId?Number(identityId):null),
    env.DB.prepare(`UPDATE missions SET public_enabled=0 WHERE id=? AND company_id=?`).bind(Number(missionId),Number(ownerCompanyId))
  ]);
  return {code,version:1,expiresAt};
}

export async function revokeMissionAccessCode(env,{missionId,ownerCompanyId}={}){
  await env.DB.prepare(`UPDATE mission_access_codes SET status='revoked',updated_at=CURRENT_TIMESTAMP WHERE mission_id=? AND owner_company_id=? AND status='active'`).bind(Number(missionId),Number(ownerCompanyId)).run();
  return {revoked:true};
}

export async function resolveMissionByAccessCode(env,code){
  const normalized=normalizeAccessCode(code);
  if(normalized.length<8)return null;
  const hash=await hashAccessCode(normalized);
  const row=await env.DB.prepare(`SELECT id,mission_id,owner_company_id,code_hash,expires_at FROM mission_access_codes WHERE status='active' AND code_hash=? LIMIT 1`).bind(hash).first();
  if(row){
    const candidate=hash;
    if(candidate!==String(row.code_hash||''))return null;
    if(row.expires_at && Date.parse(String(row.expires_at).replace(' ','T'))<=Date.now()){
      await env.DB.prepare(`UPDATE mission_access_codes SET status='expired',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='active'`).bind(Number(row.id)).run();
      return null;
    }
    await env.DB.prepare(`UPDATE mission_access_codes SET last_used_at=CURRENT_TIMESTAMP,use_count=use_count+1 WHERE id=? AND status='active'`).bind(Number(row.id)).run();
    const mission=await env.DB.prepare(`SELECT m.*,c.name AS owner_company_name FROM mission_canonical_projection m JOIN companies c ON c.id=m.company_id WHERE m.id=? AND m.company_id=? AND m.status NOT IN ('Completed','Cancelled','Canceled','Closed') LIMIT 1`).bind(Number(row.mission_id),Number(row.owner_company_id)).first();
    if(!mission)return null;
    return {mission,codeId:Number(row.id)};
  }
  return null;
}
