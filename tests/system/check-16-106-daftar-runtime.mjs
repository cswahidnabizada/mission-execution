import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {createApp} from '../../src/worker/app.js';
import {purgeExpiredOperationalData} from '../../src/worker/modules/privacy/privacy.service.js';
import {
  aggregateMarketTelemetry,appendBatchEvent,confirmCustodyTransfer,createBatchPassport,
  createCustodyTransfer,daftarTemplate,getDaftarContext,getDaftarDashboard,
  getMarketPriceFeed,normalizeQuantity,recordSyncBatch,updateTelemetryConsent,getApprovedFxQuote,convertWithApprovedQuote,
  verifyPublicPassport
} from '../../src/worker/modules/daftar/daftar.service.js';

const db=new DatabaseSync(':memory:');
db.exec(fs.readFileSync('database/schema.current.sql','utf8'));
class Bound {
  constructor(sql,values=[]){this.sql=sql;this.values=values;}
  bind(...values){return new Bound(this.sql,values);}
  async first(){return db.prepare(this.sql).get(...this.values)||null;}
  async all(){return {results:db.prepare(this.sql).all(...this.values)};}
  async run(){const r=db.prepare(this.sql).run(...this.values);return {meta:{changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid||0)}};}
}
const DB={
  prepare(sql){return new Bound(sql);},
  async batch(statements){
    db.exec('BEGIN');
    try{const results=statements.map(s=>{const r=db.prepare(s.sql).run(...s.values);return {meta:{changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid||0)}};});db.exec('COMMIT');return results;}
    catch(error){db.exec('ROLLBACK');throw error;}
  }
};
const kv=new Map();
const env={DB,KV_BINDING:{async put(k,v){kv.set(k,v);},async get(k,type){const value=kv.get(k);return value&&type==='json'?JSON.parse(value):value;},async delete(k){kv.delete(k);}},DAFTAR_TELEMETRY_HMAC_SECRET:'test-only-secret-'.repeat(4)};

db.prepare(`INSERT INTO country_catalog(code,name,active,requires_review,default_subscription_class) VALUES('AF','Afghanistan',1,1,'exempt')`).run();
db.prepare(`INSERT INTO platform_product_country_catalog(code,name,active,requires_review,default_subscription_class) VALUES('AF','Afghanistan',1,1,'exempt')`).run();
db.prepare(`INSERT INTO country_product_launches(country_code,version,status,manifest_json,eligibility_json,readiness_json,active,created_by_type) VALUES('AF','pilot-1','active','{}','{}','{}',1,'test')`).run();
for(const sector of ['general','fx'])db.prepare(`INSERT INTO daftar_market_profiles(country_code,sector_code,status,template_version,telemetry_enabled,minimum_cohort_size) VALUES('AF',?,'pilot','1.0.0',?,5)`).run(sector,sector==='fx'?0:1);
db.prepare(`INSERT INTO daftar_unit_conversions(country_code,region_code,unit_code,base_unit_code,multiplier_numerator,multiplier_denominator,status,source_reference,version) VALUES('AF','AF-HERAT','seer','kg',7,1,'proposed','test metrology source pending approval','1')`).run();
function createTenant(id,sector='general',region='AF-HERAT',orgStatus='ACTIVE',verification='verified'){
  db.prepare(`INSERT INTO companies(id,name,deletion_status) VALUES(?,?,'active')`).run(id,`Test tenant ${id}`);
  db.prepare(`INSERT INTO company_management_profiles(company_id,legal_name,country_code,region_code,organization_type,sector_code,compliance_status,status) VALUES(?,?,'AF',?,'company',?,'configured',?)`).run(id,`Test tenant ${id}`,region,sector,orgStatus);
  db.prepare(`INSERT INTO company_verification_status(company_id,status,country_code) VALUES(?,?,'AF')`).run(id,verification);
  db.prepare(`INSERT INTO daftar_pilot_tenant_access(id,company_id,country_code,sector_code,access_status,approved_by_identity_id,reason) VALUES(?,?,'AF',?,'approved',1,'Automated isolated test fixture allowlist.')`).run(`pilot-access-test-${id}`,id,sector);
  if(sector!=='fx')db.prepare(`INSERT INTO daftar_market_consents(company_id,country_code,sector_code,telemetry_opt_in,consent_version,consented_by_identity_id) VALUES(?,'AF',?,0,'1.0.0',?)`).run(id,sector,id+1000);
}
createTenant(1,'general','HERAT','ACTIVE');createTenant(2,'general','KABUL','ONBOARDING','pending');
createTenant(3,'fx','AF-KABUL');
const session={tenantId:1,identityId:1001,role:'admin'};
let context=await getDaftarContext(env,session);await updateTelemetryConsent(env,session,context,true);context=await getDaftarContext(env,session);
assert.equal(context.countryCode,'AF');
assert.equal(context.sectorCode,'general');assert.equal(context.regionCode,'AF-HERAT');assert.equal(context.telemetryEnabled,true);const pendingContext=await getDaftarContext(env,{tenantId:2,identityId:1002,role:'admin'});assert.equal(pendingContext.telemetryEnabled,false);await assert.rejects(()=>updateTelemetryConsent(env,{tenantId:2,identityId:1002,role:'admin'},pendingContext,true),/DAFTAR_TELEMETRY_VERIFICATION_REQUIRED/);
const beforeVersion=await db.prepare(`SELECT template_version FROM daftar_market_profiles WHERE country_code='AF' AND sector_code='general'`).get();db.prepare(`UPDATE daftar_market_profiles SET template_version='99.0.0' WHERE country_code='AF' AND sector_code='general'`).run();await assert.rejects(()=>getDaftarContext(env,session),/DAFTAR_TEMPLATE_VERSION_UNAVAILABLE/);db.prepare(`UPDATE daftar_market_profiles SET template_version=? WHERE country_code='AF' AND sector_code='general'`).run(beforeVersion.template_version);
assert.equal(daftarTemplate().schemaVersion,'1.0.0');
const makeEntry=(overrides={})=>({clientEntryId:crypto.randomUUID(),idempotencyKey:crypto.randomUUID(),entryType:'purchase',direction:'get',itemCode:'cumin',quantity:10,unitCode:'kg',amount:1000,currencyCode:'AFN',paymentMethod:'cash',cityCode:'HERAT',...overrides});

// Private ledger, atomic stock projection, and offline idempotency.
let result=await recordSyncBatch(env,session,context,[makeEntry()],'test-request-0001');
assert.equal(result.accepted,1);
let stock=await db.prepare(`SELECT quantity_milli,unit_code FROM daftar_inventory_balances WHERE company_id=1 AND item_code='cumin'`).get();
assert.equal(stock.quantity_milli,10000);assert.equal(stock.unit_code,'kg');
const sale=makeEntry({entryType:'sale',direction:'give',quantity:2,amount:400});
result=await recordSyncBatch(env,session,context,[sale],'test-request-0002');assert.equal(result.accepted,1);
stock=await db.prepare(`SELECT quantity_milli FROM daftar_inventory_balances WHERE company_id=1 AND item_code='cumin'`).get();assert.equal(stock.quantity_milli,8000);
result=await recordSyncBatch(env,session,context,[sale],'test-request-0003');assert.equal(result.replayed,1);
stock=await db.prepare(`SELECT quantity_milli FROM daftar_inventory_balances WHERE company_id=1 AND item_code='cumin'`).get();assert.equal(stock.quantity_milli,8000);
const oversell=makeEntry({entryType:'sale',direction:'give',quantity:9,amount:900});
result=await recordSyncBatch(env,session,context,[oversell],'test-request-0004');assert.equal(result.rejected,1);assert.equal(result.results[0].code,'DAFTAR_INVENTORY_CONFLICT');
stock=await db.prepare(`SELECT quantity_milli FROM daftar_inventory_balances WHERE company_id=1 AND item_code='cumin'`).get();assert.equal(stock.quantity_milli,8000);

// Qarz balance and partial settlement are enforced by D1 trigger.
const credit=makeEntry({entryType:'sale',direction:'give',quantity:1,amount:100,paymentMethod:'credit'});
result=await recordSyncBatch(env,session,context,[credit],'test-request-0005');assert.equal(result.accepted,1);
const creditId=result.results[0].entryId;
const settlement=makeEntry({entryType:'credit_settlement',direction:'get',itemCode:'',quantity:null,amount:40,paymentMethod:'cash',relatedEntryId:creditId});
result=await recordSyncBatch(env,session,context,[settlement],'test-request-0006');assert.equal(result.accepted,1);
const creditRow=await db.prepare(`SELECT amount_minor,settled_amount_minor,payment_status FROM daftar_private_entries WHERE id=?`).get(creditId);
assert.equal(creditRow.amount_minor,10000);assert.equal(creditRow.settled_amount_minor,4000);assert.equal(creditRow.payment_status,'partially_settled');

// Sarafi is a two-currency record only; it does not move money or claim verification.
const fxSession={tenantId:3,identityId:1003,role:'admin'};const fxContext=await getDaftarContext(env,fxSession);
const fx=makeEntry({entryType:'fx_exchange',direction:'give',itemCode:'',quantity:null,amount:100,currencyCode:'USD',counterAmount:7000,counterCurrencyCode:'AFN',paymentMethod:'hawala_record'});
result=await recordSyncBatch(env,fxSession,fxContext,[fx],'test-request-fx-0001');assert.equal(result.accepted,1);assert.equal(result.results[0].fxRecorded,true);
const fxRow=await db.prepare(`SELECT amount_minor,currency_code,counter_amount_minor,counter_currency_code,payment_status FROM daftar_private_entries WHERE id=?`).get(result.results[0].entryId);
assert.equal(fxRow.currency_code,'USD');assert.equal(fxRow.counter_currency_code,'AFN');assert.equal(fxRow.payment_status,'reported_pending');
db.prepare(`INSERT INTO daftar_fx_quotes(id,country_code,base_currency,quote_currency,rate_numerator,rate_denominator,source_code,source_reference,observed_at,valid_until,status) VALUES('fx-test-00000000000000000000000000000001','AF','USD','AFN',70,1,'approved-test','official-rate-reference',CURRENT_TIMESTAMP,datetime('now','+1 hour'),'approved')`).run();const quote=await getApprovedFxQuote(env,fxContext,'USD','AFN');assert.equal(convertWithApprovedQuote(10000,quote),700000);
const proposedUnit=await normalizeQuantity(env,context,3,'seer');assert.equal(proposedUnit.normalizedQuantityMilli,null);db.prepare(`UPDATE daftar_unit_conversions SET status='approved',approved_at=CURRENT_TIMESTAMP WHERE country_code='AF' AND region_code='AF-HERAT' AND unit_code='seer'`).run();const approvedUnit=await normalizeQuantity(env,context,3,'seer');assert.equal(approvedUnit.normalizedQuantityMilli,21000);assert.equal(approvedUnit.normalizedUnitCode,'kg');

// DPP evidence, mass-balance gate, tenant boundary and two-party custody.
const passport=await createBatchPassport(env,session,context,{productCode:'saffron',batchCode:'AF-HER-001',quantity:20,unitCode:'kg',visibility:'public'});
assert.ok(passport.publicToken);
const goodEvent=await appendBatchEvent(env,session,context,passport.passport.id,{eventType:'mass_balance',inputQuantityMilli:20000,outputQuantityMilli:19000,wasteQuantityMilli:1000,unitCode:'kg'});
assert.equal(goodEvent.recorded,true);
await assert.rejects(()=>appendBatchEvent(env,session,context,passport.passport.id,{eventType:'mass_balance',inputQuantityMilli:20000,outputQuantityMilli:21000,wasteQuantityMilli:0,unitCode:'kg'}),/DAFTAR_MASS_BALANCE_EXCEEDED/);
const publicView=await verifyPublicPassport(env,passport.publicToken);
assert.equal(publicView.passport.batchCode,'AF-HER-001');assert.match(publicView.disclaimer,/does not independently certify/);
const session2={tenantId:2,identityId:1002,role:'admin'};const context2=await getDaftarContext(env,session2);
assert.equal((await getDaftarDashboard(env,context2)).summary.entryCount,0);
await assert.rejects(()=>appendBatchEvent(env,session2,context2,passport.passport.id,{eventType:'inspection'}),/DAFTAR_PASSPORT_NOT_FOUND/);
const transfer=await createCustodyTransfer(env,session,context,passport.passport.id,{toCompanyId:2});
const confirmed=await confirmCustodyTransfer(env,session2,context2,transfer.transferId,transfer.challengeToken);
assert.equal(confirmed.status,'confirmed');
const recipientEvent=await appendBatchEvent(env,session2,context2,passport.passport.id,{eventType:'inspection',details:{conditionCode:'sealed'}});
assert.equal(recipientEvent.recorded,true);

// Five-plus independent, opted-in merchants are required; outliers are excluded.
for(const id of [4,5,6,7,8])createTenant(id);
for(const id of [1,4,5,6,7,8]){
  const tenantSession={tenantId:id,identityId:id+1000,role:'admin'};
  let tenantContext=await getDaftarContext(env,tenantSession);if(id!==1){await updateTelemetryConsent(env,tenantSession,tenantContext,true);tenantContext=await getDaftarContext(env,tenantSession);}
  const amount=id===8?10000:1000;
  const price=makeEntry({itemCode:'wheat',quantity:10,unitCode:'kg',amount,cityCode:'HERAT'});
  const saved=await recordSyncBatch(env,tenantSession,tenantContext,[price],`telemetry-request-${id}-0001`);
  assert.equal(saved.accepted,1);
}
for(const id of [1,4,5,6]){const tenantSession={tenantId:id,identityId:id+1000,role:'admin'};const tenantContext=await getDaftarContext(env,tenantSession);const rice=makeEntry({itemCode:'rice',quantity:10,unitCode:'kg',amount:1000,cityCode:'HERAT'});const saved=await recordSyncBatch(env,tenantSession,tenantContext,[rice],`rice-telemetry-${id}-0001`);assert.equal(saved.accepted,1);}
const aggregate=await aggregateMarketTelemetry(env);
assert.ok(aggregate.indices>=1);
const feed=await getMarketPriceFeed(env,context);
const wheat=feed.items.find(x=>x.itemCode==='wheat');
assert.ok(wheat);assert.equal(wheat.contributorCount,5);assert.equal(wheat.sampleCount,5);assert.equal(wheat.outlierCount,1);
assert.equal(wheat.trustClass,'merchant_reported');assert.equal(feed.items.some(x=>x.itemCode==='rice'),false);const hmacKey=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.DAFTAR_TELEMETRY_HMAC_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);db.prepare(`UPDATE company_verification_status SET status='pending' WHERE company_id=8`).run();const reverifiedAggregate=await aggregateMarketTelemetry(env);assert.ok(reverifiedAggregate.indices>=1);const refreshedFeed=await getMarketPriceFeed(env,context);const refreshedWheat=refreshedFeed.items.find(x=>x.itemCode==='wheat');assert.equal(refreshedWheat.contributorCount,5);assert.equal(refreshedWheat.outlierCount,0);const revokedKey=await crypto.subtle.sign('HMAC',hmacKey,new TextEncoder().encode('daftar-contributor:v1:8:AF:general'));const revokedContributorKey=[...new Uint8Array(revokedKey)].map(x=>x.toString(16).padStart(2,'0')).join('');const revokedEvents=await db.prepare(`SELECT COUNT(*) AS n FROM market_telemetry_events WHERE contributor_key=?`).get(revokedContributorKey);assert.equal(Number(revokedEvents.n),0);
const telemetryColumns=db.prepare(`PRAGMA table_info(market_telemetry_events)`).all();
assert.ok(!telemetryColumns.some(x=>['counterparty_label','private_note','customer_name','phone','gps'].includes(x.name)));
const signature=await crypto.subtle.sign('HMAC',hmacKey,new TextEncoder().encode('daftar-contributor:v1:1:AF:general'));const contributorKey=[...new Uint8Array(signature)].map(x=>x.toString(16).padStart(2,'0')).join('');const withdrawn=await updateTelemetryConsent(env,session,context,false);assert.equal(withdrawn.telemetryOptIn,false);
const contributorCount=await db.prepare(`SELECT COUNT(*) AS n FROM market_telemetry_events WHERE contributor_key=?`).get(contributorKey);assert.equal(Number(contributorCount.n),0);assert.equal(kv.has('daftar:market-prices:AF:general'),false);
db.prepare(`UPDATE daftar_private_entries SET retention_review_at=datetime('now','-1 day') WHERE company_id=1`).run();db.prepare(`UPDATE daftar_credit_settlements SET retention_review_at=datetime('now','-1 day') WHERE company_id=1`).run();db.prepare(`UPDATE daftar_inventory_movements SET retention_review_at=datetime('now','-1 day') WHERE company_id=1`).run();db.prepare(`UPDATE batch_passports SET retention_review_at=datetime('now','-1 day') WHERE id=?`).run(passport.passport.id);db.prepare(`UPDATE batch_events SET retention_review_at=datetime('now','-1 day') WHERE passport_id=?`).run(passport.passport.id);db.prepare(`UPDATE daftar_custody_transfers SET retention_review_at=datetime('now','-1 day') WHERE id=?`).run(transfer.transferId);const retention=await purgeExpiredOperationalData(env);assert.ok(retention.daftarEntriesMarkedForReview>0);assert.ok(retention.daftarCreditSettlementsMarkedForReview>0);assert.ok(retention.daftarInventoryMovementsMarkedForReview>0);assert.ok(retention.daftarPassportsMarkedForReview>0);assert.ok(retention.daftarEventsMarkedForReview>0);assert.ok(retention.daftarCustodyTransfersMarkedForReview>0);

// Route and offline UI are part of the existing app/auth shell.
const routes=createApp().routes.map(x=>({method:x.method,pattern:String(x.pattern)}));
assert.ok(routes.some(x=>x.method==='POST'&&x.pattern==='/api/v1/daftar/sync'));
assert.ok(routes.some(x=>x.method==='GET'&&x.pattern==='/api/v1/daftar/bootstrap'));
assert.ok(routes.some(x=>x.method==='GET'&&x.pattern==='/api/platform/admin/daftar/markets'));assert.ok(routes.some(x=>x.method==='POST'&&x.pattern==='/api/v1/daftar/fx/convert-preview'));assert.ok(routes.some(x=>x.method==='GET'&&x.pattern==='/api/v1/daftar/fx/quote'));
assert.ok(fs.readFileSync('public/assets/js/frontend/navigation/registry.js','utf8').includes("key:'daftar'"));
assert.ok(fs.readFileSync('public/assets/js/frontend/app/app.js','utf8').includes("key==='daftar'"));
assert.ok(fs.existsSync('public/daftar-sw.js'));const offlineUi=fs.readFileSync('public/assets/js/frontend/daftar/daftar.js','utf8');assert.ok(offlineUi.includes('current.offlineScope'));assert.ok(offlineUi.includes('scopedDbName'));assert.ok(offlineUi.includes('AES-GCM'));assert.ok(offlineUi.includes('Account context changed'));assert.ok(offlineUi.includes('1,000 unsynchronized entries'));
assert.ok(fs.readFileSync('database/schema.current.sql','utf8').includes('trg_daftar_inventory_movement_apply'));
console.log('16.117.0 Embedded Daftar ledger, offline sync, privacy, telemetry, inventory and DPP runtime: PASS');
