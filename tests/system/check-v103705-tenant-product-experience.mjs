import fs from 'node:fs';
const root=new URL('../..',import.meta.url).pathname;
const html=fs.readFileSync(root+'public/admin.html','utf8');
const js=fs.readFileSync(root+'public/assets/js/pages/tenant-product-experience.js','utf8');
const css=fs.readFileSync(root+'public/assets/css/tenant-product-experience.css','utf8');
const required=[['tenant product script',html.includes('tenant-product-experience.js?v=10.37.5')],['tenant product stylesheet',html.includes('tenant-product-experience.css?v=10.37.5')],['canonical situation',js.includes("/api/user/situation")],['tenant overview',js.includes("/api/tenant/overview")],['communication convergence',js.includes("/api/notifications")],['capability-aware surfaces',js.includes('data-access-capability')],['workflow retry state',js.includes("setState('error'")],['Mission Workspace canonical',js.includes('Mission Workspace remains the canonical execution surface')],['responsive experience',css.includes('@media(max-width:900px)')]];
for(const [name,ok] of required)if(!ok)throw new Error(`10.37.5 contract failed: ${name}`);
console.log('10.37.5 Tenant Product Experience gate: PASS');
