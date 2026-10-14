import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
const trash=fs.readFileSync('src/worker/security/platform-trash.service.js','utf8');
if(!trash.includes("import {canonicalFirst,canonicalAll} from '../core/canonical-db.js';")) throw new Error('Trash service must import canonicalAll');
if(trash.includes("sample(t.")||trash.includes("sample(u.")) throw new Error('Undefined sample helper remains in Trash candidate scan');
if(!trash.includes("looksSample(t.name,t.legal_name,t.trading_name)")) throw new Error('Tenant sample detector is not using looksSample');
if(!trash.includes("looksSample(u.login,u.email,u.display_name)")) throw new Error('User sample detector is not using looksSample');
if(trash.includes('FROM companies WHERE country_code=?')) throw new Error('Invalid companies.country_code query remains');
const db=new DatabaseSync(':memory:');
db.exec(fs.readFileSync('database/schema.current.sql','utf8'));
const queries=[
 `SELECT * FROM platform_trash_items WHERE purged_at IS NULL ORDER BY trashed_at DESC,id DESC LIMIT ?`,
 `SELECT c.id,c.name,c.created_at,COALESCE(cmp.updated_at,c.created_at) updated_at,c.deletion_status,cmp.legal_name,cmp.trading_name,cmp.status management_status FROM companies c LEFT JOIN company_management_profiles cmp ON cmp.company_id=c.id WHERE c.deletion_status='active' ORDER BY c.id`,
 `SELECT ai.id,ai.company_id,ai.login,ai.email,ai.display_name,ai.role,ai.active,ai.updated_at FROM auth_identities ai WHERE ai.active=1 ORDER BY ai.id`,
 `SELECT code,name,active,created_at,updated_at FROM country_catalog ORDER BY name`,
 `SELECT b.* FROM platform_country_product_blueprints b ORDER BY b.updated_at DESC`,
 `SELECT s.*,b.country_code,b.name blueprint_name FROM platform_country_product_sectors s JOIN platform_country_product_blueprints b ON b.id=s.blueprint_id ORDER BY s.updated_at DESC`,
 `SELECT * FROM platform_product_definitions WHERE status='draft' ORDER BY updated_at DESC`,
 `SELECT * FROM platform_product_expansion_cases WHERE status IN ('planning','preparing','composing','blocked','retired') ORDER BY updated_at DESC`
];
for(const q of queries) db.prepare(q);
console.log('PASS 10.60.0 permanent Trash runtime regression gate');
