import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';

const root=process.cwd();
const sourceRoot=path.join(root,'src/worker');
const queries=[];
function* walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())yield* walk(p);else yield p;}}
function collect(file){
  const text=fs.readFileSync(file,'utf8');
  const patterns=[/\.prepare\(\s*`([\s\S]*?)`\s*\)/g,/\.prepare\(\s*'([^']*)'\s*\)/g,/\.prepare\(\s*"([^"]*)"\s*\)/g];
  for(const re of patterns){let m;while((m=re.exec(text))){const raw=m[1];
    // Dynamic SQL is validated by the runtime/integration harness. Static SQL is
    // safe to prepare against the canonical schema snapshot and must always parse.
    if(raw.includes('${'))continue;
    const sql=raw.replace(/\s+/g,' ').trim();
    if(/^(SELECT|INSERT|UPDATE|DELETE|WITH|PRAGMA|CREATE|ALTER|DROP)\b/i.test(sql))queries.push({file:path.relative(root,file),sql});
  }}
}
for(const file of walk(sourceRoot)){if(/\.(js|mjs)$/.test(file))collect(file);}
const unique=[...new Map(queries.map(q=>[`${q.file}\0${q.sql}`,q])).values()];
const payload=path.join(root,'.runtime-schema-queries.json');
fs.writeFileSync(payload,JSON.stringify(unique));
const db=new DatabaseSync(':memory:');
try{
  db.exec(fs.readFileSync(path.join(root,'database/schema.current.sql'),'utf8'));
  const failures=[];
  for(const q of unique){
    const sql=q.sql.replace(/\bLIMIT\s+\?/gi,'LIMIT 1');
    try{
      const stmt=db.prepare('EXPLAIN '+sql);
      const params=Array((sql.match(/\?/g)||[]).length).fill(null);
      stmt.all(...params);
    }catch(e){failures.push({file:q.file,error:e.message,sql});}
  }
  console.log(`CHECKED ${unique.length} FAILED ${failures.length}`);
  for(const f of failures.slice(0,200)) console.log(`FAIL\t${f.file}\t${f.error}\t${f.sql}`);
  if(failures.length) process.exitCode=1;
}finally{
  db.close();
  fs.rmSync(payload,{force:true});
}
