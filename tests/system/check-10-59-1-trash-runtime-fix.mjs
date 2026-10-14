import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
const root=process.cwd();
const trash=fs.readFileSync('src/worker/security/platform-trash.service.js','utf8');
if(!trash.includes("async function all(env,sql,...args){return canonicalAll(env,sql,args,'platform_trash')}")) throw new Error('Trash reads are not routed through canonical DB failure semantics');
if(trash.includes('FROM companies WHERE country_code=?')) throw new Error('Invalid companies.country_code query remains in Trash country dependency scan');
if(!trash.includes('FROM company_management_profiles WHERE country_code=?')) throw new Error('Canonical company-country dependency query missing');
const db=new DatabaseSync(':memory:');
db.exec(fs.readFileSync('database/schema.current.sql','utf8'));
for(const q of [
 `SELECT COUNT(*) count FROM company_management_profiles WHERE country_code=?`,
 `SELECT COUNT(*) count FROM jurisdiction_policies WHERE country_code=? AND status='active'`,
 `SELECT c.id,c.name,c.created_at,COALESCE(cmp.updated_at,c.created_at) updated_at,c.deletion_status,cmp.legal_name,cmp.trading_name,cmp.status management_status FROM companies c LEFT JOIN company_management_profiles cmp ON cmp.company_id=c.id WHERE c.deletion_status='active' ORDER BY c.id`,
 `SELECT s.*,b.country_code,b.name blueprint_name FROM platform_country_product_sectors s JOIN platform_country_product_blueprints b ON b.id=s.blueprint_id ORDER BY s.updated_at DESC`
]) db.prepare(q);
console.log('PASS 10.60.0 Trash runtime fix + canonical SQL compilation');
