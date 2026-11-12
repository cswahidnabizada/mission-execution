import {json,readJson} from '../../core/http.js';
import {requireOrganizationRole} from '../../core/auth-session.js';
import {limitAction} from '../../security/action-limit.js';
import {audit} from '../../security/audit.js';
import {getDaftarContext,normalizeMoney} from './daftar.service.js';

const OWNERS=['owner','admin'];
const fail=e=>json({success:false,code:String(e?.code||e?.message||'DAFTAR_CONTROL_UNAVAILABLE'),error:Number(e?.status)>=500?'Daftar controls are temporarily unavailable.':String(e?.code||e?.message||'Request rejected').replaceAll('_',' ').toLowerCase()},Number(e?.status)||500);
const bad=(code,status=400)=>Object.assign(new Error(code),{code,status});
const monthPattern=/^\d{4}-(0[1-9]|1[0-2])$/;

export function registerDaftarControlsRoutes(router){
  router.get('/api/v1/daftar/qarz/aging',async({request,env})=>tenant(request,env,'daftar-qarz-aging',async(session,ctx)=>{
    const rows=await env.DB.prepare(`SELECT e.id,e.entry_type,e.direction,e.amount_minor,e.settled_amount_minor,e.currency_code,e.counterparty_label,e.created_at,e.client_recorded_at,MAX(0,CAST(julianday('now')-julianday(COALESCE(e.client_recorded_at,e.created_at)) AS INTEGER)) AS age_days,c.case_id,c.case_status,c.due_date FROM daftar_private_entries e LEFT JOIN daftar_qarz_cases c ON c.entry_id=e.id AND c.company_id=e.company_id AND c.case_status IN ('open','acknowledged','disputed') WHERE e.company_id=? AND e.payment_method='credit' AND e.amount_minor>e.settled_amount_minor ORDER BY age_days DESC,e.created_at`).bind(ctx.companyId).all();
    const entries=(rows.results||[]).map(r=>({...r,outstanding_minor:Number(r.amount_minor)-Number(r.settled_amount_minor),aging_bucket:Number(r.age_days)<=30?'0-30':Number(r.age_days)<=60?'31-60':Number(r.age_days)<=90?'61-90':'90+'}));
    const totals={};for(const r of entries){const k=`${r.currency_code}:${r.aging_bucket}`;totals[k]=(totals[k]||0)+r.outstanding_minor;}
    return {success:true,entries,totalsByCurrencyAndAge:totals,asOf:new Date().toISOString(),note:'Aging is based on the recorded transaction date; due dates are optional and are not inferred.'};
  }));

  router.get('/api/v1/daftar/book/periods',async({request,env})=>tenant(request,env,'daftar-book-periods',async(session,ctx)=>{
    const rows=await env.DB.prepare(`SELECT id,period_month,lock_status,reason,actor_identity_id,created_at FROM daftar_book_period_locks WHERE company_id=? ORDER BY period_month DESC`).bind(ctx.companyId).all();
    return {success:true,periods:rows.results||[]};
  }));

  router.post('/api/v1/daftar/book/periods/lock',async({request,env})=>tenant(request,env,'daftar-book-period-lock',async(session,ctx)=>{
    const body=await readJson(request,4096);const month=String(body.periodMonth||'');const reason=String(body.reason||'').trim();
    if(!monthPattern.test(month)||reason.length<8||reason.length>500)throw bad('DAFTAR_BOOK_PERIOD_LOCK_INPUT_INVALID');
    const existing=await env.DB.prepare(`SELECT lock_status FROM daftar_book_period_locks WHERE company_id=? AND period_month=? LIMIT 1`).bind(ctx.companyId,month).first();
    if(existing?.lock_status==='locked')return {success:true,reused:true,periodMonth:month,status:'locked'};
    if(existing)throw bad('DAFTAR_BOOK_PERIOD_REOPEN_REQUIRES_REVIEW',409);
    const id=crypto.randomUUID();await env.DB.prepare(`INSERT INTO daftar_book_period_locks(id,company_id,period_month,lock_status,reason,actor_identity_id) VALUES(?,?,?,'locked',?,?)`).bind(id,ctx.companyId,month,reason,Number(session.identityId)).run();
    await audit(env,{session,action:'daftar.book.period_locked',resourceType:'daftar_book_period_lock',resourceId:id,metadata:{periodMonth:month}});
    return {success:true,id,periodMonth:month,status:'locked',effect:'New entries recorded in this month are rejected. Existing immutable entries remain unchanged.'};
  },{roles:OWNERS}));

  router.post('/api/v1/daftar/qarz/:entryId/cases',async({request,env,params})=>tenant(request,env,'daftar-qarz-case-open',async(session,ctx)=>{
    const body=await readJson(request,4096);const reason=String(body.reason||'').trim();const dueDate=body.dueDate?String(body.dueDate):null;const assigned=String(body.assignedToLabel||'').trim().slice(0,120)||null;
    if(reason.length<8||reason.length>500||(dueDate&&!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)))throw bad('DAFTAR_QARZ_CASE_INPUT_INVALID');
    const entry=await env.DB.prepare(`SELECT id,amount_minor,settled_amount_minor,payment_method FROM daftar_private_entries WHERE id=? AND company_id=? LIMIT 1`).bind(params.entryId,ctx.companyId).first();
    if(!entry||entry.payment_method!=='credit'||Number(entry.amount_minor)<=Number(entry.settled_amount_minor))throw bad('DAFTAR_QARZ_OPEN_BALANCE_NOT_FOUND',404);
    const existing=await env.DB.prepare(`SELECT case_id,case_status FROM daftar_qarz_cases WHERE company_id=? AND entry_id=? AND case_status IN ('open','acknowledged','disputed') LIMIT 1`).bind(ctx.companyId,params.entryId).first();
    if(existing)return {success:true,reused:true,caseId:existing.case_id,status:existing.case_status};
    const id=crypto.randomUUID(),actor=Number(session.identityId);await env.DB.batch([
      env.DB.prepare(`INSERT INTO daftar_qarz_cases(case_id,company_id,entry_id,case_status,case_reason,opened_by_identity_id,assigned_to_label,due_date) VALUES(?,?,?,'open',?,?,?,?)`).bind(id,ctx.companyId,params.entryId,reason,actor,assigned,dueDate),
      env.DB.prepare(`INSERT INTO daftar_qarz_case_events(event_id,case_id,company_id,event_type,event_note,actor_identity_id) VALUES(?,?,?,'opened',?,?)`).bind(crypto.randomUUID(),id,ctx.companyId,reason,actor)
    ]);
    await audit(env,{session,action:'daftar.qarz.case_opened',resourceType:'daftar_qarz_case',resourceId:id,metadata:{entryId:params.entryId}});
    return {success:true,caseId:id,status:'open'};
  },{roles:OWNERS}));

  router.post('/api/v1/daftar/qarz/cases/:caseId/events',async({request,env,params})=>tenant(request,env,'daftar-qarz-case-event',async(session,ctx)=>{
    const body=await readJson(request,4096);const target=String(body.status||'').toLowerCase();const note=String(body.note||'').trim();
    if(!['acknowledged','disputed','resolved','rejected'].includes(target)||note.length<1||note.length>1000)throw bad('DAFTAR_QARZ_CASE_EVENT_INVALID');
    const current=await env.DB.prepare(`SELECT case_id,case_status FROM daftar_qarz_cases WHERE case_id=? AND company_id=? LIMIT 1`).bind(params.caseId,ctx.companyId).first();
    if(!current)throw bad('DAFTAR_QARZ_CASE_NOT_FOUND',404);
    const allowed={open:['acknowledged','disputed','resolved','rejected'],acknowledged:['disputed','resolved','rejected'],disputed:['acknowledged','resolved','rejected'],resolved:[],rejected:[]};
    if(!(allowed[current.case_status]||[]).includes(target))throw bad('DAFTAR_QARZ_CASE_TRANSITION_INVALID',409);
    const actor=Number(session.identityId);await env.DB.batch([
      env.DB.prepare(`UPDATE daftar_qarz_cases SET case_status=?,updated_at=CURRENT_TIMESTAMP WHERE case_id=? AND company_id=? AND case_status=?`).bind(target,params.caseId,ctx.companyId,current.case_status),
      env.DB.prepare(`INSERT INTO daftar_qarz_case_events(event_id,case_id,company_id,event_type,event_note,actor_identity_id) VALUES(?,?,?,?,?,?)`).bind(crypto.randomUUID(),params.caseId,ctx.companyId,target,note,actor)
    ]);
    await audit(env,{session,action:'daftar.qarz.case_status_changed',resourceType:'daftar_qarz_case',resourceId:params.caseId,metadata:{from:current.case_status,to:target}});
    return {success:true,caseId:params.caseId,status:target};
  },{roles:OWNERS}));

  router.post('/api/v1/daftar/book/adjustments',async({request,env})=>tenant(request,env,'daftar-book-adjustment',async(session,ctx)=>{
    const b=await readJson(request,4096);const type=String(b.type||'');const clientId=String(b.clientTransactionId||'');const memo=String(b.memo||'').trim();const {amountMinor,currencyCode}=normalizeMoney({amount:b.amount,currencyCode:b.currencyCode});
    if(!['opening_balance','refund'].includes(type)||!/^[-A-Za-z0-9_:]{8,100}$/.test(clientId)||memo.length<8||memo.length>300)throw bad('DAFTAR_BOOK_ADJUSTMENT_INVALID');
    const period=String(b.periodMonth||new Date().toISOString().slice(0,7));if(!monthPattern.test(period))throw bad('DAFTAR_BOOK_PERIOD_INVALID');
    const locked=await env.DB.prepare(`SELECT 1 FROM daftar_book_period_locks WHERE company_id=? AND period_month=? AND lock_status='locked' LIMIT 1`).bind(ctx.companyId,period).first();if(locked)throw bad('DAFTAR_BOOK_PERIOD_LOCKED',409);
    let debit,credit,payment='other';
    if(type==='opening_balance'){
      const account=String(b.accountCode||'');if(!['cash','inventory','accounts_receivable','accounts_payable'].includes(account))throw bad('DAFTAR_OPENING_BALANCE_ACCOUNT_INVALID');
      if(account==='accounts_payable'){debit='opening_equity';credit=account;}else{debit=account;credit='opening_equity';}
    }else{
      const method=String(b.refundMethod||'cash');if(!['cash','credit'].includes(method))throw bad('DAFTAR_REFUND_METHOD_INVALID');debit='sales_returns';credit=method==='cash'?'cash':'accounts_receivable';payment=method;
    }
    const id=crypto.randomUUID();const actor=Number(session.identityId);
    await env.DB.prepare(`INSERT INTO daftar_book_journal_transactions(id,company_id,source_entry_id,client_transaction_id,transaction_type,debit_account,credit_account,amount_minor,currency_code,payment_method,payment_evidence_class,memo,created_by_identity_id,created_at) VALUES(?,?,NULL,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,ctx.companyId,clientId,type,debit,credit,amountMinor,currencyCode,payment,'merchant_reported',memo,actor,`${period}-01 00:00:00`).run();
    await audit(env,{session,action:`daftar.book.${type}_posted`,resourceType:'daftar_book_journal_transaction',resourceId:id,metadata:{currencyCode,amountMinor,periodMonth:period,debitAccount:debit,creditAccount:credit}});
    return {success:true,transactionId:id,type,debitAccount:debit,creditAccount:credit,amountMinor,currencyCode,periodMonth:period,evidenceClass:'merchant_reported',notice:'Append-only journal adjustment. Obtain professional accounting/tax review before treating this as statutory bookkeeping.'};
  },{roles:OWNERS}));
}

async function tenant(request,env,action,handler,{roles=OWNERS}={}){try{const session=await requireOrganizationRole(request,env,roles);await limitAction(env,session,action,{limit:12,windowSeconds:300});const context=await getDaftarContext(env,session);return json(await handler(session,context));}catch(e){return fail(e);}}
