import {canonicalFirst} from '../core/canonical-db.js';
/**
 * ON Mission 10.31.79 — Canonical User Classification Core
 *
 * Identity/account/actor/role/membership/restriction facts only.
 * Readiness and authorization are derived above this layer.
 */

export async function ensurePlatformUser(env,session){
  const principalType=session?.identityType==='executor'||session?.role==='executor'?'executor':'tenant';
  const principalId=Number(session?.executorId||session?.identityId||0);
  if(!principalId)return null;
  const existing=await env.DB.prepare(`SELECT * FROM platform_users WHERE principal_type=? AND principal_id=? LIMIT 1`).bind(principalType,principalId).first();
  if(existing){
    const sourceActive=principalType==='executor'
      ? await canonicalFirst(env,`SELECT active,deleted_at FROM public_executor_identities WHERE id=? LIMIT 1`,[principalId],'user_classification')
      : await canonicalFirst(env,`SELECT active,deleted_at FROM auth_identities WHERE id=? LIMIT 1`,[principalId],'user_classification');
    if(sourceActive && (Number(sourceActive.active)!==1 || sourceActive.deleted_at) && existing.account_state==='active')
      await env.DB.prepare(`UPDATE platform_users SET account_state='deactivated',updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(existing.id).run();
    if(sourceActive && Number(sourceActive.active)===1 && !sourceActive.deleted_at && existing.account_state==='deactivated')
      await env.DB.prepare(`UPDATE platform_users SET account_state='active',updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(existing.id).run();
    await reconcileCanonicalMembership(env,existing,principalType,principalId);
    return env.DB.prepare(`SELECT * FROM platform_users WHERE id=? LIMIT 1`).bind(existing.id).first();
  }
  await env.DB.prepare(`INSERT OR IGNORE INTO platform_users(principal_type,principal_id,account_state) VALUES(?,?,?)`).bind(principalType,principalId,'active').run();
  const created=await env.DB.prepare(`SELECT * FROM platform_users WHERE principal_type=? AND principal_id=? LIMIT 1`).bind(principalType,principalId).first();
  if(created)await reconcileCanonicalMembership(env,created,principalType,principalId);
  return created;
}

async function reconcileCanonicalMembership(env,pu,principalType,principalId){
  if(!pu?.id)return;
  if(principalType==='executor'){
    await env.DB.prepare(`INSERT OR IGNORE INTO platform_user_actors(platform_user_id,actor_type,active,updated_at) VALUES(?, 'independent_executor',1,CURRENT_TIMESTAMP)`).bind(pu.id).run();
    await env.DB.prepare(`INSERT INTO platform_user_memberships(platform_user_id,membership_type,membership_id,status) VALUES(?, 'platform',NULL,'active') ON CONFLICT(platform_user_id,membership_type,membership_id) DO UPDATE SET status='active'`).bind(pu.id).run();
    return;
  }
  const ai=await canonicalFirst(env,`SELECT company_id,role,driver_id,active FROM auth_identities WHERE id=? LIMIT 1`,[principalId],'user_classification');
  if(!ai||Number(ai.active)!==1||!ai.company_id)return;
  const actor=ai.role==='driver'?'driver':'tenant';
  await env.DB.prepare(`INSERT OR IGNORE INTO platform_user_actors(platform_user_id,actor_type,active,updated_at) VALUES(?,?,1,CURRENT_TIMESTAMP)`).bind(pu.id,actor).run();
  await env.DB.prepare(`UPDATE platform_user_memberships SET status='inactive' WHERE platform_user_id=? AND membership_type='tenant' AND membership_id<>?`).bind(pu.id,Number(ai.company_id)).run();
  await env.DB.prepare(`INSERT INTO platform_user_memberships(platform_user_id,membership_type,membership_id,status) VALUES(?, 'tenant',?,'active') ON CONFLICT(platform_user_id,membership_type,membership_id) DO UPDATE SET status='active'`).bind(pu.id,Number(ai.company_id)).run();
}

export async function resolveIdentityClassification(env,session){
  const pu=await ensurePlatformUser(env,session);
  const actorRows=pu?(await env.DB.prepare(`SELECT actor_type FROM platform_user_actors WHERE platform_user_id=? AND active=1 ORDER BY id`).bind(pu.id).all()).results||[]:[];
  const roleRows=pu?(await env.DB.prepare(`SELECT role_code,scope_type,scope_id FROM platform_user_roles WHERE platform_user_id=? AND active=1 ORDER BY id`).bind(pu.id).all()).results||[]:[];
  const membershipRows=pu?(await env.DB.prepare(`SELECT membership_type,membership_id,status FROM platform_user_memberships WHERE platform_user_id=? AND status='active' ORDER BY id`).bind(pu.id).all()).results||[]:[];
  const restrictions=pu?((await env.DB.prepare(`SELECT restriction_code,reason,expires_at FROM platform_user_restrictions WHERE platform_user_id=? AND active=1 AND (expires_at IS NULL OR expires_at>CURRENT_TIMESTAMP) ORDER BY id`).bind(pu.id).all()).results||[]):[];
  const roles=roleRows.map(r=>r.role_code);
  const actor=deriveActor(session,actorRows);
  return Object.freeze({
    platformUserId:pu?.id||null,
    identity:Object.freeze({type:session?.identityType||'tenant',id:Number(session?.identityId||0),authenticated:Boolean(session)}),
    account:Object.freeze({state:pu?.account_state||'active',restricted:restrictions.length>0}),
    actor:Object.freeze({type:actor,roles:Object.freeze(roles),roleBindings:Object.freeze(roleRows)}),
    membership:Object.freeze(membershipRows),
    restrictions:Object.freeze(restrictions),
    source:'canonical_user_classification'
  });
}

function deriveActor(session,rows){
  if(rows.some(x=>x.actor_type==='driver')||session?.role==='driver')return 'driver';
  if(rows.some(x=>x.actor_type==='independent_executor')||session?.role==='executor')return 'independent_executor';
  if(rows.some(x=>x.actor_type==='tenant')||session?.role==='admin')return 'tenant';
  if(rows.some(x=>x.actor_type==='action_user'))return 'action_user';
  return 'read_only_user';
}
