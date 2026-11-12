import fs from 'node:fs';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
const db=new DatabaseSync(':memory:');
db.exec(fs.readFileSync('database/schema.current.sql','utf8'));
db.prepare(`INSERT INTO country_catalog(code,name) VALUES('AF','Afghanistan')`).run();
db.prepare(`INSERT INTO companies(name) VALUES('Daftar journal test tenant')`).run();
const companyId=Number(db.prepare('SELECT last_insert_rowid() id').get().id);
function entry(id,type,direction,amount,payment,related=null){db.prepare(`INSERT INTO daftar_private_entries(id,company_id,country_code,sector_code,client_entry_id,entry_type,direction,amount_minor,currency_code,payment_method,payment_status,related_entry_id,created_by_identity_id) VALUES(?,?,'AF','trade',?,?,?,?,'AFN',?,?,?,1)`).run(id,companyId,`client-${id}`,type,direction,amount,payment,payment==='cash'?'reported_paid':'reported_pending',related);}
function journal(id,source,type,debit,credit,amount,payment){db.prepare(`INSERT INTO daftar_book_journal_transactions(id,company_id,source_entry_id,client_transaction_id,transaction_type,debit_account,credit_account,amount_minor,currency_code,payment_method,payment_evidence_class,created_by_identity_id) VALUES(?,?,?,?,?,?,?,?,'AFN',?,'merchant_reported',1)`).run(id,companyId,source,`txn-${id}`,type,debit,credit,amount,payment);}
entry('sale-1','sale','give',1000,'credit');
journal('j-sale','sale-1','sale','accounts_receivable','sales_revenue',1000,'credit');
entry('settle-sale-1','credit_settlement','give',400,'cash','sale-1');
db.prepare(`INSERT INTO daftar_credit_settlements(company_id,entry_id,client_settlement_id,amount_minor,currency_code,payment_method,recorded_by_identity_id) VALUES(?,?,'settle-sale-1',400,'AFN','cash',1)`).run(companyId,'sale-1');
journal('j-settle-sale','settle-sale-1','payment_in','cash','accounts_receivable',400,'cash');
entry('purchase-1','purchase','get',800,'credit');
journal('j-purchase','purchase-1','purchase','inventory','accounts_payable',800,'credit');
entry('settle-purchase-1','credit_settlement','get',300,'cash','purchase-1');
db.prepare(`INSERT INTO daftar_credit_settlements(company_id,entry_id,client_settlement_id,amount_minor,currency_code,payment_method,recorded_by_identity_id) VALUES(?,?,'settle-purchase-1',300,'AFN','cash',1)`).run(companyId,'purchase-1');
journal('j-settle-purchase','settle-purchase-1','payment_out','accounts_payable','cash',300,'cash');
const sale=db.prepare(`SELECT settled_amount_minor,payment_status FROM daftar_private_entries WHERE id='sale-1'`).get();
const purchase=db.prepare(`SELECT settled_amount_minor,payment_status FROM daftar_private_entries WHERE id='purchase-1'`).get();
const settlementRows=db.prepare(`SELECT transaction_type,debit_account,credit_account FROM daftar_book_journal_transactions WHERE transaction_type IN ('payment_in','payment_out') ORDER BY transaction_type`).all();
const totals=db.prepare(`SELECT currency_code,SUM(amount_minor) total_postings FROM daftar_book_journal_transactions WHERE company_id=? GROUP BY currency_code`).all(companyId);const qarz=db.prepare(`SELECT CASE WHEN direction='get' THEN 'payable' ELSE 'receivable' END credit_side,currency_code,SUM(amount_minor-settled_amount_minor) outstanding_minor FROM daftar_private_entries WHERE company_id=? AND payment_method='credit' AND settled_amount_minor<amount_minor GROUP BY credit_side,currency_code ORDER BY credit_side`).all(companyId);
assert.deepEqual({...sale},{settled_amount_minor:400,payment_status:'partially_settled'});
assert.deepEqual({...purchase},{settled_amount_minor:300,payment_status:'partially_settled'});
assert.deepEqual(settlementRows.map(x=>({...x})),[{transaction_type:'payment_in',debit_account:'cash',credit_account:'accounts_receivable'},{transaction_type:'payment_out',debit_account:'accounts_payable',credit_account:'cash'}]);
assert.deepEqual(totals.map(x=>({...x})),[{currency_code:'AFN',total_postings:2500}]);assert.deepEqual(qarz.map(x=>({...x})),[{credit_side:'payable',currency_code:'AFN',outstanding_minor:500},{credit_side:'receivable',currency_code:'AFN',outstanding_minor:600}]);
console.log('16.110 SQLite journal and receivable/payable settlement triggers: PASS');
