export async function createResetToken(env,{identityType,identityId,tokenHash,expiresAt}){
  await env.DB.prepare(`DELETE FROM password_reset_tokens WHERE identity_type=? AND identity_id=? AND used_at IS NULL`).bind(identityType,identityId).run();
  const r=await env.DB.prepare(`INSERT INTO password_reset_tokens (identity_type,identity_id,token_hash,expires_at,created_at) VALUES (?,?,?,?,CURRENT_TIMESTAMP)`)
    .bind(identityType,identityId,tokenHash,expiresAt).run();
  return Number(r.meta.last_row_id);
}
export async function findValidResetToken(env,tokenHash){
  return env.DB.prepare(`SELECT * FROM password_reset_tokens WHERE token_hash=? AND used_at IS NULL AND datetime(expires_at)>datetime('now') LIMIT 1`).bind(tokenHash).first();
}
export async function markResetUsed(env,id){return env.DB.prepare(`UPDATE password_reset_tokens SET used_at=CURRENT_TIMESTAMP WHERE id=? AND used_at IS NULL`).bind(id).run();}
