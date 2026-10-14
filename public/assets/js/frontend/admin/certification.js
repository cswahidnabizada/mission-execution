// Final certification cockpit. UI composes evidence; it never becomes an authority.
export async function renderCertification({api,esc,show}={}){
  const q=(selector)=>document.querySelector(selector);
  const box=q('#view-certification'); if(!box)return;
  box.innerHTML='<div class="empty">Loading Certification Cockpit…</div>';
  const classes=[
    ['static','STATIC','Architecture and implementation gates'],
    ['schema','SCHEMA','Runtime schema, migrations and indexes'],
    ['integration','INTEGRATION','Connected canonical service paths'],
    ['adversarial','ADVERSARIAL','Tenant, authorization and invalid-state resistance'],
    ['real_journey','REAL JOURNEY','Deployed user journey evidence'],
    ['recovery','RECOVERY','Controlled interruption and recovery evidence']
  ];
  try{
    const c=await api('/api/platform/admin/product-certification');
    const unavailable=c?.status==='unavailable';
    const checks=Array.isArray(c?.checks)?c.checks:[];
    const passed=checks.filter(x=>x.status==='pass').length;
    const failed=checks.filter(x=>x.status==='fail').length;
    const warnings=checks.filter(x=>x.status!=='pass'&&x.status!=='fail').length;
    const runtimeEvidence=checks.some(x=>x.key==='runtime.convergence'&&x.status==='pass');
    const overall=unavailable?'AUTHORITY UNAVAILABLE':(c?.status||'UNKNOWN').toUpperCase();
    const stateClass=unavailable||failed?'bad':overall==='CERTIFIED'?'ok':'warn';
    const evidenceStatus=(key)=>{
      if(key==='static')return passed?'PASS':'PENDING';
      if(key==='schema')return checks.some(x=>/schema/i.test(String(x.key||x.detail||''))&&x.status==='pass')?'PASS':'PENDING';
      if(key==='integration')return checks.some(x=>/integration|convergence/i.test(String(x.key||x.detail||''))&&x.status==='pass')?'PASS':'PENDING';
      if(key==='adversarial')return 'PENDING DEPLOYED RUN';
      if(key==='real_journey')return runtimeEvidence?'PASS':'PENDING DEPLOYED RUN';
      return 'PENDING CONTROLLED EXERCISE';
    };
    box.innerHTML=`<div class="eyebrow">SUPER ADMIN · FINAL CERTIFICATION</div>
      <div class="cert-header"><div><h1 class="title">Prove the product. Do not infer it.</h1><p class="sub">This cockpit makes the final evidence path visible. It coordinates certification evidence but never becomes Mission, Lifecycle, Authorization or Product Truth.</p></div><span class="pill ${stateClass}">${esc(overall)}</span></div>
      <section class="cert-command card"><div><span class="eyebrow">CURRENT GATE</span><h2>${failed?'Resolve certification failures':warnings?'Review certification warnings':'Execute the next missing proof'}</h2><p class="sub">${unavailable?'The certification authority could not be read. No certification state is inferred.':`Structural checks: ${passed} passed · ${failed} failed · ${warnings} pending/warning.`}</p></div><div class="actions"><button class="btn primary" id="certRefresh">REFRESH EVIDENCE</button><button class="btn muted" id="certHealth">OPEN SYSTEM HEALTH</button></div></section>
      <section class="card section"><div class="section-head"><div><span class="eyebrow">SIX REQUIRED EVIDENCE CLASSES</span><h2>Certification is a proof chain</h2><p class="sub">A product is not certified merely because its source and schema are correct.</p></div><span class="pill ${stateClass}">${unavailable?'NO INFERENCE':failed?'BLOCKED':'GATED'}</span></div><div class="cert-evidence-grid">${classes.map(([key,label,desc],i)=>{const st=evidenceStatus(key);const cls=st==='PASS'?'ok':st.startsWith('PENDING')?'warn':'bad';return `<article class="cert-evidence-card"><div class="cert-index">${String(i+1).padStart(2,'0')}</div><div><span class="eyebrow">${label}</span><h3>${esc(st)}</h3><p>${esc(desc)}</p></div><span class="pill ${cls}">${esc(st)}</span></article>`}).join('')}</div></section>
      <section class="grid two"><article class="card section"><div class="section-head"><div><span class="eyebrow">PRODUCT JOURNEY</span><h2>One logical path</h2></div><span class="pill ok">CANONICAL</span></div><div class="cert-flow"><span>Authenticate</span><b>→</b><span>Authorize</span><b>→</b><span>Execute</span><b>→</b><span>Observe</span><b>→</b><span>Verify</span><b>→</b><span>Recover</span></div><p class="sub">The UI follows the same sequence as the product certification model instead of presenting unrelated health numbers.</p></article><article class="card section"><div class="section-head"><div><span class="eyebrow">NON-NEGOTIABLE</span><h2>No evidence = no certification</h2></div><span class="pill warn">GOVERNED</span></div><ul class="cert-rules"><li>Database failure never becomes false empty truth.</li><li>Cross-tenant access must be rejected.</li><li>Lifecycle transitions must come from the active contract.</li><li>Retries must remain idempotent.</li><li>Interrupted work must surface recovery state.</li></ul></article></section>
      <section class="card section"><div class="section-head"><div><span class="eyebrow">CHECK DETAIL</span><h2>What the current authority reports</h2></div></div><div class="checks">${checks.map(x=>`<article class="check"><b>${esc(x.key||'check')}</b><div class="mini">${esc(x.status||'unknown')}</div><p class="sub">${esc(x.detail||x.message||'No detail supplied.')}</p></article>`).join('')||'<div class="empty">No certification checks were returned.</div>'}</div></section>`;
    q('#certRefresh').onclick=()=>renderCertification({api,esc,show});
    q('#certHealth').onclick=()=>show('system-health');
  }catch(e){box.innerHTML=`<section class="card section error-state"><div class="eyebrow">CERTIFICATION AUTHORITY ERROR</div><h2>Certification evidence could not be loaded.</h2><p class="sub">No certification state has been inferred from this failure.</p><div class="notice">${esc(e.message||'Certification authority unavailable')}</div><div class="actions"><button class="btn primary" id="retryCertification">RETRY</button><button class="btn muted" id="healthCertification">SYSTEM HEALTH</button></div></section>`;q('#retryCertification').onclick=()=>renderCertification({api,esc,show});q('#healthCertification').onclick=()=>show('system-health');}
}
