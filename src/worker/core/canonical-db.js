/**
 * Canonical database access helpers.
 *
 * A database failure on a canonical authority must never be converted into
 * legitimate null/empty state. A missing row is still a valid "not found"
 * result; only the database operation failure becomes AUTHORITY_UNAVAILABLE.
 */
export function authorityUnavailable(authority='canonical_db',cause=null){
  const error=new Error('Canonical authority unavailable');
  error.status=503;
  error.code='AUTHORITY_UNAVAILABLE';
  error.authority=String(authority||'canonical_db');
  if(cause)error.cause=cause;
  return error;
}

export async function canonicalFirst(env,sql,params=[],authority='canonical_db'){
  try{return await env.DB.prepare(sql).bind(...params).first();}
  catch(error){throw authorityUnavailable(authority,error);}
}

export async function canonicalAll(env,sql,params=[],authority='canonical_db'){
  try{return (await env.DB.prepare(sql).bind(...params).all()).results||[];}
  catch(error){throw authorityUnavailable(authority,error);}
}

export async function canonicalRun(env,sql,params=[],authority='canonical_db'){
  try{return await env.DB.prepare(sql).bind(...params).run();}
  catch(error){throw authorityUnavailable(authority,error);}
}
