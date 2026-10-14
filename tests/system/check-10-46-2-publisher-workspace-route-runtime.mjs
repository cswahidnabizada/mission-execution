import assert from 'node:assert/strict';
import { createApp } from '../../src/worker/app.js';

const SECRET='publisher-route-regression-secret';

async function signedSession(){
  const exp=Math.floor(Date.now()/1000)+1800;
  const nonce=crypto.randomUUID()+crypto.randomUUID();
  const generation='1';
  const payload=`v2|${exp}|${nonce}|${generation}`;
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const sig=Buffer.from(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(payload))).toString('base64url');
  return `${payload}|${sig}`;
}

class Statement{
  constructor(db,sql){this.db=db;this.sql=sql;this.args=[];}
  bind(...args){this.args=args;return this;}
  async first(){return this.db.first(this.sql,this.args);}
  async all(){return this.db.all(this.sql,this.args);}
  async run(){return {success:true,meta:{changes:0}};}
}
class Database{
  prepare(sql){return new Statement(this,sql);}
  async all(sql){
    if(sql.includes('FROM country_catalog')) return {results:[]};
    return {results:[]};
  }
  async first(){return null;}
}

const app=createApp();
const cookie=`onmission_platform_super_admin=${encodeURIComponent(await signedSession())}`;
const request=new Request('https://onmissionok.com/api/platform/admin/product-publisher/workspace',{headers:{Cookie:cookie}});
const response=await app.fetch(request,{DB:new Database(),PLATFORM_SUPER_ADMIN_SECRET:SECRET,PLATFORM_SUPER_ADMIN_SESSION_GENERATION:'1'},{waitUntil(){}});
const body=await response.json();

assert.equal(response.status,200,`publisher workspace route returned ${response.status}`);
assert.equal(body.success,true,'publisher workspace response must be successful');
assert.equal(body.workspace?.launch,null,'new publisher session should have no launch yet');
assert.equal(body.workspace?.configurationState,'not_required','initial publisher must not require runtime configuration');

console.log('10.50.0 Product Publisher workspace route runtime gate: PASS');
