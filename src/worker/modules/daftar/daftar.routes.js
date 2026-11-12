import { json, readJson } from '../../core/http.js';
import { requireOrganizationRole } from '../../core/auth-session.js';
import { limitAction } from '../../security/action-limit.js';
import {
  aggregateMarketTelemetry, appendBatchEvent, confirmCustodyTransfer, createBatchPassport,
  createCustodyTransfer, daftarTemplate, getDaftarContext, getDaftarDashboard,
  getApprovedFxQuote, getMarketPriceFeed, listBatchPassports, recordSyncBatch, updateTelemetryConsent, convertWithApprovedQuote, normalizeMoney,
  verifyPublicPassport
} from './daftar.service.js';

const WRITERS=['owner','admin','manager','operator'];
const ADMINS=['owner','admin'];

export function registerDaftarRoutes(router) {
  router.get('/api/v1/daftar/bootstrap', async ({request,env}) => runTenant(request,env,'daftar-bootstrap',async(session,context)=>{
    const dashboard=await getDaftarDashboard(env,context);
    return {success:true,offlineScope:`${context.companyId}:${Number(session.identityId)}`,market:{countryCode:context.countryCode,sectorCode:context.sectorCode,status:context.marketStatus,templateVersion:context.templateVersion,productVersion:context.productVersion},sector:context.sector,template:daftarTemplate(),privacy:{telemetryOptIn:context.telemetryOptIn,telemetryEnabled:context.telemetryEnabled,minimumCohortSize:context.minimumCohortSize},...dashboard};
  },{limit:60,windowSeconds:60}));

  router.get('/api/v1/daftar/book/summary',async({request,env})=>runTenant(request,env,'daftar-book-summary',async(session,context)=>{
    const [rows,reports]=await Promise.all([env.DB.prepare(`SELECT transaction_type,debit_account,credit_account,amount_minor,currency_code,payment_method,payment_evidence_class,created_at FROM daftar_book_journal_transactions WHERE company_id=? ORDER BY created_at DESC LIMIT 10000`).bind(context.companyId).all(),env.DB.prepare(`SELECT substr(created_at,1,10) AS day,currency_code,SUM(CASE WHEN credit_account IN ('sales_revenue','other_income') THEN amount_minor ELSE 0 END) AS income_minor,SUM(CASE WHEN debit_account='inventory' THEN amount_minor ELSE 0 END) AS purchases_minor,SUM(CASE WHEN debit_account IN ('operating_expense','wage_expense','freight_expense') THEN amount_minor ELSE 0 END) AS expenses_minor,SUM(CASE WHEN debit_account='cash' THEN amount_minor ELSE 0 END) AS cash_in_minor,SUM(CASE WHEN credit_account='cash' THEN amount_minor ELSE 0 END) AS cash_out_minor FROM daftar_book_journal_transactions WHERE company_id=? AND created_at>=datetime('now','-30 days') GROUP BY substr(created_at,1,10),currency_code ORDER BY day DESC,currency_code LIMIT 100`).bind(context.companyId).all()]);
    const balances=new Map();for(const r of rows.results||[]){for(const [account,side] of [[r.debit_account,'debit'],[r.credit_account,'credit']]){const key=`${r.currency_code}|${account}`;const v=balances.get(key)||{currencyCode:r.currency_code,accountCode:account,debitMinor:0,creditMinor:0};v[side==='debit'?'debitMinor':'creditMinor']+=Number(r.amount_minor);balances.set(key,v);}}
    const accounts=[...balances.values()].map(x=>({...x,balanceMinor:x.debitMinor-x.creditMinor}));const byCurrency=new Map();for(const x of accounts){const v=byCurrency.get(x.currencyCode)||{currencyCode:x.currencyCode,totalDebitsMinor:0,totalCreditsMinor:0};v.totalDebitsMinor+=x.debitMinor;v.totalCreditsMinor+=x.creditMinor;byCurrency.set(x.currencyCode,v);}const currencies=[...byCurrency.values()].map(x=>({...x,balanced:x.totalDebitsMinor===x.totalCreditsMinor}));
    return {success:true,transactionCount:(rows.results||[]).length,accounts,currencies,dailyReports:reports.results||[],recent:(rows.results||[]).slice(0,30),reconciliation:{balanced:currencies.every(x=>x.balanced),currencyCount:currencies.length,method:'single-currency immutable debit/credit transaction pairs'},limitations:['Payment evidence remains merchant-reported unless a separately authorized provider confirms it.','This is an operational business book, not a statement of statutory accounting or tax compliance.']};
  },{limit:60,windowSeconds:60}));

  router.get('/api/v1/daftar/ledger', async ({request,env,url}) => runTenant(request,env,'daftar-ledger',async(session,context)=>{
    const limit=Math.min(Math.max(Number(url.searchParams.get('limit'))||50,1),100);
    const rows=await env.DB.prepare(`SELECT id,client_entry_id,entry_type,direction,item_code,origin_code,destination_code,reference_code,quantity_milli,unit_code,normalized_quantity_milli,normalized_unit_code,amount_minor,currency_code,payment_method,payment_status,counterparty_label,city_code,related_entry_id,created_at FROM daftar_private_entries WHERE company_id=? ORDER BY created_at DESC LIMIT ?`).bind(context.companyId,limit).all();
    return {success:true,entries:rows.results||[]};
  },{limit:90,windowSeconds:60}));

  router.post('/api/v1/daftar/sync', async ({request,env,requestId}) => runTenant(request,env,'daftar-sync',async(session,context)=>{
    const body=await readJson(request,128*1024);
    const result=await recordSyncBatch(env,session,context,body.events,requestId);
    return {success:true,...result};
  },{limit:30,windowSeconds:60,roles:WRITERS,status:202}));

  router.post('/api/v1/daftar/consent', async ({request,env}) => runTenant(request,env,'daftar-consent',async(session,context)=>{
    const body=await readJson(request,8192);
    if(typeof body.telemetryOptIn!=='boolean')return {response:json({success:false,error:'Choose whether to share minimized market insights.',code:'DAFTAR_CONSENT_REQUIRED'},400)};
    const result=await updateTelemetryConsent(env,session,context,body.telemetryOptIn);
    return {success:true,...result};
  },{limit:10,windowSeconds:300,roles:ADMINS}));

  router.get('/api/v1/daftar/market/prices', async ({request,env}) => runTenant(request,env,'daftar-market-prices',async(session,context)=>({success:true,feed:await getMarketPriceFeed(env,context)}),{limit:60,windowSeconds:60}));

  router.get('/api/v1/daftar/fx/quote', async ({request,env,url}) => runTenant(request,env,'daftar-fx-quote',async(session,context)=>({success:true,quote:await getApprovedFxQuote(env,context,url.searchParams.get('base'),url.searchParams.get('quote'))}),{limit:60,windowSeconds:60}));

  router.post('/api/v1/daftar/fx/convert-preview', async ({request,env}) => runTenant(request,env,'daftar-fx-preview',async(session,context)=>{const body=await readJson(request,4096);const money=normalizeMoney({amount:body.amount,currencyCode:body.baseCurrency});const quote=await getApprovedFxQuote(env,context,body.baseCurrency,body.quoteCurrency);return {success:true,baseCurrency:quote.base_currency,quoteCurrency:quote.quote_currency,originalAmountMinor:money.amountMinor,convertedAmountMinor:convertWithApprovedQuote(money.amountMinor,quote),rateNumerator:Number(quote.rate_numerator),rateDenominator:Number(quote.rate_denominator),sourceCode:quote.source_code,observedAt:quote.observed_at,validUntil:quote.valid_until,previewOnly:true};},{limit:30,windowSeconds:60}));

  router.get('/api/v1/daftar/passports', async ({request,env}) => runTenant(request,env,'daftar-passports',async(session,context)=>({success:true,passports:await listBatchPassports(env,context)}),{limit:60,windowSeconds:60}));

  router.post('/api/v1/daftar/passports', async ({request,env}) => runTenant(request,env,'daftar-passport-create',async(session,context)=>{
    const body=await readJson(request,16*1024);return {success:true,...await createBatchPassport(env,session,context,body)};
  },{limit:20,windowSeconds:60,roles:WRITERS,status:201}));

  router.post('/api/v1/daftar/passports/:passportId/events', async ({request,env,params}) => runTenant(request,env,'daftar-passport-event',async(session,context)=>{
    const body=await readJson(request,16*1024);return {success:true,...await appendBatchEvent(env,session,context,params.passportId,body)};
  },{limit:30,windowSeconds:60,roles:WRITERS,status:201}));

  router.post('/api/v1/daftar/passports/:passportId/transfers', async ({request,env,params}) => runTenant(request,env,'daftar-custody-transfer',async(session,context)=>{
    const body=await readJson(request,8192);return {success:true,...await createCustodyTransfer(env,session,context,params.passportId,body)};
  },{limit:10,windowSeconds:60,roles:WRITERS,status:201}));

  router.post('/api/v1/daftar/transfers/:transferId/confirm', async ({request,env,params}) => runTenant(request,env,'daftar-custody-confirm',async(session,context)=>{
    const body=await readJson(request,8192);return {success:true,...await confirmCustodyTransfer(env,session,context,params.transferId,body.challengeToken)};
  },{limit:10,windowSeconds:60,roles:WRITERS}));

  router.get('/api/v1/daftar/verify/:token', async ({env,params}) => {
    try {return json({success:true,...await verifyPublicPassport(env,params.token)});}
    catch(error){return routeError(error);}
  });
}

async function runTenant(request,env,action,handler,{limit=60,windowSeconds=60,roles=WRITERS,status=200}={}) {
  try {
    const session=await requireOrganizationRole(request,env,roles);
    await limitAction(env,session,action,{limit,windowSeconds});
    const context=await getDaftarContext(env,session);
    const result=await handler(session,context);
    if(result?.response)return result.response;
    return json(result,status);
  } catch(error) { return routeError(error); }
}

function routeError(error) {
  const status=Number(error?.status)||500;
  const code=String(error?.code||error?.message||'DAFTAR_UNAVAILABLE');
  const message=status>=500?'Daftar service is temporarily unavailable.':publicMessage(code);
  return json({success:false,error:message,code},status);
}
function publicMessage(code) {
  const messages={
    AUTH_REQUIRED:'Sign in to use Digital Daftar.',FORBIDDEN:'Your role does not have permission for this action.',
    DAFTAR_MARKET_NOT_ACTIVE:'Digital Daftar is not enabled for this country and sector yet.',DAFTAR_PILOT_ACCESS_REQUIRED:'This market is in controlled pilot. Your organization needs explicit pilot access.',
    DAFTAR_SECTOR_NOT_CONFIGURED:'This sector does not have an active Daftar template.',
    DAFTAR_INVENTORY_CONFLICT:'This stock movement conflicts with the current stock balance or unit.',
    DAFTAR_CREDIT_SETTLEMENT_EXCEEDS_BALANCE:'The payment is greater than the remaining Qarz balance.',
    DAFTAR_PASSPORT_UNIT_NOT_APPROVED:'This unit needs an approved local conversion before a passport can be issued.',
    DAFTAR_MASS_BALANCE_EXCEEDED:'The output and declared waste exceed the input plus declared additions.',
    DAFTAR_TRANSFER_RECIPIENT_NOT_ELIGIBLE:'The receiving organization is not eligible for this market.',
    DAFTAR_MARKET_FEED_NOT_READY:'There is not yet enough opted-in market data to publish a price index.'
  };
  return messages[code]||code.replace(/^DAFTAR_/,'').replaceAll('_',' ').toLowerCase();
}
