const SUBJECTS=new Set(["tenant_admin","independent_executor"]);
const PLAN_CODES=new Set(["free","executor","starter","business"]);
const COUNTRY=/^[A-Z]{2}$/;
function cleanCountry(v,{allowOther=false}={}){const x=String(v||"").trim().toUpperCase();if(!COUNTRY.test(x)||(x==="ZZ"&&!allowOther))throw bad(allowOther?"A valid country code is required":"A real ISO country code is required");return x;}
function cleanText(v,max){return String(v??"").trim().slice(0,max);}
function num(v,def=null,min=0,max=100000000){if(v===null||v===undefined||v==="")return def;const n=Number(v);if(!Number.isFinite(n)||n<min||n>max)throw bad("Invalid numeric policy value");return Math.floor(n);}
function bit(v){return v===true||v===1||v==="1"?1:0;}
function bad(m,s=400){const e=new Error(m);e.status=s;return e;}
export async function listCountries(env,{query="",limit=8,includeInactive=false}={}){
 const q=String(query||"").trim();
 const n=Math.max(1,Math.min(25,Number(limit)||8));
 const like=`%${q.replace(/[%_]/g,"")}%`;
 const activeClause=includeInactive?'':'active=1 AND ';
 const sql=q
  ? `SELECT code,name,active,requires_review,default_subscription_class,created_at,updated_at FROM country_catalog WHERE ${activeClause}(UPPER(code) LIKE UPPER(?) OR name LIKE ? ) ORDER BY datetime(updated_at) DESC,datetime(created_at) DESC,name ASC LIMIT ?`
  : `SELECT code,name,active,requires_review,default_subscription_class,created_at,updated_at FROM country_catalog WHERE ${includeInactive?'1=1':'active=1'} ORDER BY datetime(updated_at) DESC,datetime(created_at) DESC,name ASC LIMIT ?`;
 const args=q?[like,like,n]:[n];
 const r=await env.DB.prepare(sql).bind(...args).all();
 return r.results||[];
}
export async function getCountry(env,code){const c=cleanCountry(code);return env.DB.prepare(`SELECT * FROM country_catalog WHERE code=? LIMIT 1`).bind(c).first();}
export async function setCountryActive(env,code,active=true){
 const c=cleanCountry(code);
 const row=await getCountry(env,c);
 if(!row)throw bad('Country does not exist',404);
 await env.DB.prepare(`UPDATE country_catalog SET active=?,updated_at=CURRENT_TIMESTAMP WHERE code=?`).bind(bit(active),c).run();
 return getCountry(env,c);
}
export async function createCountry(env,{code,name,defaultSubscriptionClass="eligible",requiresReview=true,rules=[]}){
 const countryCode=cleanCountry(code);const countryName=cleanText(name,120);if(!countryName)throw bad("Country name is required");
 const cls=defaultSubscriptionClass==="exempt"?"exempt":"eligible";
 const existing=await getCountry(env,countryCode);
 if(existing){
   const normalized=Array.isArray(rules)?rules:[];
   for(const rule of normalized)await upsertCountryPolicy(env,countryCode,rule);
   return {created:false,alreadyExists:true,country:await getCountry(env,countryCode),policies:await listCountryPolicies(env,countryCode)};
 }
 await env.DB.prepare(`INSERT INTO country_catalog(code,name,active,requires_review,default_subscription_class) VALUES(?,?,1,?,?)`).bind(countryCode,countryName,bit(requiresReview),cls).run();
 const normalized=Array.isArray(rules)?rules:[];if(!normalized.length)throw bad("At least one canonical country policy rule is required");
 for(const rule of normalized)await upsertCountryPolicy(env,countryCode,rule);
 return {created:true,alreadyExists:false,country:await getCountry(env,countryCode),policies:await listCountryPolicies(env,countryCode)};
}
export async function listCountryPolicies(env,code){const c=cleanCountry(code);const r=await env.DB.prepare(`SELECT * FROM subscription_policies WHERE country_code=? AND active=1 ORDER BY subject_type,plan_code,id`).bind(c).all();return r.results||[];}
export async function upsertCountryPolicy(env,countryCode,rule){
 const c=cleanCountry(countryCode),subject=String(rule.subjectType||"").trim();if(!SUBJECTS.has(subject))throw bad("Unsupported subject type");
 const plan=String(rule.planCode||"").trim().toLowerCase();if(!PLAN_CODES.has(plan))throw bad("Unsupported plan code");
 const mode=rule.billingMode==="free"?"free":"paid", cls=rule.subscriptionClass==="exempt"?"exempt":"eligible";
 const values=[subject,c,plan,mode,num(rule.billingPeriodDays,30,1,3660),num(rule.graceDays,7,0,366),bit(rule.verificationRequired!==false),num(rule.maxDrivers,null),num(rule.maxMissionsPeriod,null),num(rule.maxStorageMb,null),bit(rule.publicMissionsEnabled),cls,bit(rule.canCreateMissions),bit(rule.canCreateDrivers),bit(rule.canShareForYou),bit(rule.canRequestForYou),bit(rule.canShareNetwork),bit(rule.canAcceptNetwork)];
 await env.DB.prepare(`INSERT INTO subscription_policies(subject_type,country_code,plan_code,billing_mode,billing_period_days,grace_days,verification_required,max_drivers,max_missions_period,max_storage_mb,public_missions_enabled,subscription_class,can_create_missions,can_create_drivers,can_share_foryou,can_request_foryou,can_share_network,can_accept_network) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(subject_type,country_code,plan_code) DO UPDATE SET billing_mode=excluded.billing_mode,billing_period_days=excluded.billing_period_days,grace_days=excluded.grace_days,verification_required=excluded.verification_required,max_drivers=excluded.max_drivers,max_missions_period=excluded.max_missions_period,max_storage_mb=excluded.max_storage_mb,public_missions_enabled=excluded.public_missions_enabled,subscription_class=excluded.subscription_class,can_create_missions=excluded.can_create_missions,can_create_drivers=excluded.can_create_drivers,can_share_foryou=excluded.can_share_foryou,can_request_foryou=excluded.can_request_foryou,can_share_network=excluded.can_share_network,can_accept_network=excluded.can_accept_network,active=1,updated_at=CURRENT_TIMESTAMP`).bind(...values).run();
 return listCountryPolicies(env,c);
}
export async function setVerifiedCountry(env,profileId,countryCode,note=""){
 const c=cleanCountry(countryCode,{allowOther:true});const profile=await env.DB.prepare(`SELECT id,identity_type,identity_id,declared_country_code FROM verification_profiles WHERE id=? LIMIT 1`).bind(Number(profileId)).first();if(!profile)throw bad("Verification profile not found",404);
 await env.DB.prepare(`UPDATE verification_profiles SET verified_country_code=?,country_code=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(c,c,Number(profileId)).run();
 if(profile.identity_type==="tenant") await env.DB.prepare(`UPDATE company_verification_status SET country_code=? WHERE company_id=?`).bind(c,Number(profile.identity_id)).run();
 if(profile.identity_type==="executor") await env.DB.prepare(`UPDATE public_executor_profiles SET country_code=? WHERE executor_id=?`).bind(c,Number(profile.identity_id)).run();
 return {profileId:Number(profileId),declaredCountryCode:profile.declared_country_code||null,verifiedCountryCode:c,note:cleanText(note,500)};
}
export async function getCountryVerification(env,profileId){return env.DB.prepare(`SELECT declared_country_code,verified_country_code FROM verification_profiles WHERE id=?`).bind(Number(profileId)).first();}
