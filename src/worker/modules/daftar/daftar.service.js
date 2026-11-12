import { audit } from '../../security/audit.js';
import { getForSession } from '../missions/missions.service.js';
import template from '../../../../config/daftar/sector-templates.v1.json' with { type: 'json' };

const CURRENCIES = new Set(['AFN','USD','EUR']);
const PAYMENT_METHODS = new Set(template.paymentMethods);
const ENTRY_TYPES = new Set(Object.keys(template.entryTypes));
const PASSPORT_EVENTS = new Set(['origin','production','inspection','lab_test','mission','packaging','mass_balance','recall']);
const MAX_SYNC_EVENTS = 25;

export function daftarTemplate() { return template; }

export async function getDaftarContext(env, session) {
  const companyId = Number(session?.tenantId || 0);
  if (!companyId || !Number(session?.identityId || 0)) throw httpError('TENANT_CONTEXT_REQUIRED', 403);
  let row;
  try {
    row = await env.DB.prepare(`
      SELECT c.id AS company_id,c.deletion_status,cmp.country_code,cmp.sector_code,cmp.region_code,cmp.status AS organization_status,cvs.status AS verification_status,
             mp.status AS market_status,mp.template_version,mp.telemetry_enabled,mp.minimum_cohort_size,
             l.version AS product_version
      FROM companies c
      JOIN company_management_profiles cmp ON cmp.company_id=c.id
      LEFT JOIN company_verification_status cvs ON cvs.company_id=c.id
      JOIN country_catalog cc ON cc.code=cmp.country_code AND cc.active=1
      JOIN country_product_launches l ON l.country_code=cmp.country_code AND l.status='active' AND l.active=1
      JOIN daftar_market_profiles mp ON mp.country_code=cmp.country_code AND mp.sector_code=cmp.sector_code
      WHERE c.id=? AND c.deletion_status='active' AND cmp.status IN ('ACTIVE','ONBOARDING','PENDING_VERIFICATION','VERIFIED')
        AND mp.status IN ('pilot','active')
        AND (mp.status='active' OR EXISTS(SELECT 1 FROM daftar_pilot_tenant_access pa WHERE pa.company_id=c.id AND pa.country_code=cmp.country_code AND pa.sector_code=cmp.sector_code AND pa.access_status='approved' AND (pa.expires_at IS NULL OR datetime(pa.expires_at)>datetime('now'))))
      ORDER BY l.updated_at DESC LIMIT 1
    `).bind(companyId).first();
  } catch (error) {
    throw httpError('DAFTAR_AUTHORITY_UNAVAILABLE', 503, error);
  }
  if (!row) {const pilot=await env.DB.prepare(`SELECT mp.status FROM companies c JOIN company_management_profiles cmp ON cmp.company_id=c.id JOIN daftar_market_profiles mp ON mp.country_code=cmp.country_code AND mp.sector_code=cmp.sector_code JOIN country_product_launches l ON l.country_code=cmp.country_code AND l.status='active' AND l.active=1 WHERE c.id=? AND c.deletion_status='active' AND mp.status='pilot' LIMIT 1`).bind(companyId).first().catch(()=>null);if(pilot)throw httpError('DAFTAR_PILOT_ACCESS_REQUIRED',403);throw httpError('DAFTAR_MARKET_NOT_ACTIVE', 403);}
  const sectorCode = String(row.sector_code || 'general').toLowerCase();
  if(String(row.template_version||'')!==template.schemaVersion)throw httpError('DAFTAR_TEMPLATE_VERSION_UNAVAILABLE',409);
  const sector = template.sectors[sectorCode];
  if (!sector) throw httpError('DAFTAR_SECTOR_NOT_CONFIGURED', 403);
  const consent = await env.DB.prepare(`SELECT telemetry_opt_in,consent_version,consented_at,withdrawn_at FROM daftar_market_consents WHERE company_id=? AND country_code=? AND sector_code=? LIMIT 1`)
    .bind(companyId,row.country_code,sectorCode).first();
  const telemetryAvailable=Number(row.telemetry_enabled)===1&&String(row.verification_status||'pending').toLowerCase()==='verified'&&String(env.DAFTAR_TELEMETRY_HMAC_SECRET||'').length>=32;
  return Object.freeze({
    companyId, countryCode:String(row.country_code).toUpperCase(), sectorCode,
    regionCode:normalizeRegionCode(row.country_code,row.region_code),
    organizationStatus:row.organization_status, verificationStatus:String(row.verification_status||'pending').toLowerCase(), marketStatus:row.market_status,
    templateVersion:row.template_version||template.schemaVersion,
    telemetryEnabled:telemetryAvailable,
    telemetryReason:Number(row.telemetry_enabled)!==1?'market_telemetry_disabled':String(row.verification_status||'pending').toLowerCase()!=='verified'?'business_verification_required':String(env.DAFTAR_TELEMETRY_HMAC_SECRET||'').length<32?'telemetry_secret_not_configured':null,
    minimumCohortSize:Math.max(5,Number(row.minimum_cohort_size)||5),
    productVersion:row.product_version,
    sector, telemetryOptIn:telemetryAvailable&&Number(consent?.telemetry_opt_in)===1&&!consent?.withdrawn_at,
    consentVersion:consent?.consent_version||null
  });
}

export function normalizeMoney({amount,currencyCode}) {
  const currency=String(currencyCode||'AFN').toUpperCase();
  if (!CURRENCIES.has(currency)) throw httpError('DAFTAR_CURRENCY_UNSUPPORTED',400);
  const numeric=Number(amount);
  if (!Number.isFinite(numeric)||numeric<=0||numeric>100000000000) throw httpError('DAFTAR_AMOUNT_INVALID',400);
  const amountMinor=Math.round(numeric*100);
  if (!Number.isSafeInteger(amountMinor)||amountMinor<=0) throw httpError('DAFTAR_AMOUNT_INVALID',400);
  return {amountMinor,currencyCode:currency};
}

export async function normalizeQuantity(env, context, quantity, unitCode) {
  const q=Number(quantity);
  const unit=String(unitCode||'').trim().toLowerCase();
  if (!Number.isFinite(q)||q<=0||q>1000000000||!unit||!/^[a-z][a-z0-9_-]{0,23}$/.test(unit)) throw httpError('DAFTAR_QUANTITY_INVALID',400);
  const quantityMilli=Math.round(q*1000);
  if (!Number.isSafeInteger(quantityMilli)||quantityMilli<=0) throw httpError('DAFTAR_QUANTITY_INVALID',400);
  const canonical=template.units.canonical.find(x=>x.code===unit);
  if (canonical) {
    const normalized=Math.round(quantityMilli*canonical.numerator/canonical.denominator);
    return {quantityMilli,unitCode:unit,normalizedQuantityMilli:normalized,normalizedUnitCode:canonical.baseUnit,conversionVersion:template.schemaVersion};
  }
  let conversion=null;
  if (context.regionCode) conversion=await env.DB.prepare(`SELECT base_unit_code,multiplier_numerator,multiplier_denominator,version FROM daftar_unit_conversions WHERE country_code=? AND region_code=? AND unit_code=? AND status='approved' ORDER BY id DESC LIMIT 1`)
    .bind(context.countryCode,context.regionCode,unit).first();
  if (!conversion) conversion=await env.DB.prepare(`SELECT base_unit_code,multiplier_numerator,multiplier_denominator,version FROM daftar_unit_conversions WHERE country_code=? AND region_code='*' AND unit_code=? AND status='approved' ORDER BY id DESC LIMIT 1`)
    .bind(context.countryCode,unit).first();
  if (!conversion) return {quantityMilli,unitCode:unit,normalizedQuantityMilli:null,normalizedUnitCode:null,conversionVersion:null};
  return {quantityMilli,unitCode:unit,normalizedQuantityMilli:Math.round(quantityMilli*Number(conversion.multiplier_numerator)/Number(conversion.multiplier_denominator)),normalizedUnitCode:conversion.base_unit_code,conversionVersion:String(conversion.version)};
}

export async function recordSyncBatch(env, session, context, events, requestId) {
  if (!Array.isArray(events)||events.length<1||events.length>MAX_SYNC_EVENTS) throw httpError('DAFTAR_SYNC_BATCH_INVALID',400);
  const results=[];
  for (const input of events) {
    try { results.push(await recordOneEntry(env,session,context,input,requestId)); }
    catch (error) { results.push({clientEntryId:safeId(input?.clientEntryId),accepted:false,code:error.code||'DAFTAR_ENTRY_REJECTED',error:Number(error.status)<500?error.message:'Entry could not be stored'}); }
  }
  return {received:events.length,accepted:results.filter(x=>x.accepted&&!x.replayed).length,replayed:results.filter(x=>x.replayed).length,rejected:results.filter(x=>!x.accepted).length,results};
}

async function recordOneEntry(env,session,context,input,requestId) {
  const clientEntryId=validateOpaqueId(input?.clientEntryId,'DAFTAR_CLIENT_ENTRY_ID_INVALID');
  const idempotencyKey=validateOpaqueId(input?.idempotencyKey,'DAFTAR_IDEMPOTENCY_KEY_INVALID');
  const prior=await env.DB.prepare(`SELECT entry_id,result_json FROM daftar_sync_receipts WHERE company_id=? AND idempotency_key=? LIMIT 1`).bind(context.companyId,idempotencyKey).first();
  if (prior) return {...safeParse(prior.result_json),clientEntryId,entryId:prior.entry_id,accepted:true,replayed:true};
  const entryType=String(input?.entryType||'').toLowerCase();
  const direction=String(input?.direction||'').toLowerCase();
  if (!ENTRY_TYPES.has(entryType)||!context.sector.entryTypes.includes(entryType)) throw httpError('DAFTAR_ENTRY_TYPE_NOT_ALLOWED',400);
  if (!template.entryTypes[entryType].directions.includes(direction)) throw httpError('DAFTAR_DIRECTION_INVALID',400);
  const paymentMethod=String(input?.paymentMethod||'cash').toLowerCase();
  if (!PAYMENT_METHODS.has(paymentMethod)) throw httpError('DAFTAR_PAYMENT_METHOD_INVALID',400);
  const {amountMinor,currencyCode}=normalizeMoney({amount:input?.amount,currencyCode:input?.currencyCode||'AFN'});
  const itemCode=String(input?.itemCode||'').trim().toLowerCase();
  if (itemCode&&!/^[a-z0-9][a-z0-9._:-]{0,79}$/.test(itemCode)) throw httpError('DAFTAR_ITEM_CODE_INVALID',400);
  let quantity=null;
  if (input?.quantity!==undefined&&input?.quantity!==null&&input?.quantity!=='') quantity=await normalizeQuantity(env,context,input.quantity,input.unitCode);
  if (['sale','purchase','freight','wage'].includes(entryType)&&!quantity) throw httpError('DAFTAR_QUANTITY_REQUIRED',400);
  if (['sale','purchase'].includes(entryType)&&!itemCode) throw httpError('DAFTAR_ITEM_REQUIRED',400);
  const counterparty=validateCounterpartyLabel(input?.counterpartyLabel);
  const privateNote=validatePrivateNote(input?.privateNote);
  const cityCode=normalizeCityCode(input?.cityCode);
  const originCode=cleanOptional(input?.originCode,80);
  const destinationCode=cleanOptional(input?.destinationCode,80);
  const referenceCode=cleanOptional(input?.referenceCode,80);
  if(entryType==='freight'&&context.sectorCode==='logistics'&&(!originCode||!destinationCode))throw httpError('DAFTAR_FREIGHT_ROUTE_REQUIRED',400);
  const relatedEntryId=entryType==='credit_settlement'?validateOpaqueId(input?.relatedEntryId,'DAFTAR_CREDIT_ENTRY_REQUIRED'):null;
  if (entryType==='credit_settlement'&&paymentMethod==='credit') throw httpError('DAFTAR_SETTLEMENT_METHOD_INVALID',400);
  if(['sale','purchase','expense','credit_settlement','service','wage','freight'].includes(entryType)&&amountMinor<=0)throw httpError('DAFTAR_AMOUNT_REQUIRED',400);
  const paymentStatus=paymentMethod==='cash'?'reported_paid':'reported_pending';
  let fx=null;
  if (entryType==='fx_exchange') {
    const counter=normalizeMoney({amount:input?.counterAmount,currencyCode:input?.counterCurrencyCode});
    if (counter.currencyCode===currencyCode) throw httpError('DAFTAR_FX_CURRENCY_PAIR_INVALID',400);
    fx={counterAmountMinor:counter.amountMinor,counterCurrencyCode:counter.currencyCode,rateNumerator:counter.amountMinor,rateDenominator:amountMinor,source:cleanOptional(input?.exchangeRateSource||'merchant_reported',80)||'merchant_reported'};
  }
  const entryId=crypto.randomUUID();
  const createdAt=validClientTime(input?.recordedAt);
  const accountingMonth=String(createdAt||new Date().toISOString()).slice(0,7);
  const lockedPeriod=await env.DB.prepare(`SELECT 1 FROM daftar_book_period_locks WHERE company_id=? AND period_month=? AND lock_status='locked' LIMIT 1`).bind(context.companyId,accountingMonth).first().catch(error=>{throw httpError('DAFTAR_BOOK_PERIOD_AUTHORITY_UNAVAILABLE',503,error);});
  if(lockedPeriod)throw httpError('DAFTAR_BOOK_PERIOD_LOCKED',409);
  const inventoryApplied=Boolean(context.sector.inventory&&['sale','purchase'].includes(entryType)&&itemCode&&quantity?.normalizedQuantityMilli!==null);
  const normalizedUnit=quantity?.normalizedUnitCode||null;
  const inventoryDelta=inventoryApplied?(direction==='give'?-quantity.normalizedQuantityMilli:quantity.normalizedQuantityMilli):0;
  const statements=[];
  statements.push(env.DB.prepare(`INSERT INTO daftar_private_entries(id,company_id,country_code,sector_code,client_entry_id,entry_type,direction,item_code,origin_code,destination_code,reference_code,quantity_milli,unit_code,normalized_quantity_milli,normalized_unit_code,unit_conversion_version,unit_price_minor,amount_minor,settled_amount_minor,currency_code,counter_amount_minor,counter_currency_code,exchange_rate_numerator,exchange_rate_denominator,exchange_rate_source,exchange_rate_observed_at,payment_method,payment_status,counterparty_label,city_code,private_note,related_entry_id,client_recorded_at,created_by_identity_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(entryId,context.companyId,context.countryCode,context.sectorCode,clientEntryId,entryType,direction,itemCode||null,originCode,destinationCode,referenceCode,quantity?.quantityMilli??null,quantity?.unitCode??null,quantity?.normalizedQuantityMilli??null,normalizedUnit,quantity?.conversionVersion??null,quantity?Math.round(amountMinor*1000/quantity.quantityMilli):null,amountMinor,0,currencyCode,fx?.counterAmountMinor??null,fx?.counterCurrencyCode??null,fx?.rateNumerator??null,fx?.rateDenominator??null,fx?.source??null,fx?new Date().toISOString():null,paymentMethod,paymentStatus,counterparty,cityCode,privateNote,relatedEntryId,createdAt,Number(session.identityId)));
  if (inventoryApplied) {
    // The append-only movement is the write authority. D1 triggers validate
    // stock/unit invariants and update the balance projection atomically.
    statements.push(env.DB.prepare(`INSERT INTO daftar_inventory_movements(company_id,entry_id,item_code,delta_quantity_milli,unit_code) VALUES(?,?,?,?,?)`)
      .bind(context.companyId,entryId,itemCode,inventoryDelta,normalizedUnit));
  }
  let settlementOriginal=null;if(entryType==='credit_settlement'){settlementOriginal=await env.DB.prepare(`SELECT id,entry_type,direction,currency_code,payment_method,amount_minor,settled_amount_minor FROM daftar_private_entries WHERE id=? AND company_id=? LIMIT 1`).bind(relatedEntryId,context.companyId).first();if(!settlementOriginal||settlementOriginal.payment_method!=='credit'||settlementOriginal.currency_code!==currencyCode)throw httpError('DAFTAR_CREDIT_ENTRY_NOT_FOUND',404);if(settlementOriginal.amount_minor-settlementOriginal.settled_amount_minor<amountMinor)throw httpError('DAFTAR_CREDIT_SETTLEMENT_EXCEEDS_BALANCE',409);}
  // Every monetary business entry receives a balanced, single-currency journal event
  // in the same D1 batch as the private operational entry and its idempotency receipt.
  const journalPosting=buildJournalPosting({entryType,direction,paymentMethod,amountMinor,currencyCode,clientEntryId,entryId,identityId:Number(session.identityId),relatedEntry:settlementOriginal});
  if(journalPosting) statements.push(env.DB.prepare(`INSERT INTO daftar_book_journal_transactions(id,company_id,source_entry_id,client_transaction_id,transaction_type,debit_account,credit_account,amount_minor,currency_code,payment_method,payment_evidence_class,memo,created_by_identity_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(journalPosting.id,context.companyId,entryId,clientEntryId,journalPosting.transactionType,journalPosting.debitAccount,journalPosting.creditAccount,amountMinor,currencyCode,paymentMethod,'merchant_reported',null,Number(session.identityId)));
  if (entryType==='credit_settlement') {
    statements.push(env.DB.prepare(`INSERT INTO daftar_credit_settlements(company_id,entry_id,client_settlement_id,amount_minor,currency_code,payment_method,recorded_by_identity_id) VALUES(?,?,?,?,?,?,?)`)
      .bind(context.companyId,relatedEntryId,clientEntryId,amountMinor,currencyCode,paymentMethod,Number(session.identityId)));
  }
  let telemetryState='not_opted_in';
  if (['sale','purchase','freight','wage','service'].includes(entryType)&&context.telemetryEnabled&&context.telemetryOptIn&&context.sector.priceTelemetry&&quantity?.normalizedQuantityMilli&&quantity.normalizedUnitCode&&itemCode) {
    const contributorKey=await pseudonymousContributorKey(env,context.companyId,context.countryCode,context.sectorCode);
    if (contributorKey) {
      const eventKind=entryType==='freight'?'freight':entryType==='wage'?'wage':entryType==='fx_exchange'?'fx_reference':'price';
      const unitPriceMinor=Math.max(0,Math.round(amountMinor*1000/quantity.normalizedQuantityMilli));
      statements.push(env.DB.prepare(`INSERT INTO market_telemetry_events(id,country_code,sector_code,city_code,item_code,event_kind,quantity_base_milli,unit_code,unit_price_minor,trust_weight_milli,currency_code,contributor_key,trust_class,expires_at) VALUES(?,?,?,?,?,?,?,?,?,350,?,?,?,datetime('now','+90 days'))`)
        .bind(crypto.randomUUID(),context.countryCode,context.sectorCode,cityCode,itemCode,eventKind,quantity.normalizedQuantityMilli,quantity.normalizedUnitCode,unitPriceMinor,currencyCode,contributorKey,'merchant_reported'));
      telemetryState='contributed_pseudonymous';
    } else telemetryState='secret_not_configured';
  }
  const result={entryId,clientEntryId,inventoryApplied,inventoryReason:inventoryApplied?null:(itemCode&&!quantity?.normalizedQuantityMilli?'unit_mapping_not_approved':null),telemetryState,paymentStatus,fxRecorded:!!fx};
  statements.push(env.DB.prepare(`INSERT INTO daftar_sync_receipts(company_id,idempotency_key,client_entry_id,entry_id,result_json) VALUES(?,?,?,?,?)`)
    .bind(context.companyId,idempotencyKey,clientEntryId,entryId,JSON.stringify(result)));
  try {
    await env.DB.batch(statements);
  } catch (error) {
    const duplicate=await env.DB.prepare(`SELECT entry_id,result_json FROM daftar_sync_receipts WHERE company_id=? AND (idempotency_key=? OR client_entry_id=?) LIMIT 1`).bind(context.companyId,idempotencyKey,clientEntryId).first().catch(()=>null);
    if (duplicate) return {...safeParse(duplicate.result_json),clientEntryId,entryId:duplicate.entry_id,accepted:true,replayed:true};
    if (/DAFTAR_INVENTORY_UNIT_MISMATCH|DAFTAR_INVENTORY_INSUFFICIENT_STOCK|CHECK constraint failed: quantity_milli/i.test(String(error?.message||''))) throw httpError('DAFTAR_INVENTORY_CONFLICT',409,error);
    if (/DAFTAR_CREDIT_SETTLEMENT_INVALID/i.test(String(error?.message||''))) throw httpError('DAFTAR_CREDIT_SETTLEMENT_EXCEEDS_BALANCE',409,error);
    throw httpError('DAFTAR_WRITE_FAILED',503,error);
  }
  await audit(env,{session,action:'daftar.entry.recorded',resourceType:'daftar_private_entry',resourceId:null,metadata:{entryId,entryType,direction,itemCode:itemCode||null,amountMinor,currencyCode,inventoryApplied,telemetryState,requestId}});
  return {...result,accepted:true,replayed:false};
}

function buildJournalPosting({entryType,direction,paymentMethod,clientEntryId,entryId,identityId,relatedEntry}) {
  const settlementAccount=paymentMethod==='cash'?'cash':'adjustment_clearing';let transactionType=entryType,debitAccount=null,creditAccount=null;
  if(entryType==='sale'){debitAccount=paymentMethod==='credit'?'accounts_receivable':settlementAccount;creditAccount='sales_revenue';}
  else if(entryType==='purchase'){debitAccount='inventory';creditAccount=paymentMethod==='credit'?'accounts_payable':settlementAccount;}
  else if(entryType==='expense'){debitAccount='operating_expense';creditAccount=paymentMethod==='credit'?'accounts_payable':settlementAccount;}
  else if(entryType==='credit_settlement'){const payable=relatedEntry?.entry_type==='purchase'||relatedEntry?.direction==='get';transactionType=payable?'payment_out':'payment_in';if(payable){debitAccount='accounts_payable';creditAccount=settlementAccount;}else{debitAccount=settlementAccount;creditAccount='accounts_receivable';}}
  else if(entryType==='service'){if(direction==='give'){debitAccount=paymentMethod==='credit'?'accounts_receivable':settlementAccount;creditAccount='sales_revenue';}else{debitAccount='operating_expense';creditAccount=paymentMethod==='credit'?'accounts_payable':settlementAccount;}}
  else if(entryType==='wage'){debitAccount='wage_expense';creditAccount=paymentMethod==='credit'?'accounts_payable':settlementAccount;}
  else if(entryType==='freight'){if(direction==='give'){debitAccount=paymentMethod==='credit'?'accounts_receivable':settlementAccount;creditAccount='other_income';}else{debitAccount='freight_expense';creditAccount=paymentMethod==='credit'?'accounts_payable':settlementAccount;}}
  if(!debitAccount||!creditAccount||debitAccount===creditAccount)return null;
  return {id:crypto.randomUUID(),sourceEntryId:entryId,clientEntryId,transactionType,debitAccount,creditAccount,identityId};
}

export async function getDaftarDashboard(env,context) {
  const [summary,inventory,entries,sales,credit]=await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) AS entry_count FROM daftar_private_entries WHERE company_id=? AND created_at>=datetime('now','-30 days')`).bind(context.companyId).first(),
    env.DB.prepare(`SELECT item_code,quantity_milli,unit_code,updated_at FROM daftar_inventory_balances WHERE company_id=? ORDER BY item_code LIMIT 100`).bind(context.companyId).all(),
    env.DB.prepare(`SELECT id,entry_type,direction,item_code,origin_code,destination_code,reference_code,quantity_milli,unit_code,amount_minor,currency_code,payment_method,payment_status,counterparty_label,created_at FROM daftar_private_entries WHERE company_id=? ORDER BY created_at DESC LIMIT 20`).bind(context.companyId).all(),
    env.DB.prepare(`SELECT currency_code,COALESCE(SUM(amount_minor),0) AS amount_minor FROM daftar_private_entries WHERE company_id=? AND entry_type='sale' AND created_at>=datetime('now','-30 days') GROUP BY currency_code ORDER BY currency_code`).bind(context.companyId).all(),
    env.DB.prepare(`SELECT CASE WHEN direction='get' THEN 'payable' ELSE 'receivable' END AS credit_side,currency_code,COUNT(*) AS open_count,COALESCE(SUM(amount_minor-settled_amount_minor),0) AS outstanding_minor FROM daftar_private_entries WHERE company_id=? AND payment_method='credit' AND settled_amount_minor<amount_minor GROUP BY credit_side,currency_code ORDER BY credit_side,currency_code`).bind(context.companyId).all()
  ]);
  const receivables=(credit.results||[]).filter(x=>x.credit_side==='receivable').map(x=>({currencyCode:x.currency_code,amountMinor:Number(x.outstanding_minor||0),openCount:Number(x.open_count||0)}));const payables=(credit.results||[]).filter(x=>x.credit_side==='payable').map(x=>({currencyCode:x.currency_code,amountMinor:Number(x.outstanding_minor||0),openCount:Number(x.open_count||0)}));return {summary:{entryCount:Number(summary?.entry_count||0),reportedSalesByCurrency:(sales.results||[]).map(x=>({currencyCode:x.currency_code,amountMinor:Number(x.amount_minor||0)})),qarzReceivableByCurrency:receivables,qarzPayableByCurrency:payables,qarzOutstandingByCurrency:[...receivables,...payables],openReceivableEntries:receivables.reduce((n,x)=>n+x.openCount,0),openPayableEntries:payables.reduce((n,x)=>n+x.openCount,0),openCreditEntries:(credit.results||[]).reduce((n,x)=>n+Number(x.open_count||0),0)},inventory:inventory.results||[],recentEntries:entries.results||[]};
}

export async function updateTelemetryConsent(env,session,context,optIn) {
  const enabled=optIn===true;
  if(enabled&&!context.telemetryEnabled)throw httpError('DAFTAR_TELEMETRY_VERIFICATION_REQUIRED',403);
  const previous=await env.DB.prepare(`SELECT contributor_key FROM daftar_market_consents WHERE company_id=? AND country_code=? AND sector_code=? LIMIT 1`).bind(context.companyId,context.countryCode,context.sectorCode).first();
  const contributorKey=enabled?await pseudonymousContributorKey(env,context.companyId,context.countryCode,context.sectorCode):null;
  await env.DB.prepare(`INSERT INTO daftar_market_consents(company_id,country_code,sector_code,telemetry_opt_in,contributor_key,consent_version,consented_by_identity_id,consented_at,withdrawn_at,updated_at) VALUES(?,?,?,?,?,?,?,CASE WHEN ?=1 THEN CURRENT_TIMESTAMP ELSE NULL END,CASE WHEN ?=0 THEN CURRENT_TIMESTAMP ELSE NULL END,CURRENT_TIMESTAMP) ON CONFLICT(company_id,country_code,sector_code) DO UPDATE SET telemetry_opt_in=excluded.telemetry_opt_in,contributor_key=excluded.contributor_key,consent_version=excluded.consent_version,consented_by_identity_id=excluded.consented_by_identity_id,consented_at=CASE WHEN excluded.telemetry_opt_in=1 THEN CURRENT_TIMESTAMP ELSE daftar_market_consents.consented_at END,withdrawn_at=CASE WHEN excluded.telemetry_opt_in=0 THEN CURRENT_TIMESTAMP ELSE NULL END,updated_at=CURRENT_TIMESTAMP`)
    .bind(context.companyId,context.countryCode,context.sectorCode,enabled?1:0,contributorKey,template.schemaVersion,Number(session.identityId),enabled?1:0,enabled?1:0).run();
  if (!enabled||previous?.contributor_key&&previous.contributor_key!==contributorKey) {
    if(previous?.contributor_key)await env.DB.prepare(`DELETE FROM market_telemetry_events WHERE contributor_key=?`).bind(previous.contributor_key).run();
    await env.DB.prepare(`DELETE FROM daftar_market_price_indices WHERE country_code=? AND sector_code=?`).bind(context.countryCode,context.sectorCode).run();
    await env.KV_BINDING.delete(`daftar:market-prices:${context.countryCode}:${context.sectorCode}`);
  }
  await audit(env,{session,action:enabled?'daftar.telemetry.consent_granted':'daftar.telemetry.consent_withdrawn',resourceType:'daftar_market_consent',resourceId:null,metadata:{countryCode:context.countryCode,sectorCode:context.sectorCode,consentVersion:template.schemaVersion}});
  return {telemetryOptIn:enabled,consentVersion:template.schemaVersion};
}

export async function getMarketPriceFeed(env,context) {
  const key=`daftar:market-prices:${context.countryCode}:${context.sectorCode}`;
  const value=await env.KV_BINDING.get(key,'json');
  if (!value||!value.generatedAt||Date.now()-Date.parse(value.generatedAt)>20*60*1000) throw httpError('DAFTAR_MARKET_FEED_NOT_READY',503);
  return value;
}

export async function aggregateMarketTelemetry(env,{now=new Date()}={}) {
  const since=new Date(now.getTime()-24*60*60*1000).toISOString();
  const sinceSql=since.replace('T',' ').slice(0,19);
  const profiles=await env.DB.prepare(`SELECT mp.country_code,mp.sector_code,mp.minimum_cohort_size,mp.status,mp.telemetry_enabled,EXISTS(SELECT 1 FROM country_product_launches l WHERE l.country_code=mp.country_code AND l.status='active' AND l.active=1) AS product_active FROM daftar_market_profiles mp`).all();
  // Privacy cleanup runs even when aggregation is disabled or the HMAC secret is missing.
  await env.DB.prepare(`DELETE FROM market_telemetry_events WHERE contributor_key NOT IN (SELECT mc.contributor_key FROM daftar_market_consents mc JOIN company_verification_status cvs ON cvs.company_id=mc.company_id JOIN companies c ON c.id=mc.company_id WHERE mc.telemetry_opt_in=1 AND mc.withdrawn_at IS NULL AND mc.contributor_key IS NOT NULL AND lower(cvs.status)='verified' AND c.deletion_status='active')`).run();
  await env.DB.prepare(`DELETE FROM market_telemetry_events WHERE expires_at<=CURRENT_TIMESTAMP`).run();
  const secret=String(env.DAFTAR_TELEMETRY_HMAC_SECRET||'');
  if(secret.length<32){await env.DB.prepare(`DELETE FROM daftar_market_price_indices`).run();for(const p of profiles.results||[]){await env.KV_BINDING.delete(`daftar:market-prices:${p.country_code}:${p.sector_code}`);const publication=await env.DB.prepare(`SELECT publication_id,allowed_indicators_json FROM public_data_publications WHERE country_code=? AND sector_code=? AND status IN ('approved','published') ORDER BY created_at DESC LIMIT 1`).bind(p.country_code,p.sector_code).first().catch(()=>null);const allowed=JSON.parse(publication?.allowed_indicators_json||'[]');const needsTelemetry=allowed.includes('median_unit_price');let fxReferenceCount=0;if(publication&&allowed.includes('approved_fx_reference')){const fx=await env.DB.prepare(`SELECT COUNT(*) count FROM daftar_fx_quotes WHERE country_code=? AND status='approved' AND valid_until>CURRENT_TIMESTAMP`).bind(p.country_code).first();fxReferenceCount=Number(fx?.count||0);}const status=!needsTelemetry&&allowed.includes('approved_fx_reference')&&fxReferenceCount>0&&p.status==='active'&&Number(p.product_active)===1?'pass':'blocked';await env.DB.prepare(`INSERT INTO public_data_quality_runs(quality_run_id,country_code,sector_code,publication_id,run_status,input_count,qualified_index_count,qualified_contributor_count,suppressed_index_count,stale_index_count,checks_json) VALUES(?,?,?, ?,?,0,0,0,0,0,?)`).bind(crypto.randomUUID(),p.country_code,p.sector_code,publication?.publication_id||null,status,JSON.stringify({telemetrySecretConfigured:false,telemetryPricePublicationBlocked:true,approvedFxReferenceCount:fxReferenceCount,marketProductActive:Number(p.product_active)===1,marketProfileActive:p.status==='active',reason:'telemetry_secret_not_configured_for_merchant_telemetry'})).run().catch(()=>{});}return {groups:0,indices:0,received:0,reason:'telemetry_secret_not_configured'};}
  // The current verified/consented contributor set has already been rechecked above.
  const rows=await env.DB.prepare(`SELECT country_code,sector_code,city_code,item_code,event_kind,unit_code,unit_price_minor,trust_weight_milli,currency_code,contributor_key,trust_class,created_at FROM market_telemetry_events WHERE created_at>=? AND expires_at>CURRENT_TIMESTAMP AND item_code IS NOT NULL ORDER BY created_at DESC LIMIT 10000`).bind(sinceSql).all();
  const publications=await env.DB.prepare(`SELECT country_code,sector_code,minimum_cohort_size FROM public_data_publications WHERE status IN ('approved','published')`).all();const publicationMap=new Map((publications.results||[]).map(p=>[`${p.country_code}|${p.sector_code}`,Number(p.minimum_cohort_size)||5]));
  const profileMap=new Map((profiles.results||[]).filter(p=>['pilot','active'].includes(p.status)&&Number(p.telemetry_enabled)===1&&Number(p.product_active)===1).map(p=>{const key=`${p.country_code}|${p.sector_code}`;return [key,Math.max(5,Number(p.minimum_cohort_size)||5,publicationMap.get(key)||5)];}));
  const groups=new Map();
  for (const row of rows.results||[]) {
    const profileKey=`${row.country_code}|${row.sector_code}`;
    if(!profileMap.has(profileKey))continue;
    const key=[row.country_code,row.sector_code,row.city_code||'ALL',row.item_code,row.event_kind,row.unit_code,row.currency_code].join('|');
    const group=groups.get(key)||{countryCode:row.country_code,sectorCode:row.sector_code,cityCode:row.city_code||'ALL',itemCode:row.item_code,eventKind:row.event_kind,unitCode:row.unit_code,currencyCode:row.currency_code,prices:[]};
    group.prices.push({price:Number(row.unit_price_minor),weight:Number(row.trust_weight_milli)||350,contributor:row.contributor_key,trustClass:row.trust_class});groups.set(key,group);
  }
  const feeds=new Map();const writes=[];const qualifiedContributorSets=new Map();
  for (const group of groups.values()) {
    const minimum=profileMap.get(`${group.countryCode}|${group.sectorCode}`)||5;
    const distinct=new Set(group.prices.map(x=>x.contributor));if(distinct.size<minimum)continue;
    const median=weightedMedian(group.prices);
    const kept=group.prices.filter(value=>value.price>=median*0.8&&value.price<=median*1.2);
    const keptContributors=new Set(kept.map(x=>x.contributor));
    if(kept.length<minimum||keptContributors.size<minimum)continue;
    const contributorKey=`${group.countryCode}|${group.sectorCode}`;const contributorSet=qualifiedContributorSets.get(contributorKey)||new Set();for(const contributor of keptContributors)contributorSet.add(contributor);qualifiedContributorSets.set(contributorKey,contributorSet);
    const cleanMedian=Math.round(weightedMedian(kept));
    const item={countryCode:group.countryCode,sectorCode:group.sectorCode,cityCode:group.cityCode,itemCode:group.itemCode,eventKind:group.eventKind,unitCode:group.unitCode,currencyCode:group.currencyCode,medianUnitPriceMinor:cleanMedian,sampleCount:kept.length,contributorCount:keptContributors.size,outlierCount:group.prices.length-kept.length,trustClass:kept.every(x=>x.trustClass==='provider_verified')?'provider_verified':'merchant_reported',windowStartedAt:since,windowEndedAt:now.toISOString(),generatedAt:now.toISOString()};
    const key=`${item.countryCode}|${item.sectorCode}`;const feed=feeds.get(key)||{countryCode:item.countryCode,sectorCode:item.sectorCode,generatedAt:now.toISOString(),windowHours:24,minimumCohortSize:minimum,items:[]};feed.items.push(item);feeds.set(key,feed);
    writes.push(env.DB.prepare(`INSERT INTO daftar_market_price_indices(country_code,sector_code,city_code,item_code,unit_code,currency_code,median_unit_price_minor,sample_count,contributor_count,outlier_count,trust_class,window_started_at,window_ended_at,generated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(item.countryCode,item.sectorCode,item.cityCode,item.itemCode,item.unitCode,item.currencyCode,item.medianUnitPriceMinor,item.sampleCount,item.contributorCount,item.outlierCount,item.trustClass,item.windowStartedAt,item.windowEndedAt,item.generatedAt));
  }
  // This table is a replaceable snapshot, not a second source of truth.
  await env.DB.prepare(`DELETE FROM daftar_market_price_indices`).run();
  for(let i=0;i<writes.length;i+=100)await env.DB.batch(writes.slice(i,i+100));
  for(const profile of profiles.results||[]){
    const key=`${profile.country_code}|${profile.sector_code}`;const kvKey=`daftar:market-prices:${profile.country_code}:${profile.sector_code}`;const feed=feeds.get(key);
    if(feed&&profileMap.has(key))await env.KV_BINDING.put(kvKey,JSON.stringify(feed),{expirationTtl:1200});else await env.KV_BINDING.delete(kvKey);
  }
  for(const profile of profiles.results||[]){
    const key=`${profile.country_code}|${profile.sector_code}`;const feed=feeds.get(key);const publication=await env.DB.prepare(`SELECT publication_id,minimum_cohort_size,maximum_age_minutes,allowed_indicators_json FROM public_data_publications WHERE country_code=? AND sector_code=? AND status IN ('approved','published') ORDER BY created_at DESC LIMIT 1`).bind(profile.country_code,profile.sector_code).first();
    const qualified=feed?.items?.length||0;const inputCount=(rows.results||[]).filter(r=>r.country_code===profile.country_code&&r.sector_code===profile.sector_code).length;const inputGroups=[...groups.values()].filter(g=>g.countryCode===profile.country_code&&g.sectorCode===profile.sector_code).length;const suppressed=Math.max(0,inputGroups-qualified);const allowed=JSON.parse(publication?.allowed_indicators_json||'[]');const needsPrice=allowed.includes('median_unit_price'),needsFx=allowed.includes('approved_fx_reference');let fxReferenceCount=0;if(publication&&needsFx){const fx=await env.DB.prepare(`SELECT COUNT(*) count FROM daftar_fx_quotes WHERE country_code=? AND status='approved' AND valid_until>CURRENT_TIMESTAMP`).bind(profile.country_code).first();fxReferenceCount=Number(fx?.count||0);}const pricePass=!needsPrice||(qualified>0&&Number(profile.telemetry_enabled)===1&&secret.length>=32);const fxPass=!needsFx||fxReferenceCount>0;const dataPass=publication?(allowed.length>0&&pricePass&&fxPass):qualified>0;const runStatus=dataPass&&Number(profile.product_active)===1&&profile.status==='active'?'pass':inputCount>0?'partial':'blocked';
    await env.DB.prepare(`INSERT INTO public_data_quality_runs(quality_run_id,country_code,sector_code,publication_id,run_status,input_count,qualified_index_count,qualified_contributor_count,suppressed_index_count,stale_index_count,checks_json) VALUES(?,?,?,?,?,?,?,?,?,0,?)`).bind(crypto.randomUUID(),profile.country_code,profile.sector_code,publication?.publication_id||null,runStatus,inputCount,qualified,qualifiedContributorSets.get(`${profile.country_code}|${profile.sector_code}`)?.size||0,suppressed,JSON.stringify({minimumCohort:Number(publication?.minimum_cohort_size||profile.minimum_cohort_size||5),marketProductActive:Number(profile.product_active)===1,marketProfileActive:profile.status==='active',telemetrySecretConfigured:true,aggregationWindowHours:24,outlierFilter:'±20%',approvedFxReferenceCount:fxReferenceCount,priceIndicatorRequired:needsPrice,fxReferenceRequired:needsFx,priceIndicatorPass:pricePass,fxReferencePass:fxPass,rawTenantIdentifiersExposed:false})).run();
  }
  return {groups:feeds.size,indices:writes.length,received:(rows.results||[]).length};
}

export async function createBatchPassport(env,session,context,input) {
  const productCode=String(input?.productCode||'').trim().toLowerCase();
  const batchCode=String(input?.batchCode||'').trim();
  if (!/^[a-z0-9][a-z0-9._:-]{0,79}$/.test(productCode)||!/^[A-Za-z0-9][A-Za-z0-9._:-]{1,79}$/.test(batchCode)) throw httpError('DAFTAR_PASSPORT_IDENTITY_INVALID',400);
  const quantity=await normalizeQuantity(env,context,input?.quantity,input?.unitCode);
  const visibility=input?.visibility==='public'?'public':'private';
  if (!quantity.normalizedQuantityMilli) throw httpError('DAFTAR_PASSPORT_UNIT_NOT_APPROVED',409);
  const id=crypto.randomUUID();const token=randomToken();const tokenHash=await sha256(token);
  await env.DB.prepare(`INSERT INTO batch_passports(id,company_id,current_custodian_company_id,country_code,sector_code,product_code,batch_code,quantity_milli,unit_code,normalized_quantity_milli,normalized_unit_code,public_token_hash,visibility,created_by_identity_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(id,context.companyId,context.companyId,context.countryCode,context.sectorCode,productCode,batchCode,quantity.quantityMilli,quantity.unitCode,quantity.normalizedQuantityMilli,quantity.normalizedUnitCode,tokenHash,visibility,Number(session.identityId)).run();
  await env.DB.prepare(`INSERT INTO batch_events(id,passport_id,company_id,event_type,output_quantity_milli,unit_code,details_json,created_by_identity_id) VALUES(?,?,?,'origin',?,?,?,?)`)
    .bind(crypto.randomUUID(),id,context.companyId,quantity.normalizedQuantityMilli,quantity.normalizedUnitCode,JSON.stringify({recorded:'merchant_declared'}),Number(session.identityId)).run();
  await audit(env,{session,action:'daftar.passport.created',resourceType:'batch_passport',resourceId:null,metadata:{passportId:id,productCode,batchCode,visibility}});
  return {passport:{id,productCode,batchCode,quantityMilli:quantity.quantityMilli,unitCode:quantity.unitCode,visibility,status:'active'},publicToken:visibility==='public'?token:null,verificationPath:visibility==='public'?`/api/v1/daftar/verify/${token}`:null};
}

export async function listBatchPassports(env,context) {
  const result=await env.DB.prepare(`SELECT id,company_id,current_custodian_company_id,country_code,sector_code,product_code,batch_code,quantity_milli,unit_code,normalized_quantity_milli,normalized_unit_code,visibility,status,created_at,updated_at FROM batch_passports WHERE company_id=? OR current_custodian_company_id=? ORDER BY updated_at DESC LIMIT 100`).bind(context.companyId,context.companyId).all();
  return result.results||[];
}

export async function appendBatchEvent(env,session,context,passportId,input) {
  const passport=await env.DB.prepare(`SELECT * FROM batch_passports WHERE id=? AND current_custodian_company_id=? LIMIT 1`).bind(passportId,context.companyId).first();
  if (!passport) throw httpError('DAFTAR_PASSPORT_NOT_FOUND',404);
  const eventType=String(input?.eventType||'').toLowerCase();
  if (!PASSPORT_EVENTS.has(eventType)) throw httpError('DAFTAR_PASSPORT_EVENT_INVALID',400);
  let missionId=Number(input?.missionId||0)||null;let fileId=Number(input?.fileId||0)||null;
  if (missionId) {const mission=await getForSession(env,session,missionId);if(!mission)throw httpError('DAFTAR_MISSION_REFERENCE_DENIED',404);}
  if (eventType==='lab_test'&&!fileId) throw httpError('DAFTAR_LAB_EVIDENCE_REQUIRED',400);
  if (eventType==='mission'&&!missionId) throw httpError('DAFTAR_MISSION_REFERENCE_REQUIRED',400);
  let evidenceSha256=null;
  if (fileId) {const file=await env.DB.prepare(`SELECT id,content_sha256,mime_type,evidence_type,disposition_status FROM mission_files WHERE id=? AND company_id=? LIMIT 1`).bind(fileId,context.companyId).first();if(!file||file.disposition_status!=='active')throw httpError('DAFTAR_FILE_REFERENCE_DENIED',404);if(!file.content_sha256)throw httpError('DAFTAR_FILE_INTEGRITY_UNAVAILABLE',409);if(eventType==='lab_test'&&(file.mime_type!=='application/pdf'||!['critical_evidence','compliance_evidence'].includes(file.evidence_type)))throw httpError('DAFTAR_LAB_PDF_EVIDENCE_REQUIRED',422);evidenceSha256=String(file.content_sha256);}
  let inputQ=null,outputQ=null,additives=0,waste=0,unitCode=passport.normalized_unit_code;
  if (eventType==='mass_balance') {
    inputQ=positiveInt(input?.inputQuantityMilli);outputQ=positiveInt(input?.outputQuantityMilli);additives=nonNegativeInt(input?.additiveQuantityMilli||0);waste=nonNegativeInt(input?.wasteQuantityMilli||0);
    if (input?.unitCode!==unitCode) throw httpError('DAFTAR_MASS_BALANCE_UNIT_MISMATCH',409);
    if (outputQ+waste>inputQ+additives) throw httpError('DAFTAR_MASS_BALANCE_EXCEEDED',409);
  }
  const details=allowlistedDetails(input?.details||{});
  const evidenceClass=eventType==='mass_balance'?'system_rule_checked':eventType==='custody_handoff'?'counterparty_acknowledged':fileId?'file_hash_linked':missionId?'mission_linked':'merchant_attested';
  const eventId=crypto.randomUUID();
  await env.DB.prepare(`INSERT INTO batch_events(id,passport_id,company_id,event_type,input_quantity_milli,output_quantity_milli,additive_quantity_milli,waste_quantity_milli,unit_code,evidence_class,evidence_sha256,mission_id,file_id,evidence_reference,details_json,created_by_identity_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(eventId,passportId,context.companyId,eventType,inputQ,outputQ,additives,waste,unitCode,evidenceClass,evidenceSha256,missionId,fileId,cleanOptional(input?.evidenceReference,160),JSON.stringify(details),Number(session.identityId)).run();
  await env.DB.prepare(`UPDATE batch_passports SET updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(passportId).run();
  await audit(env,{session,action:'daftar.passport.event_recorded',resourceType:'batch_event',resourceId:null,metadata:{passportId,eventId,eventType,missionId,fileId}});
  return {eventId,eventType,recorded:true,evidenceClass,evidenceReferenceState:missionId||fileId?'tenant_reference_checked':'none'};
}

export async function createCustodyTransfer(env,session,context,passportId,input) {
  const passport=await env.DB.prepare(`SELECT id,current_custodian_company_id,country_code,sector_code FROM batch_passports WHERE id=? AND current_custodian_company_id=? AND status='active' LIMIT 1`).bind(passportId,context.companyId).first();
  if (!passport) throw httpError('DAFTAR_PASSPORT_NOT_CUSTODIAN',403);
  const toCompanyId=Number(input?.toCompanyId||0);
  if (!Number.isInteger(toCompanyId)||toCompanyId<=0||toCompanyId===context.companyId) throw httpError('DAFTAR_TRANSFER_RECIPIENT_INVALID',400);
  const recipient=await env.DB.prepare(`SELECT c.id FROM companies c JOIN company_management_profiles cmp ON cmp.company_id=c.id JOIN daftar_market_profiles mp ON mp.country_code=cmp.country_code AND mp.sector_code=cmp.sector_code AND mp.status IN ('pilot','active') WHERE c.id=? AND c.deletion_status='active' AND cmp.status IN ('ACTIVE','ONBOARDING','PENDING_VERIFICATION','VERIFIED') AND cmp.country_code=? AND cmp.sector_code=? AND EXISTS(SELECT 1 FROM country_product_launches l WHERE l.country_code=cmp.country_code AND l.status='active' AND l.active=1) LIMIT 1`).bind(toCompanyId,context.countryCode,passport.sector_code).first();
  if (!recipient) throw httpError('DAFTAR_TRANSFER_RECIPIENT_NOT_ELIGIBLE',403);
  const id=crypto.randomUUID();const token=randomToken();const tokenHash=await sha256(token);
  await env.DB.prepare(`INSERT INTO daftar_custody_transfers(id,passport_id,from_company_id,to_company_id,challenge_hash,status,expires_at,created_by_identity_id) VALUES(?,?,?,?,?,'pending',datetime('now','+30 minutes'),?)`)
    .bind(id,passportId,context.companyId,toCompanyId,tokenHash,Number(session.identityId)).run();
  await audit(env,{session,action:'daftar.passport.custody_transfer_requested',resourceType:'daftar_custody_transfer',resourceId:null,metadata:{passportId,transferId:id,toCompanyId}});
  return {transferId:id,challengeToken:token,expiresInSeconds:1800,status:'pending'};
}

export async function confirmCustodyTransfer(env,session,context,transferId,token) {
  const challenge=String(token||'').trim();if(!/^[a-f0-9]{64}$/.test(challenge))throw httpError('DAFTAR_TRANSFER_TOKEN_INVALID',400);
  const transfer=await env.DB.prepare(`SELECT t.*,p.current_custodian_company_id FROM daftar_custody_transfers t JOIN batch_passports p ON p.id=t.passport_id WHERE t.id=? AND t.to_company_id=? AND t.status='pending' AND t.expires_at>CURRENT_TIMESTAMP LIMIT 1`).bind(transferId,context.companyId).first();
  if (!transfer) throw httpError('DAFTAR_TRANSFER_NOT_PENDING',404);
  if (transfer.current_custodian_company_id!==transfer.from_company_id||await sha256(challenge)!==transfer.challenge_hash) throw httpError('DAFTAR_TRANSFER_PROOF_INVALID',403);
  const statements=[
    env.DB.prepare(`UPDATE daftar_custody_transfers SET status='confirmed',confirmed_at=CURRENT_TIMESTAMP WHERE id=? AND to_company_id=? AND status='pending' AND expires_at>CURRENT_TIMESTAMP`).bind(transferId,context.companyId),
    env.DB.prepare(`UPDATE batch_passports SET current_custodian_company_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND current_custodian_company_id=? AND EXISTS(SELECT 1 FROM daftar_custody_transfers WHERE id=? AND status='confirmed' AND to_company_id=?)`).bind(context.companyId,transfer.passport_id,transfer.from_company_id,transferId,context.companyId),
    env.DB.prepare(`INSERT INTO batch_events(id,passport_id,company_id,event_type,evidence_class,details_json,created_by_identity_id) SELECT ?,?,?, 'custody_handoff','counterparty_acknowledged',?,? WHERE EXISTS(SELECT 1 FROM batch_passports WHERE id=? AND current_custodian_company_id=?)`).bind(crypto.randomUUID(),transfer.passport_id,context.companyId,JSON.stringify({fromCompanyId:transfer.from_company_id,toCompanyId:context.companyId,confirmation:'two_party_authenticated_qr'}),Number(session.identityId),transfer.passport_id,context.companyId)
  ];
  const results=await env.DB.batch(statements);
  if (Number(results?.[0]?.meta?.changes||0)!==1||Number(results?.[1]?.meta?.changes||0)!==1) throw httpError('DAFTAR_TRANSFER_RACE',409);
  await audit(env,{session,action:'daftar.passport.custody_transfer_confirmed',resourceType:'daftar_custody_transfer',resourceId:null,metadata:{passportId:transfer.passport_id,transferId}});
  return {transferId,status:'confirmed',passportId:transfer.passport_id};
}

export async function verifyPublicPassport(env,token) {
  if (!/^[a-f0-9]{64}$/.test(String(token||''))) throw httpError('DAFTAR_PASSPORT_NOT_FOUND',404);
  const tokenHash=await sha256(token);
  const passport=await env.DB.prepare(`SELECT id,country_code,sector_code,product_code,batch_code,quantity_milli,unit_code,normalized_quantity_milli,normalized_unit_code,status,created_at FROM batch_passports WHERE public_token_hash=? AND visibility='public' LIMIT 1`).bind(tokenHash).first();
  if (!passport) throw httpError('DAFTAR_PASSPORT_NOT_FOUND',404);
  const events=await env.DB.prepare(`SELECT event_type,evidence_class,created_at FROM batch_events WHERE passport_id=? ORDER BY created_at ASC LIMIT 100`).bind(passport.id).all();
  return {passport:{countryCode:passport.country_code,sectorCode:passport.sector_code,productCode:passport.product_code,batchCode:passport.batch_code,quantityMilli:passport.quantity_milli,unitCode:passport.unit_code,normalizedQuantityMilli:passport.normalized_quantity_milli,normalizedUnitCode:passport.normalized_unit_code,status:passport.status,createdAt:passport.created_at},events:events.results||[],disclaimer:'This public view reports records submitted to ON Mission. It does not independently certify product authenticity, laboratory accreditation, regulatory compliance or physical custody.'};
}

export async function getApprovedFxQuote(env,context,baseCurrency,quoteCurrency) {
  const base=String(baseCurrency||'').toUpperCase(),quote=String(quoteCurrency||'').toUpperCase();
  if(!CURRENCIES.has(base)||!CURRENCIES.has(quote)||base===quote)throw httpError('DAFTAR_FX_PAIR_INVALID',400);
  const row=await env.DB.prepare(`SELECT id,base_currency,quote_currency,rate_numerator,rate_denominator,source_code,source_reference,observed_at,valid_until,status FROM daftar_fx_quotes WHERE country_code=? AND base_currency=? AND quote_currency=? AND status='approved' AND valid_until>CURRENT_TIMESTAMP ORDER BY observed_at DESC LIMIT 1`).bind(context.countryCode,base,quote).first();
  if(!row)throw httpError('DAFTAR_FX_QUOTE_UNAVAILABLE',503);
  return row;
}

export function convertWithApprovedQuote(amountMinor,quote) {
  if (!quote||quote.status!=='approved'||!Number.isFinite(Date.parse(quote.valid_until))||Date.parse(quote.valid_until)<=Date.now()) throw httpError('DAFTAR_FX_QUOTE_UNAVAILABLE',409);
  const n=Number(quote.rate_numerator),d=Number(quote.rate_denominator),amount=Number(amountMinor);
  if (!Number.isSafeInteger(n)||!Number.isSafeInteger(d)||n<=0||d<=0||!Number.isSafeInteger(amount)||amount<0) throw httpError('DAFTAR_FX_QUOTE_INVALID',409);
  const numerator=BigInt(amount)*BigInt(n),denominator=BigInt(d);
  const rounded=(numerator*2n+denominator)/(2n*denominator);
  if(rounded>BigInt(Number.MAX_SAFE_INTEGER))throw httpError('DAFTAR_FX_AMOUNT_OVERFLOW',422);
  return Number(rounded);
}

async function pseudonymousContributorKey(env,companyId,countryCode,sectorCode) {
  const secret=String(env.DAFTAR_TELEMETRY_HMAC_SECRET||'');if(secret.length<32)return null;
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const signature=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`daftar-contributor:v1:${companyId}:${countryCode}:${sectorCode}`));
  return [...new Uint8Array(signature)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
function weightedMedian(samples){const sorted=[...samples].sort((a,b)=>a.price-b.price);const total=sorted.reduce((n,x)=>n+x.weight,0);let cumulative=0;for(const item of sorted){cumulative+=item.weight;if(cumulative>=total/2)return item.price;}return sorted.at(-1)?.price||0;}
function validateOpaqueId(value,code){const v=String(value||'').trim();if(!/^[A-Za-z0-9._:-]{8,128}$/.test(v))throw httpError(code,400);return v;}
function safeId(value){const v=String(value||'');return /^[A-Za-z0-9._:-]{8,128}$/.test(v)?v:null;}
function normalizeRegionCode(country,value){const raw=String(value||'').trim().toUpperCase();if(!raw)return null;if(!/^[A-Z0-9_-]{2,32}$/.test(raw))return null;const cc=String(country||'').toUpperCase();return raw.startsWith(`${cc}-`)?raw:`${cc}-${raw}`;}
function normalizeCityCode(value){const v=String(value||'').trim().toUpperCase();if(!v)return null;if(!/^[A-Z0-9_-]{2,32}$/.test(v))throw httpError('DAFTAR_CITY_CODE_INVALID',400);return v;}
function validateCounterpartyLabel(value){const v=cleanOptional(value,120);if(!v)return null;if(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(v)||/\+?\d[\d\s().-]{7,}/.test(v))throw httpError('DAFTAR_COUNTERPARTY_CONTACT_NOT_ALLOWED',400);return v;}
function validatePrivateNote(value){const v=cleanOptional(value,500);if(!v)return null;if(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(v)||/\+?\d[\d\s().-]{7,}/.test(v))throw httpError('DAFTAR_PRIVATE_NOTE_CONTACT_NOT_ALLOWED',400);return v;}
function cleanOptional(value,max){if(value===undefined||value===null||value==='')return null;const v=String(value).trim();if(v.length>max)throw httpError('DAFTAR_FIELD_TOO_LONG',400);return v||null;}
function validClientTime(value){if(!value)return null;const t=Date.parse(String(value));if(!Number.isFinite(t)||t<Date.now()-7*86400000||t>Date.now()+5*60000)throw httpError('DAFTAR_CLIENT_TIME_INVALID',400);return new Date(t).toISOString();}
function positiveInt(value){const n=Number(value);if(!Number.isSafeInteger(n)||n<=0)throw httpError('DAFTAR_QUANTITY_INVALID',400);return n;}
function nonNegativeInt(value){const n=Number(value);if(!Number.isSafeInteger(n)||n<0)throw httpError('DAFTAR_QUANTITY_INVALID',400);return n;}
function allowlistedDetails(value){const source=value&&typeof value==='object'&&!Array.isArray(value)?value:{};const allowed=['originCode','processCode','gradeCode','conditionCode','labName','labReference','noteCode'];const out={};for(const key of allowed){if(source[key]!==undefined){const v=String(source[key]).trim();if(v.length>120)throw httpError('DAFTAR_EVENT_DETAIL_INVALID',400);out[key]=v;}}return out;}
function randomToken(){const bytes=new Uint8Array(32);crypto.getRandomValues(bytes);return [...bytes].map(x=>x.toString(16).padStart(2,'0')).join('');}
async function sha256(value){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(value)));return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');}
function safeParse(value){try{return JSON.parse(value||'{}')}catch{return {}}}
function httpError(code,status,cause){const e=new Error(code);e.code=code;e.status=status;if(cause)e.cause=cause;return e;}
