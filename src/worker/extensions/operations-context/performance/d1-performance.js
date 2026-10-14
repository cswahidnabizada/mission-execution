/** 10.18.13 — scoped D1 diagnostics. Diagnostic-only; never changes authorization or truth. */
export function instrumentD1(db,{onQuery=()=>{}}={}){
  if(!db||typeof db.prepare!=="function")return db;
  const prepare=(sql)=>{
    const started=performance.now();
    const stmt=db.prepare(sql);
    const finish=(kind)=>{try{onQuery({kind,durationMs:Math.max(0,performance.now()-started),sql:String(sql||"").replace(/\s+/g," ").trim().slice(0,240)});}catch{}}
    return {
      bind:(...args)=>instrumentStatement(stmt.bind(...args),finish),
      all:()=>instrumentStatement(stmt,finish).all(),
      first:(...args)=>instrumentStatement(stmt,finish).first(...args),
      run:()=>instrumentStatement(stmt,finish).run()
    };
  };
  return {prepare,batch:async statements=>{const started=performance.now();try{return await db.batch(statements);}finally{try{onQuery({kind:"batch",durationMs:Math.max(0,performance.now()-started),count:Array.isArray(statements)?statements.length:0});}catch{}}},exec:db.exec?.bind(db),dump:db.dump?.bind(db)};
}

function instrumentStatement(stmt,finish){
  return {
    bind:(...args)=>instrumentStatement(stmt.bind(...args),finish),
    all:async(...args)=>{try{return await stmt.all(...args);}finally{finish("all");}},
    first:async(...args)=>{try{return await stmt.first(...args);}finally{finish("first");}},
    run:async(...args)=>{try{return await stmt.run(...args);}finally{finish("run");}}
  };
}

export function summarizeD1Metrics(metrics=[]){
  const rows=Array.isArray(metrics)?metrics:[];
  const durationMs=rows.reduce((sum,x)=>sum+(Number(x?.durationMs)||0),0);
  const slowQueries=rows.filter(x=>(Number(x?.durationMs)||0)>=50).length;
  const batches=rows.filter(x=>x?.kind==="batch").length;
  return Object.freeze({queryCount:rows.length,durationMs:Math.round(durationMs*10)/10,slowQueries,batches});
}
