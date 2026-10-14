const clean=(v,max=500)=>String(v??'').trim().slice(0,max);
const arr=v=>Array.isArray(v)?[...new Set(v.map(x=>clean(x,120)).filter(Boolean))]:[];
const fail=(m,s=400,c)=>{const e=new Error(m);e.status=s;if(c)e.code=c;return e};
const json=(v,f)=>{try{return JSON.parse(String(v??'null'))??f}catch{return f}};

export const BLUEPRINT_CONTENT_TEMPLATES=[
 ['product-name','Product name','Display name for this country product.',true],
 ['welcome','Welcome text','Localized welcome/onboarding text shown to users.',true],
 ['legal-notice','Legal notice','Country-specific legal notice reference/content.',true],
 ['privacy-notice','Privacy notice','Country-specific privacy/data protection content reference.',true],
 ['terms','Terms','Country/sector terms reference.',true],
 ['support','Support text','Localized support/contact guidance.',false],
 ['empty-state','Empty state','Localized empty-state guidance for key product surfaces.',false]
];
export const BLUEPRINT_DEFAULT_LANGUAGES=[['en','English',false],['de','German',false],['fr','French',false],['nl','Dutch',false],['es','Spanish',false],['it','Italian',false]];

export async function listCountryBlueprints(env,{query='',status=null,limit=50}={}){
 const q=clean(query,120),n=Math.min(100,Math.max(1,Number(limit)||50));
 const where=[],args=[];
 if(q){where.push('(UPPER(b.country_code) LIKE UPPER(?) OR b.name LIKE ? OR b.default_language_code LIKE UPPER(?))');const like=`%${q.replace(/[%_]/g,'')}%`;args.push(like,like,like)}
 if(status){where.push('b.status=?');args.push(clean(status,30))}
 const sql=`SELECT b.*,c.name country_name FROM platform_country_product_blueprints b JOIN platform_product_country_catalog c ON c.code=b.country_code ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY datetime(b.updated_at) DESC,b.id DESC LIMIT ?`;
 const r=await env.DB.prepare(sql).bind(...args,n).all();return (r.results||[]).map(normalizeBlueprint);
}
export async function getCountryBlueprint(env,id){
 const b=await env.DB.prepare(`SELECT b.*,c.name country_name FROM platform_country_product_blueprints b JOIN platform_product_country_catalog c ON c.code=b.country_code WHERE b.id=? LIMIT 1`).bind(Number(id)).first();
 if(!b)return null;return hydrateBlueprint(env,normalizeBlueprint(b));
}
export async function createCountryBlueprint(env,actor,{countryCode,name,defaultLanguageCode='en',notes='',dataEntryId=null}){
 const code=clean(countryCode,2).toUpperCase();const country=await env.DB.prepare(`SELECT code,name,active FROM platform_product_country_catalog WHERE code=? LIMIT 1`).bind(code).first();
 if(!country)throw fail('Country does not exist',404,'COUNTRY_NOT_FOUND');if(Number(country.active)!==1)throw fail('Country is inactive',422,'COUNTRY_INACTIVE');
 if(dataEntryId){const fenced=await env.DB.prepare(`SELECT id FROM platform_country_product_blueprints WHERE data_entry_id=? LIMIT 1`).bind(String(dataEntryId)).first();if(fenced)return getCountryBlueprint(env,fenced.id);}
 const exists=await env.DB.prepare(`SELECT id FROM platform_country_product_blueprints WHERE country_code=? AND status IN ('draft','researching','preparing','ready') ORDER BY id DESC LIMIT 1`).bind(code).first();
 if(exists) return getCountryBlueprint(env,exists.id);
 const result=await env.DB.prepare(`INSERT INTO platform_country_product_blueprints(country_code,name,status,default_language_code,notes,created_by_type,created_by_id,data_entry_id) VALUES(?,?,?,?,?,?,?,?)`).bind(code,clean(name,180)||`${country.name} Product Data`, 'draft',clean(defaultLanguageCode,20)||'en',clean(notes,2000),actor.role,actor.id||null,dataEntryId==null?null:String(dataEntryId)).run();
 const id=result.meta?.last_row_id||result.last_row_id;await seedBlueprint(env,id,code,defaultLanguageCode);return getCountryBlueprint(env,id);
}
async function seedBlueprint(env,id,code,defaultLanguageCode){
 const stmts=[];
 for(const [c,n,d,r] of BLUEPRINT_CONTENT_TEMPLATES)stmts.push(env.DB.prepare(`INSERT OR IGNORE INTO platform_country_product_contents(blueprint_id,content_key,category,title,body,required,status) VALUES(?,?,?,?,?,?,?)`).bind(id,c,c==='legal-notice'||c==='privacy-notice'||c==='terms'?'legal':'experience',n,'',r?1:0,'missing'));
 for(const [code0,name] of BLUEPRINT_DEFAULT_LANGUAGES)stmts.push(env.DB.prepare(`INSERT OR IGNORE INTO platform_country_product_languages(blueprint_id,language_code,language_name,is_primary,enabled) VALUES(?,?,?,?,1)`).bind(id,code0,name,code0===String(defaultLanguageCode||'en')?1:0));
 await env.DB.batch(stmts);
}
export async function updateCountryBlueprint(env,actor,id,input={}){
 const numericId=Number(id);
 const row=await env.DB.prepare(`SELECT id,updated_at FROM platform_country_product_blueprints WHERE id=? LIMIT 1`).bind(numericId).first();if(!row)throw fail('Country blueprint not found',404);
 const dataEntryId=input.dataEntryId==null?null:String(input.dataEntryId);
 if(dataEntryId){const fenced=await env.DB.prepare(`SELECT id FROM platform_country_product_blueprints WHERE id=? AND data_entry_id=? LIMIT 1`).bind(numericId,dataEntryId).first();if(fenced)return getCountryBlueprint(env,numericId);}
 const expectedUpdatedAt=input.expectedUpdatedAt==null?null:String(input.expectedUpdatedAt);
 if(expectedUpdatedAt&&String(row.updated_at||'')!==expectedUpdatedAt)throw fail('DATA_STUDIO_STALE_RECORD',409,'DATA_STUDIO_STALE_RECORD');
 const fields=[],args=[];for(const [k,col,max] of [['name','name',180],['notes','notes',4000],['defaultLanguageCode','default_language_code',20]]){if(input[k]!==undefined){fields.push(`${col}=?`);args.push(clean(input[k],max))}}
 if(input.status!==undefined){const s=clean(input.status,30);if(!['draft','researching','preparing','ready','archived'].includes(s))throw fail('Invalid blueprint status');fields.push('status=?');args.push(s)}
 if(dataEntryId) {fields.push('data_entry_id=?');args.push(dataEntryId)}
 if(fields.length){fields.push('updated_at=CURRENT_TIMESTAMP');const where=['id=?'];const whereArgs=[numericId];if(expectedUpdatedAt){where.push('updated_at=?');whereArgs.push(expectedUpdatedAt)}const result=await env.DB.prepare(`UPDATE platform_country_product_blueprints SET ${fields.join(',')} WHERE ${where.join(' AND ')}`).bind(...args,...whereArgs).run();if(expectedUpdatedAt&&Number(result.meta?.changes||result.changes||0)!==1)throw fail('DATA_STUDIO_STALE_RECORD',409,'DATA_STUDIO_STALE_RECORD')}
 return getCountryBlueprint(env,id);
}
export async function addBlueprintLanguage(env,actor,id,{languageCode,languageName,isPrimary=false}){const code=clean(languageCode,20).toLowerCase();if(!code||!clean(languageName,100))throw fail('Language code and name are required');if(isPrimary)await env.DB.prepare(`UPDATE platform_country_product_languages SET is_primary=0 WHERE blueprint_id=?`).bind(Number(id)).run();await env.DB.prepare(`INSERT INTO platform_country_product_languages(blueprint_id,language_code,language_name,is_primary,enabled) VALUES(?,?,?,?,1) ON CONFLICT(blueprint_id,language_code) DO UPDATE SET language_name=excluded.language_name,is_primary=excluded.is_primary,enabled=1,updated_at=CURRENT_TIMESTAMP`).bind(Number(id),code,clean(languageName,100),isPrimary?1:0).run();return getCountryBlueprint(env,id)}
export async function upsertBlueprintSector(env,actor,id,{sectorCode,sectorName,notes='',required=true}){const code=clean(sectorCode,120).toLowerCase();if(!code)throw fail('Sector code is required');await env.DB.prepare(`INSERT INTO platform_country_product_sectors(blueprint_id,sector_code,sector_name,notes,required,status) VALUES(?,?,?,?,?,'draft') ON CONFLICT(blueprint_id,sector_code) DO UPDATE SET sector_name=excluded.sector_name,notes=excluded.notes,required=excluded.required,updated_at=CURRENT_TIMESTAMP`).bind(Number(id),code,clean(sectorName,180)||code,clean(notes,1000),required?1:0).run();return getCountryBlueprint(env,id)}
export async function upsertBlueprintContent(env,actor,id,{contentKey,category='experience',title,body='',languageCode='en',required=false}){const key=clean(contentKey,120);if(!key||!clean(title,180))throw fail('Content key and title are required');await env.DB.prepare(`INSERT INTO platform_country_product_contents(blueprint_id,content_key,category,title,body,language_code,required,status) VALUES(?,?,?,?,?,?,?,'draft') ON CONFLICT(blueprint_id,content_key,language_code) DO UPDATE SET category=excluded.category,title=excluded.title,body=excluded.body,required=excluded.required,status='draft',updated_at=CURRENT_TIMESTAMP`).bind(Number(id),key,clean(category,60),clean(title,180),clean(body,12000),clean(languageCode,20).toLowerCase(),required?1:0).run();return getCountryBlueprint(env,id)}
export async function upsertBlueprintLegal(env,actor,id,{requirementKey,title,description='',sourceUrl='',required=true,status='missing'}){const key=clean(requirementKey,120);if(!key||!clean(title,180))throw fail('Legal requirement key and title are required');if(!['missing','researching','prepared','reviewed'].includes(status))throw fail('Invalid legal requirement status');await env.DB.prepare(`INSERT INTO platform_country_product_legal_requirements(blueprint_id,requirement_key,title,description,source_url,required,status) VALUES(?,?,?,?,?,?,?) ON CONFLICT(blueprint_id,requirement_key) DO UPDATE SET title=excluded.title,description=excluded.description,source_url=excluded.source_url,required=excluded.required,status=excluded.status,updated_at=CURRENT_TIMESTAMP`).bind(Number(id),key,clean(title,180),clean(description,3000),clean(sourceUrl,1000),required?1:0,status).run();return getCountryBlueprint(env,id)}
export async function prepareCountryBlueprintForLaunch(env,actor,id){
 const b=await getCountryBlueprint(env,id);
 if(!b)throw fail('Country blueprint not found',404);
 const requiredSectors=b.sectors.filter(x=>x.required);
 const requiredContents=b.contents.filter(x=>x.required);
 const requiredLegal=b.legalRequirements.filter(x=>x.required);
 const activeSectorCodes=new Set(((await env.DB.prepare(`SELECT sector_code FROM sector_policies WHERE status='active'`).all()).results||[]).map(x=>String(x.sector_code||'').toLowerCase()));
 const sectorPromotions=requiredSectors.filter(x=>x.status!=='ready'&&activeSectorCodes.has(String(x.sector_code||'').toLowerCase())&&String(x.sector_name||'').trim());
 if(sectorPromotions.length)await env.DB.batch(sectorPromotions.map(x=>env.DB.prepare(`UPDATE platform_country_product_sectors SET status='ready',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status!='blocked'`).bind(Number(x.id))));
 const contentPromotions=requiredContents.filter(x=>x.status!=='ready'&&String(x.body||'').trim());
 if(contentPromotions.length)await env.DB.batch(contentPromotions.map(x=>env.DB.prepare(`UPDATE platform_country_product_contents SET status='ready',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status!='missing'`).bind(Number(x.id))));
 const refreshed=await getCountryBlueprint(env,id);
 const requiredSectors2=refreshed.sectors.filter(x=>x.required);
 const requiredContents2=refreshed.contents.filter(x=>x.required);
 const requiredLegal2=refreshed.legalRequirements.filter(x=>x.required);
 const missing=[...requiredSectors2.filter(x=>x.status!=='ready').map(x=>`sector:${x.sector_code}`),...requiredContents2.filter(x=>!String(x.body||'').trim()||x.status!=='ready').map(x=>`content:${x.content_key}:${x.language_code}`),...requiredLegal2.filter(x=>x.status!=='reviewed').map(x=>`legal:${x.requirement_key}`),...(!refreshed.languages.some(x=>x.is_primary)?['language:primary']:[])];
 const ready=missing.length===0&&refreshed.languages.some(x=>x.enabled&&x.is_primary);
 await env.DB.prepare(`UPDATE platform_country_product_blueprints SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(ready?'ready':'preparing',Number(id)).run();
 return {...(await getCountryBlueprint(env,id)),readiness:{ready,missing}};
}

export async function blueprintLaunchManifest(env,id){const b=await getCountryBlueprint(env,id);if(!b)throw fail('Country blueprint not found',404);if(b.status!=='ready')throw fail('Country blueprint is not ready for launch',409,'COUNTRY_BLUEPRINT_NOT_READY');return {blueprintId:Number(id),languageCode:b.default_language_code,labels:{countryName:b.country_name,productName:b.contents.find(x=>x.content_key==='product-name')?.body||b.name},eligibility:{sectors:b.sectors.filter(x=>x.status==='ready').map(x=>x.sector_code),organizationTypes:['company'],userClasses:['tenant_admin','driver','independent_executor']},countryContent:{languages:b.languages,contents:b.contents,legalRequirements:b.legalRequirements}}}
function normalizeBlueprint(b){return {...b,id:Number(b.id),country_code:String(b.country_code),languages:[],sectors:[],contents:[],legalRequirements:[]}}
async function hydrateBlueprint(env,b){const [l,s,c,r]=await Promise.all([env.DB.prepare(`SELECT * FROM platform_country_product_languages WHERE blueprint_id=? ORDER BY is_primary DESC,language_name`).bind(b.id).all(),env.DB.prepare(`SELECT * FROM platform_country_product_sectors WHERE blueprint_id=? ORDER BY required DESC,sector_name`).bind(b.id).all(),env.DB.prepare(`SELECT * FROM platform_country_product_contents WHERE blueprint_id=? ORDER BY category,title,language_code`).bind(b.id).all(),env.DB.prepare(`SELECT * FROM platform_country_product_legal_requirements WHERE blueprint_id=? ORDER BY required DESC,title`).bind(b.id).all()]);return {...b,languages:(l.results||[]).map(x=>({...x,id:Number(x.id),is_primary:Number(x.is_primary)===1,enabled:Number(x.enabled)===1})),sectors:(s.results||[]).map(x=>({...x,id:Number(x.id),required:Number(x.required)===1})),contents:(c.results||[]).map(x=>({...x,id:Number(x.id),required:Number(x.required)===1})),legalRequirements:(r.results||[]).map(x=>({...x,id:Number(x.id),required:Number(x.required)===1}))}}
