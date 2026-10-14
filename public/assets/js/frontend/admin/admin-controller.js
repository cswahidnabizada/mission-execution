export function createAdminController({state,renderers,platformLogout,setEcosystemSubview=()=>{},updateContext=()=>{}}){
  const show=async(v)=>{
    const requested=String(v||'overview');
    const aliases={'product-build':'product-publisher','product-studio':'product-publisher','product-launch':'product-publisher','product-ecosystem':'product-publisher','expansion':'product-publisher','data-entry':'resource-management','data-catalog':'resource-management','data-studio':'resource-management','data-control':'resource-management','trash':'resource-management','user-experience':'product-experience','demo-product':'product-experience'};
    v=aliases[requested]||requested;
    if(v==='health')v='system-health';
    state.view=v;
    if(location.hash.slice(1)!==v){try{history.replaceState({workspace:v},'',`#${encodeURIComponent(v)}`)}catch{}}
    updateContext(v,{countryCode:state.commandScope?.countryCode||'',sectorCode:state.commandScope?.sectorCode||'',productId:state.workspaceContext?.productId||null,version:state.workspaceContext?.version||null});
    document.querySelectorAll('.view').forEach(x=>x.classList.toggle('active',x.id===`view-${v}`));
    const target=document.querySelector(`#view-${v}`);
    if(target && v!=='overview' && !target.dataset.rendering) target.innerHTML='<div class="workspace-loading"><span class="loading-dot"></span><div><b>Loading workspace</b><small>Reading canonical data. No empty state is inferred.</small></div></div>';
    if(target){target.dataset.workspace=v;target.classList.add('workspace-surface');target.dataset.rendering='1';}
    document.querySelectorAll('[data-view]').forEach(x=>x.classList.toggle('active',x.dataset.view===v||(aliases[x.dataset.view]===v)));
    const renderer=renderers[v]||renderers.overview;
    try{const result=renderer();if(result?.catch)await result;
      const warnings=Array.isArray(state.data?.dataQuality?.warnings)?state.data.dataQuality.warnings:[];
      const warningMap={
        'privacy-rights':['privacySummary','privacyRequests'],consent:['consentPolicies'],residency:['residency'],providers:['externalProviderGovernance'],
        'analytics-governance':['analyticsGovernance'],notifications:['notificationGovernance'],'backup-recovery':['backupRecoveryGovernance'],audit:['complianceEvidence'],
        policies:['jurisdictions','sectors','retention'],companies:['companies'],roles:['roles'],'system-health':['_all']
      };
      const relevant=warnings.filter(x=>warningMap[v]?.includes(x)||warningMap[v]?.includes('_all'));
      if(target && relevant.length && !target.querySelector('.workspace-data-warning')){
        const notice=document.createElement('section'); notice.className='workspace-data-warning';
        notice.innerHTML='<div><b>Some canonical data sources are unavailable.</b><small>'+relevant.map(x=>String(x).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))).join(' · ')+'</small></div><button class="btn muted" type="button" data-refresh-workspace>REFRESH DATA</button>';
        target.prepend(notice); notice.querySelector('[data-refresh-workspace]')?.addEventListener('click',()=>show(v));
      }
    }catch(error){showSectionError(v,error);}finally{if(target)delete target.dataset.rendering;}
  };
  const showSectionError=(view,error)=>{const box=document.querySelector(`#view-${view}`);if(!box)return;const safe=String(error?.message||'This platform section could not be loaded.').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));box.innerHTML=`<section class="card section error-state"><div class="eyebrow">PLATFORM SECTION ERROR</div><h2>This section could not be loaded.</h2><p class="sub">No platform state was changed.</p><div class="notice">${safe}</div><div class="actions"><button class="btn primary" data-retry-section="${view}">RETRY</button><button class="btn muted" data-error-signout>SIGN OUT</button></div></section>`;box.querySelector('[data-retry-section]')?.addEventListener('click',()=>show(view));box.querySelector('[data-error-signout]')?.addEventListener('click',platformLogout);};
  return Object.freeze({show,showSectionError});
}
