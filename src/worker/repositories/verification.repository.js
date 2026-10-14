export async function getProfile(env,identityType,identityId){
  return env.DB.prepare(`
    SELECT * FROM verification_profiles
    WHERE identity_type=? AND identity_id=? LIMIT 1
  `).bind(identityType,identityId).first();
}

export async function ensureProfile(env,{identityType,identityId,email,phone,companyName,personName,companyId,countryCode}){
  await env.DB.prepare(`
    INSERT INTO verification_profiles (
      identity_type,identity_id,email_snapshot,phone_snapshot,company_name_snapshot,person_name_snapshot,company_id,country_code,declared_country_code,
      review_status,trust_level,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,'draft',0,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
    ON CONFLICT(identity_type,identity_id) DO UPDATE SET
      email_snapshot=COALESCE(excluded.email_snapshot,verification_profiles.email_snapshot),
      phone_snapshot=COALESCE(excluded.phone_snapshot,verification_profiles.phone_snapshot),
      company_name_snapshot=COALESCE(excluded.company_name_snapshot,verification_profiles.company_name_snapshot),
      person_name_snapshot=COALESCE(excluded.person_name_snapshot,verification_profiles.person_name_snapshot),
      company_id=COALESCE(excluded.company_id,verification_profiles.company_id),
      country_code=COALESCE(excluded.country_code,verification_profiles.country_code),
      updated_at=CURRENT_TIMESTAMP
  `).bind(identityType,identityId,email||null,phone||null,companyName||null,personName||null,companyId||null,countryCode||"ZZ",countryCode||"ZZ").run();

  const profile=await getProfile(env,identityType,identityId);
  for(const type of ["email","phone","company","country","identity"]){
    await env.DB.prepare(`
      INSERT OR IGNORE INTO verification_checks(profile_id,check_type,status,updated_at)
      VALUES (?,?,'pending',CURRENT_TIMESTAMP)
    `).bind(profile.id,type).run();
  }
  return getProfile(env,identityType,identityId);
}

export async function listChecks(env,profileId){
  const r=await env.DB.prepare(`
    SELECT check_type,status,method,verified_at,reviewer_note,updated_at
    FROM verification_checks WHERE profile_id=? ORDER BY id
  `).bind(profileId).all();
  return r.results||[];
}

export async function setCheck(env,profileId,type,{status,method,note}){
  return env.DB.prepare(`
    INSERT INTO verification_checks (
      profile_id,check_type,status,method,verified_at,reviewer_note,updated_at
    ) VALUES (?,?,?,?,CASE WHEN ?='verified' THEN CURRENT_TIMESTAMP ELSE NULL END,?,CURRENT_TIMESTAMP)
    ON CONFLICT(profile_id,check_type) DO UPDATE SET
      status=excluded.status,
      method=excluded.method,
      verified_at=CASE WHEN excluded.status='verified' THEN CURRENT_TIMESTAMP ELSE verification_checks.verified_at END,
      reviewer_note=excluded.reviewer_note,
      updated_at=CURRENT_TIMESTAMP
  `).bind(profileId,type,status,method||null,status,note||null).run();
}

export async function updateProfileContact(env,profileId,{email,phone,companyName}){
  return env.DB.prepare(`
    UPDATE verification_profiles SET
      email_snapshot=?,phone_snapshot=?,company_name_snapshot=?,updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).bind(email||null,phone||null,companyName||null,profileId).run();
}

export async function updateProfileAddress(env,profileId,{addressLine1,addressLine2,postalCode,city,region}){
  return env.DB.prepare(`
    UPDATE verification_profiles SET
      address_line1=?,address_line2=?,postal_code=?,city=?,region=?,updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).bind(addressLine1||null,addressLine2||null,postalCode||null,city||null,region||null,profileId).run();
}

export async function submitReview(env,profileId){
  return env.DB.prepare(`
    UPDATE verification_profiles
    SET review_status='pending',submitted_at=CURRENT_TIMESTAMP,reviewer_note=NULL,updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).bind(profileId).run();
}

export async function setReview(env,profileId,{status,trustLevel,note}){
  return env.DB.prepare(`
    UPDATE verification_profiles
    SET review_status=?,trust_level=?,reviewed_at=CURRENT_TIMESTAMP,reviewer_note=?,updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).bind(status,trustLevel,note||null,profileId).run();
}

export async function createEmailCode(env,profileId,codeHash,expiresAt){
  await env.DB.prepare(`
    UPDATE verification_email_codes SET used_at=CURRENT_TIMESTAMP
    WHERE profile_id=? AND used_at IS NULL
  `).bind(profileId).run();
  return env.DB.prepare(`
    INSERT INTO verification_email_codes(profile_id,code_hash,expires_at,created_at)
    VALUES (?,?,?,CURRENT_TIMESTAMP)
  `).bind(profileId,codeHash,expiresAt).run();
}

export async function findValidEmailCode(env,profileId,codeHash){
  return env.DB.prepare(`
    SELECT * FROM verification_email_codes
    WHERE profile_id=? AND code_hash=? AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP
    ORDER BY id DESC LIMIT 1
  `).bind(profileId,codeHash).first();
}

export async function consumeEmailCode(env,id){
  return env.DB.prepare(`UPDATE verification_email_codes SET used_at=CURRENT_TIMESTAMP WHERE id=?`).bind(id).run();
}

export async function getActiveTrustKey(env,profileId){
  return env.DB.prepare(`
    SELECT id,key_hint,status,issued_at,activated_at,suspended_at,revoked_at,expires_at
    FROM trust_keys
    WHERE profile_id=? AND status IN ('active','issued','suspended')
    ORDER BY id DESC LIMIT 1
  `).bind(profileId).first();
}

export async function findTrustKeyByHash(env,keyHash){
  return env.DB.prepare(`
    SELECT tk.*,vp.identity_type,vp.identity_id
    FROM trust_keys tk
    JOIN verification_profiles vp ON vp.id=tk.profile_id
    WHERE tk.key_hash=? LIMIT 1
  `).bind(keyHash).first();
}

export async function createTrustKey(env,profileId,{keyHash,keyHint,expiresAt}){
  await env.DB.prepare(`
    UPDATE trust_keys SET status='revoked',revoked_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
    WHERE profile_id=? AND status IN ('issued','active','suspended')
  `).bind(profileId).run();
  const result=await env.DB.prepare(`
    INSERT INTO trust_keys(profile_id,key_hash,key_hint,status,issued_at,expires_at,created_at,updated_at)
    VALUES (?,?,?,'issued',CURRENT_TIMESTAMP,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
  `).bind(profileId,keyHash,keyHint,expiresAt||null).run();
  return Number(result.meta.last_row_id);
}

export async function activateTrustKey(env,id){
  return env.DB.prepare(`
    UPDATE trust_keys
    SET status='active',activated_at=CURRENT_TIMESTAMP,suspended_at=NULL,updated_at=CURRENT_TIMESTAMP
    WHERE id=? AND status='issued'
  `).bind(id).run();
}

export async function setTrustKeyStatus(env,id,status){
  if(status==="active")return env.DB.prepare(`UPDATE trust_keys SET status='active',activated_at=COALESCE(activated_at,CURRENT_TIMESTAMP),suspended_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(id).run();
  const timeColumn=status==="suspended"?"suspended_at":status==="revoked"?"revoked_at":null;
  if(timeColumn)return env.DB.prepare(`UPDATE trust_keys SET status=?,${timeColumn}=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(status,id).run();
  return env.DB.prepare(`UPDATE trust_keys SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(status,id).run();
}

export async function addTrustEvent(env,trustKeyId,eventType,actorType,note){
  return env.DB.prepare(`
    INSERT INTO trust_key_events(trust_key_id,event_type,actor_type,note,created_at)
    VALUES (?,?,?,?,CURRENT_TIMESTAMP)
  `).bind(trustKeyId,eventType,actorType||"system",note||null).run();
}

export async function listPendingReviews(env){
  const r=await env.DB.prepare(`
    SELECT vp.*,
      GROUP_CONCAT(vc.check_type || ':' || vc.status, ',') AS checks
    FROM verification_profiles vp
    LEFT JOIN verification_checks vc ON vc.profile_id=vp.id
    WHERE vp.review_status='pending'
    GROUP BY vp.id
    ORDER BY vp.submitted_at ASC
  `).all();
  return r.results||[];
}

export async function findProfileById(env,id){
  return env.DB.prepare(`SELECT * FROM verification_profiles WHERE id=? LIMIT 1`).bind(id).first();
}
