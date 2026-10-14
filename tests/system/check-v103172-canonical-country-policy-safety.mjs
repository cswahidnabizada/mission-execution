import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const sql=fs.readFileSync(path.join(root,'database/migrations/0050_canonical_country_policy_safety.sql'),'utf8');
const executableSql=sql.split('\n').filter(line=>!line.trim().startsWith('--')).join('\n');
const migrationBody=executableSql.split("SELECT 'country_catalog_count'")[0];
const policy=fs.readFileSync(path.join(root,'src/worker/security/subscription-policy.service.js'),'utf8');
const situation=fs.readFileSync(path.join(root,'src/worker/security/user-situation.service.js'),'utf8');
const checks=[
 ['migration exists',sql.length>1000],
 ['complete capability schema', ['subscription_class','can_create_missions','can_create_drivers','can_share_foryou','can_request_foryou','can_share_network','can_accept_network'].every(x=>sql.includes(x))],
 ['generic free policy', sql.includes("plan_code='free'") && sql.includes("billing_mode='free'")],
 ['no Afghanistan migration branch', !migrationBody.includes("WHERE country_code='AF'") && !migrationBody.includes("cc.code<>'AF'")],
 ['legacy BALM preservation', sql.includes('verification_check_legacy') && sql.includes("WHERE check_type='balm'")],
 ['active BALM removed', sql.includes("CHECK(check_type IN ('email','phone','company','country','identity'))")],
 ['verified country authoritative in policy', policy.includes('const countryCode=verifiedCountryCode||"ZZ";')],
 ['verified country authoritative in situation', situation.includes('countryCode:context?.verifiedCountryCode||"ZZ"')],
 ['no policy use of declared country', !policy.includes('const countryCode=verifiedCountryCode||declaredCountryCode')],
 ['post migration checks', sql.includes('policy_capability_columns') && sql.includes('balm_active_rows')]
];
for(const [name,ok] of checks){if(!ok){console.error(`10.31.72 canonical country policy safety: FAIL — ${name}`);process.exit(1);}}
console.log('10.31.72 canonical country policy safety: PASS');
