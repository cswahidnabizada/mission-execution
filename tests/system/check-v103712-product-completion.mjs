import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const root=process.cwd();
const must=[
 'database/migrations/0085_product_configuration_dependency_repair.sql',
 'public/assets/css/product-completion.css',
 'public/assets/js/pages/tenant-product-experience.js',
 'public/assets/js/frontend/admin/admin.js',
 'public/index.html','public/register.html','public/admin.html','public/admin-control.html'
];
for(const f of must){if(!fs.existsSync(path.join(root,f)))throw new Error(`Missing ${f}`)}
const version=fs.readFileSync(path.join(root,'VERSION'),'utf8').trim();
if(version!=='10.37.12')throw new Error(`VERSION=${version}`);
const landing=fs.readFileSync(path.join(root,'public/index.html'),'utf8');
for(const token of ['Mission','Responsibility','Action','Evidence','Truth','Start'])if(!landing.includes(token))throw new Error(`Landing missing ${token}`);
const admin=fs.readFileSync(path.join(root,'public/assets/js/frontend/admin/admin.js'),'utf8');
for(const token of ['Prepare the product. Then launch the country.','CREATE COUNTRY PRODUCT DRAFT','ACTIVATE'])if(!admin.includes(token))throw new Error(`Admin control missing ${token}`);
const tenant=fs.readFileSync(path.join(root,'public/assets/js/pages/tenant-product-experience.js'),'utf8');
for(const token of ['PRODUCT JOURNEY','first successful operational outcome','ACTIVATE','EXECUTE'])if(!tenant.includes(token))throw new Error(`Tenant journey missing ${token}`);
const mig=fs.readFileSync(path.join(root,'database/migrations/0085_product_configuration_dependency_repair.sql'),'utf8');
if(!mig.includes("'product_configuration'"))throw new Error('Repair migration missing product_configuration purpose');
for(const n of ['0083_product_configuration_runtime.sql','0084_country_product_launch_governance.sql']){const x=fs.readFileSync(path.join(root,'database/migrations',n),'utf8');if(!x.includes("'product_configuration','Product configuration'"))throw new Error(`${n} does not self-provision its classification dependency`)}
console.log('10.37.12 product completion: PASS');
