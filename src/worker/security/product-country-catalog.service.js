const CODE=/^[A-Z]{2}$/;
const clean=(v,max=180)=>String(v??'').trim().slice(0,max);
const fail=(m,s=400,c)=>{const e=new Error(m);e.status=s;if(c)e.code=c;return e};
function codeOf(v){const c=clean(v,2).toUpperCase();if(!CODE.test(c)||c==='ZZ')throw fail('A valid ISO country code is required',422,'PRODUCT_COUNTRY_CODE_INVALID');return c}
export async function listProductCountries(env,{query='',limit=50,includeInactive=false}={}){
 const q=clean(query,120),n=Math.max(1,Math.min(250,Number(limit)||50)),like=`%${q.replace(/[%_]/g,'')}%`;
 const where=includeInactive?'1=1':'active=1';
 const sql=q?`SELECT code,name,active,requires_review,default_subscription_class,created_at,updated_at FROM platform_product_country_catalog WHERE ${where} AND (UPPER(code) LIKE UPPER(?) OR name LIKE ?) ORDER BY name ASC LIMIT ?`:`SELECT code,name,active,requires_review,default_subscription_class,created_at,updated_at FROM platform_product_country_catalog WHERE ${where} ORDER BY name ASC LIMIT ?`;
 const r=q?await env.DB.prepare(sql).bind(like,like,n).all():await env.DB.prepare(sql).bind(n).all();return r.results||[];
}
export async function getProductCountry(env,rawCode){const code=codeOf(rawCode);return env.DB.prepare(`SELECT * FROM platform_product_country_catalog WHERE code=? LIMIT 1`).bind(code).first()}
export async function createProductCountry(env,{code,name,defaultSubscriptionClass='eligible',requiresReview=true,dataEntryId=null}){
 const countryCode=codeOf(code),countryName=clean(name,120);if(!countryName)throw fail('Country name is required',422,'PRODUCT_COUNTRY_NAME_REQUIRED');
 const existingByEntry=dataEntryId?await env.DB.prepare(`SELECT * FROM platform_product_country_catalog WHERE data_entry_id=? LIMIT 1`).bind(String(dataEntryId)).first():null;if(existingByEntry)return {created:false,alreadyExists:true,country:existingByEntry};
 const existing=await getProductCountry(env,countryCode);if(existing)return {created:false,alreadyExists:true,country:existing};
 await env.DB.prepare(`INSERT INTO platform_product_country_catalog(code,name,active,requires_review,default_subscription_class,data_entry_id) VALUES(?,?,1,?,?,?)`).bind(countryCode,countryName,requiresReview?1:0,defaultSubscriptionClass==='exempt'?'exempt':'eligible',dataEntryId==null?null:String(dataEntryId)).run();
 return {created:true,alreadyExists:false,country:await getProductCountry(env,countryCode)};
}
export async function setProductCountryActive(env,rawCode,active=true){const code=codeOf(rawCode);const country=await getProductCountry(env,code);if(!country)throw fail('Product country does not exist',404,'PRODUCT_COUNTRY_NOT_FOUND');if(!active){const live=await env.DB.prepare(`SELECT id FROM country_product_launches WHERE country_code=? AND status='active' AND active=1 LIMIT 1`).bind(code).first();if(live)throw fail('A live product exists for this country. Retire the product before deactivating its product country.',409,'PRODUCT_COUNTRY_LIVE');}await env.DB.prepare(`UPDATE platform_product_country_catalog SET active=?,updated_at=CURRENT_TIMESTAMP WHERE code=?`).bind(active?1:0,code).run();return getProductCountry(env,code)}

export async function updateProductCountry(env,actor,rawCode,input={}){
 const code=codeOf(rawCode||input.code);const current=await getProductCountry(env,code);if(!current)throw fail('PRODUCT_COUNTRY_NOT_FOUND',404,'PRODUCT_COUNTRY_NOT_FOUND');
 const dataEntryId=input.dataEntryId==null?null:String(input.dataEntryId);
 if(dataEntryId&&String(current.data_entry_id||'')===dataEntryId)return {created:false,alreadyExists:true,country:current};
 const expectedUpdatedAt=input.expectedUpdatedAt==null?null:String(input.expectedUpdatedAt);
 if(expectedUpdatedAt&&String(current.updated_at||'')!==expectedUpdatedAt)throw fail('DATA_STUDIO_STALE_RECORD',409,'DATA_STUDIO_STALE_RECORD');
 const name=clean(input.name,120)||current.name;const defaultSubscriptionClass=input.defaultSubscriptionClass??input.default_subscription_class??current.default_subscription_class;
 const requiresReview=input.requiresReview===undefined?(Number(current.requires_review)!==0):input.requiresReview!==false;
 const params=[name,requiresReview?1:0,defaultSubscriptionClass==='exempt'?'exempt':'eligible'];let sql=`UPDATE platform_product_country_catalog SET name=?,requires_review=?,default_subscription_class=?`;
 if(dataEntryId){sql+=`,data_entry_id=?`;params.push(dataEntryId)}
 sql+=`,updated_at=CURRENT_TIMESTAMP WHERE code=?`;params.push(code);if(expectedUpdatedAt){sql+=' AND updated_at=?';params.push(expectedUpdatedAt)}
 const result=await env.DB.prepare(sql).bind(...params).run();if(expectedUpdatedAt&&Number(result.meta?.changes||result.changes||0)!==1)throw fail('DATA_STUDIO_STALE_RECORD',409,'DATA_STUDIO_STALE_RECORD');
 return getProductCountry(env,code);
}
