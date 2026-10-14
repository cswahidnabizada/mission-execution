import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';

const root=process.cwd();
const tmp=path.join(root,'.schema-current-build.sql');
const db=path.join(root,'.schema-current-build.db');
const base=`CREATE TABLE companies (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE drivers (id INTEGER PRIMARY KEY AUTOINCREMENT, company_id INTEGER NOT NULL, name TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(company_id) REFERENCES companies(id));
CREATE TABLE missions (id INTEGER PRIMARY KEY AUTOINCREMENT, company_id INTEGER NOT NULL, driver_id INTEGER, reference TEXT NOT NULL, pickup_company TEXT, pickup_address TEXT, delivery_company TEXT, delivery_address TEXT, mission_date TEXT, status TEXT NOT NULL DEFAULT 'Pending', public_enabled INTEGER NOT NULL DEFAULT 0, public_description TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(company_id) REFERENCES companies(id), FOREIGN KEY(driver_id) REFERENCES drivers(id));
CREATE TABLE mission_status_history (id INTEGER PRIMARY KEY AUTOINCREMENT, mission_id INTEGER NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(mission_id) REFERENCES missions(id));
CREATE TABLE mission_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, company_id INTEGER NOT NULL, mission_id INTEGER NOT NULL, sender_role TEXT NOT NULL, driver_id INTEGER, message TEXT, message_type TEXT NOT NULL DEFAULT 'text', file_id INTEGER, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(company_id) REFERENCES companies(id), FOREIGN KEY(mission_id) REFERENCES missions(id), FOREIGN KEY(driver_id) REFERENCES drivers(id));
CREATE TABLE mission_files (id INTEGER PRIMARY KEY AUTOINCREMENT, company_id INTEGER NOT NULL, mission_id INTEGER NOT NULL, uploaded_by_role TEXT NOT NULL, driver_id INTEGER, file_type TEXT NOT NULL, mime_type TEXT NOT NULL, original_name TEXT, r2_key TEXT NOT NULL UNIQUE, file_size INTEGER, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(company_id) REFERENCES companies(id), FOREIGN KEY(mission_id) REFERENCES missions(id), FOREIGN KEY(driver_id) REFERENCES drivers(id));
CREATE TABLE public_mission_requests (id INTEGER PRIMARY KEY AUTOINCREMENT, company_id INTEGER NOT NULL, mission_id INTEGER NOT NULL, requester_name TEXT NOT NULL, requester_email TEXT, requester_phone TEXT, requester_message TEXT, status TEXT NOT NULL DEFAULT 'Pending', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(company_id) REFERENCES companies(id), FOREIGN KEY(mission_id) REFERENCES missions(id));`;
fs.writeFileSync(tmp,base+'\n'+fs.readdirSync(path.join(root,'database/migrations')).filter(x=>x.endsWith('.sql')).sort().map(x=>fs.readFileSync(path.join(root,'database/migrations',x),'utf8')).join('\n'));
try {
  fs.rmSync(db,{force:true});
  const database=new DatabaseSync(db);
  try {
    database.exec(fs.readFileSync(tmp,'utf8'));
    const rows=database.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND type IN ('table','index','view') ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'view' THEN 1 ELSE 2 END,name").all();
    const highWater=fs.readdirSync(path.join(root,'database/migrations')).filter(x=>x.endsWith('.sql')).sort().at(-1)?.slice(0,4) || 'unknown';
    const out=[
      '-- ON Mission current database schema snapshot',
      `-- Generated from the complete ordered migration chain through ${highWater}.`,
      '-- This is the canonical schema snapshot for fresh/recovery environments.',
      '-- Production evolution remains migration-first: apply database/migrations/*.sql in order.',
      '-- Do not edit manually; regenerate with scripts/generate-schema-current.mjs.',
      '',
      'PRAGMA foreign_keys=ON;',
      ''
    ];
    for(const row of rows) out.push(`-- ${row.type}: ${row.name}`,`${row.sql.trimEnd()};`,'');
    fs.writeFileSync(path.join(root,'database/schema.current.sql'),out.join('\n'));
    console.log(`generated ${rows.length} schema objects`);
  } finally { database.close(); }
} finally {fs.rmSync(tmp,{force:true}); fs.rmSync(db,{force:true});}
