/* ON Mission 16.10.79 — Platform Results & Certification Center.
 * Read-only aggregation of existing governed evidence surfaces. No new authority is introduced.
 * A successful endpoint read is never promoted to functional or production certification.
 */
import { api, esc } from './admin-runtime.js?v=16.10.79';

const SOURCES = [
  {id:'platform-health',title:'Data & Infrastructure',group:'infrastructure',endpoint:'/api/platform/admin/system-health',description:'Runtime and platform health projection.',workspace:'system-health',dependencies:'Runtime bindings, storage and system-health authority',nextAction:'Inspect any failed checks; run deployed persistence and recovery tests.'},
  {id:'layout-certification',title:'Experience & UI',group:'experience',endpoint:'/api/platform/admin/layout-studio/certification',description:'Route mapping and renderer certification worklist.',workspace:'layout-studio',dependencies:'Canonical route and renderer registries',nextAction:'Complete authenticated browser, accessibility and renderer-parity tests.'},
  {id:'ai-planner',title:'AI & Capabilities',group:'ai',endpoint:null,description:'Planner decisions, constraints, confidence, rejected plans and outcome calibration.',workspace:'agentic-control',dependencies:'Canonical planner, capability contracts, policy and verified outcome authority',nextAction:'Connect authoritative planner decision/result evidence; keep autonomy governed.'},
  {id:'integrations-devices',title:'Integration & Devices',group:'integrations',endpoint:null,description:'Vendor sandbox health, connectivity, compatibility, SIL/HIL and device-specific safety.',workspace:'infrastructure-governance',dependencies:'Approved provider contracts and device safety profiles',nextAction:'Select a vendor sandbox; certify contract failures and keep HIL/actuation disabled.'},
  {id:'data-content',title:'Data & Content',group:'data',endpoint:null,description:'Reusable data, content, policies, validation, provenance and data quality.',workspace:'resource-management',dependencies:'Canonical Data Catalog and governed Data Entry authorities',nextAction:'Connect data validation and provenance evidence without creating a second catalog.'},
  {id:'command-center',title:'Platform Operations',group:'operations',endpoint:'/api/platform/admin/command-center',description:'Current command-center projection and attention items.',workspace:'overview',dependencies:'Existing command-center projection and canonical operational authorities',nextAction:'Resolve surfaced blockers through their owning workspace.'},
  {id:'mission-operations',title:'Mission Operations & Lifecycle',group:'missions',endpoint:null,description:'Per-mission canonical stage results, assignment, execution, effects, verification and recovery.',workspace:'missions',dependencies:'Canonical mission truth, lifecycle writer, assignment, authorization and evidence',nextAction:'Connect mission-scoped authoritative event/evidence drilldown; all stages remain unverified until then.'},
  {id:'certification-environment',title:'Simulation & Certification',group:'testing',endpoint:'/api/platform/admin/certification/environment',description:'Governed certification environment status.',workspace:'certification',dependencies:'Certification environment authority and scenario contracts',nextAction:'Run deployed runtime tests and distinguish simulation, vendor, SIL, HIL and physical evidence.'},
  {id:'admin-operations',title:'Administrative Operations',group:'operations',endpoint:'/api/platform/admin/operations?limit=50',description:'Recent administrative operation records.',workspace:'operations',dependencies:'Administrative operation lifecycle and audit records',nextAction:'Reconcile interrupted or failed operations; preserve append-only evidence.'},
  {id:'product-health',title:'Tenants & Market Factory',group:'market',endpoint:'/api/platform/admin/product-health',description:'Product and launch health projection.',workspace:'product-health',dependencies:'Market release lifecycle, tenant/access and product health authorities',nextAction:'Verify onboarding and market readiness with evidence before activation.'},
];
const JOURNEY = [
  ['OBSERVE','Situation and source evidence'],['UNDERSTAND','Context and constraints'],['PLAN','Candidate plan and resource feasibility'],['EVALUATE','Risk and policy evaluation'],['ACCEPT','Explicit acceptance decision'],['AUTHORIZE','Actor, scope and permission proof'],['PREPARE','Readiness and preconditions'],['ASSIGN','Canonical assignment'],['EXECUTE','Governed command and execution events'],['EFFECT','Observed real-world effect'],['VERIFY','Independent evidence and verification'],['RECOVER','Failure handling and reconciliation'],['OUTCOME','Canonical outcome record'],['LEARN','Calibrated learning from verified outcomes'],['NEXT SITUATION','Valid next action or waiting condition'],['OBSERVE — NEXT CYCLE','Next observation begins a new cycle']
];
let latest = [];
const safeJson = value => { try { return JSON.stringify(value, null, 2); } catch { return String(value); } };
const summarize = data => {
  if (!data || typeof data !== 'object') return String(data ?? 'No response payload');
  const preferred = ['summary','status','health','environment','commandCenter','operations','routes','results','items','success','version','notice','blockers'];
  const out = {};
  for (const key of preferred) if (Object.hasOwn(data,key)) out[key] = data[key];
  if (!Object.keys(out).length) for (const [key,value] of Object.entries(data).slice(0,12)) out[key] = value;
  return safeJson(out);
};
function statusPill(result){
  if(result.state==='READ_OK') return '<span class="pill neutral">READ OK · NOT CERTIFIED</span>';
  if(result.state==='UNAVAILABLE') return '<span class="pill warning">UNAVAILABLE</span>';
  return '<span class="pill neutral">UNVERIFIED</span>';
}
function renderResults(results,filter='all',query=''){
  const host=document.querySelector('#view-platform-results'); if(!host)return;
  const q=String(query||'').trim().toLowerCase();
  const shown=results.filter(r=>(filter==='all'||r.group===filter)&&(!q||`${r.title} ${r.description} ${r.endpoint||'evidence endpoint not connected'} ${r.state} ${r.nextAction}`.toLowerCase().includes(q)));
  const ok=results.filter(r=>r.state==='READ_OK').length, unavailable=results.filter(r=>r.state==='UNAVAILABLE').length;
  host.innerHTML=`<div class="operating-surface platform-results-center">
    <header class="control-hero"><div><span class="eyebrow">COMMAND · PLATFORM EVIDENCE</span><h1 class="title">Platform Results & Certification</h1><p class="sub">Inspect existing evidence sources across the platform. Endpoint reachability, functional correctness, security certification and real-world effectiveness are separate claims.</p></div><span class="pill neutral">READ ONLY</span></header>
    <section class="os-grid three">
      <article class="card section"><div class="eyebrow">EVIDENCE SOURCES</div><div class="impact-number">${results.length}</div><p class="sub">Configured read-only sources</p></article>
      <article class="card section"><div class="eyebrow">READ SUCCEEDED</div><div class="impact-number">${ok}</div><p class="sub">Data retrieved; not a certification pass</p></article>
      <article class="card section"><div class="eyebrow">UNAVAILABLE</div><div class="impact-number">${unavailable}</div><p class="sub">Must be investigated or rechecked</p></article>
    </section>
    <section class="card section"><div class="eyebrow">FILTER RESULTS</div><div class="field-grid"><label class="field">Search<input id="prSearch" class="input" type="search" placeholder="Search sources, endpoints, status…" value="${esc(query)}"></label><label class="field">Domain<select id="prFilter" class="input"><option value="all" ${filter==='all'?'selected':''}>All domains</option><option value="infrastructure" ${filter==='infrastructure'?'selected':''}>Data & Infrastructure</option><option value="operations" ${filter==='operations'?'selected':''}>Mission / Platform Operations</option><option value="testing" ${filter==='testing'?'selected':''}>Simulation & Certification</option><option value="ai" ${filter==='ai'?'selected':''}>AI & Capabilities</option><option value="integrations" ${filter==='integrations'?'selected':''}>Integrations & Devices</option><option value="data" ${filter==='data'?'selected':''}>Data & Content</option><option value="missions" ${filter==='missions'?'selected':''}>Mission Operations</option><option value="experience" ${filter==='experience'?'selected':''}>Experience & UI</option><option value="market" ${filter==='market'?'selected':''}>Tenants & Market Factory</option></select></label></div><div class="actions"><button class="btn primary" id="prRefresh">REFRESH EVIDENCE SOURCES</button><button class="btn muted" id="prJourney">INSPECT CANONICAL JOURNEY</button></div><p class="sub" id="prUpdated">Last attempted: ${esc(new Date().toISOString())}. Results are read from existing authorities; unavailable sources remain explicitly unavailable.</p></section>
    <section class="card section"><div class="eyebrow">SOURCE RESULTS</div><div class="platform-results-list">${shown.length?shown.map(r=>`<article class="platform-result-row"><div class="platform-result-head"><div><h3>${esc(r.title)}</h3><p class="sub">${esc(r.description)}</p></div>${statusPill(r)}</div><div class="platform-result-meta"><span>Version: <code>${esc(r.version||'NOT REPORTED')}</code></span><span>Input/source: <code>${esc(r.endpoint||'NOT CONNECTED')}</code></span><span>Last check: ${esc(r.checkedAt||'not run')}</span><span>Dependencies: ${esc(r.dependencies||'Not defined')}</span><span>Next action: ${esc(r.nextAction||'Review evidence')}</span></div>${r.error?`<div class="notice"><b>${r.state==='UNAVAILABLE'?'Source unavailable':'Evidence source not connected'}</b><br>${esc(r.error)}<br>Do not infer an empty or healthy state.</div>`:''}<details><summary>Inspect returned evidence payload</summary><pre class="platform-result-json">${esc(r.payload||'No evidence payload available')}</pre></details><div class="actions"><button class="btn muted" data-open-workspace="${esc(r.workspace)}">OPEN RELATED WORKSPACE</button></div></article>`).join(''):'<p class="empty">No sources match these filters.</p>'}</div></section>
    <section class="card section" id="prJourneyPanel"><div class="eyebrow">CANONICAL MISSION JOURNEY</div><h2>Journey evidence map</h2><p class="sub">Stages are listed for inspection. This release does not infer that a stage is complete without linked runtime evidence.</p><div class="platform-journey-list">${JOURNEY.map((s,i)=>`<div class="platform-journey-row"><span class="platform-journey-index">${String(i+1).padStart(2,'0')}</span><div><b>${esc(s[0])}</b><p class="sub">${esc(s[1])}</p></div><span class="pill neutral">UNVERIFIED</span></div>`).join('')}</div><div class="notice">The full journey is preserved. A real mission's stage status must come from canonical mission events and evidence—not this display template.</div></section>
    <section class="card section"><div class="eyebrow">TRUST RULES</div><ul><li>Missing or stale evidence is not a pass.</li><li>A successful GET means only that the source returned a response.</li><li>Simulation, vendor sandbox, SIL, HIL and physical-effect evidence must remain distinct.</li><li>This center is read-only and does not mutate mission truth, authorize releases or activate devices.</li></ul></section>
  </div>`;
  host.querySelector('#prRefresh')?.addEventListener('click',()=>loadPlatformResults({filter:host.querySelector('#prFilter')?.value||'all',query:host.querySelector('#prSearch')?.value||''}));
  host.querySelector('#prSearch')?.addEventListener('input',e=>renderResults(latest,host.querySelector('#prFilter')?.value||'all',e.target.value));
  host.querySelector('#prFilter')?.addEventListener('change',e=>renderResults(latest,e.target.value,host.querySelector('#prSearch')?.value||''));
  host.querySelector('#prJourney')?.addEventListener('click',()=>host.querySelector('#prJourneyPanel')?.scrollIntoView({behavior:'smooth',block:'start'}));
  host.querySelectorAll('[data-open-workspace]').forEach(btn=>btn.addEventListener('click',()=>{const key=btn.dataset.openWorkspace;if(typeof window.__onMissionAdminShow==='function')window.__onMissionAdminShow(key);else location.hash=key;}));
}
export async function loadPlatformResults({filter='all',query=''}={}){
  const host=document.querySelector('#view-platform-results'); if(!host)return;
  host.innerHTML='<div class="workspace-loading">Reading governed platform evidence sources…</div>';
  latest=await Promise.all(SOURCES.map(async source=>{
    const checkedAt=new Date().toISOString();
    if(!source.endpoint)return {...source,state:'UNVERIFIED',version:'NOT CONNECTED',checkedAt:null,payload:'No authoritative result endpoint is connected in this release. This domain is visible but not certified.',error:'NO_CANONICAL_EVIDENCE_SOURCE_CONNECTED'};
    try{const data=await api(source.endpoint);return {...source,state:'READ_OK',version:String(data?.version||data?.releaseVersion||data?.certificationVersion||'NOT REPORTED'),checkedAt,payload:summarize(data),error:null};}
    catch(error){return {...source,state:'UNAVAILABLE',version:'UNAVAILABLE',checkedAt,payload:null,error:`${error?.code||'SOURCE_READ_FAILED'} · ${error?.message||'Read failed'}${error?.status?` (HTTP ${error.status})`:''}`};}
  }));
  renderResults(latest,filter,query);
}
export function renderPlatformResults(){return loadPlatformResults();}
