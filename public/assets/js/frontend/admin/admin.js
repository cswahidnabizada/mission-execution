/* ON Mission 10.79.0 — Super Admin bootstrap */
import {renderAdminShell} from './shell.js?v=16.10.18';
import { $, api, esc, state, primarySections, supportingSections, sections, platformLogout, login } from './admin-runtime.js?v=16.10.18';
import {createAdminController} from './admin-controller.js?v=16.10.18';
import {readExperienceContext} from '../core/experience-context.js?v=16.10.18';
import {adminPanelRenderers,configureAdminPanelShow,refreshAdminData} from './panel-registry.js?v=16.10.18';
import {setAdminShow} from './oversight/context.js?v=16.10.18';

let show;
let shellApi=null;
const shell=()=>{shellApi=renderAdminShell({sections,platformLogout,show,state});};
const adminController=createAdminController({state,renderers:adminPanelRenderers,platformLogout,setEcosystemSubview:()=>{},updateContext:key=>shellApi?.updateContext?.(key)});
show=adminController.show;
// Bind the canonical controller directly at bootstrap. The Control Plane must never render
// with an unbound navigation dependency, even if registry composition changes.
setAdminShow(show);
configureAdminPanelShow(show);

async function load(){
  try{
    const session=await api('/api/platform/admin/super-admin/session');
    if(session.authenticated===false){login();return;}
    state.superAdmin=true;
  }catch(error){
    if(Number(error?.status)===401||Number(error?.status)===403){login();return;}
    document.body.innerHTML=`<main class="admin-auth"><section class="admin-auth-card"><div class="eyebrow">ON MISSION · PLATFORM</div><div class="auth-mark">OM</div><h1 class="title">Platform session unavailable</h1><p class="sub">Platform temporarily unavailable. The Super Admin session endpoint could not be reached. No credentials were discarded.</p><div class="notice">${esc(error?.message||'Session verification failed')}</div><div class="actions"><button class="btn primary auth-submit" id="retryPlatform">RETRY PLATFORM</button><button class="btn" id="logoutPlatform">SIGN OUT</button></div><a class="auth-back" href="/">← Return to ON Mission</a></section></main>`;
    document.querySelector('#retryPlatform')?.addEventListener('click',()=>location.reload());document.querySelector('#logoutPlatform')?.addEventListener('click',platformLogout);return;
  }
  shell();
  try{await refreshAdminData();}catch(error){
    state.data={overview:{companyCount:0,countryCount:0,pendingReviews:0},dataQuality:{status:'degraded',warnings:['control_plane']}};
    const box=$('#view-overview');
    if(box)box.innerHTML=`<div class="eyebrow">CONTROL PLANE</div><h1 class="title">Super Admin authenticated</h1><p class="sub">The administrative session is valid. Platform data could not be loaded completely.</p><section class="card section error-state"><div class="notice"><b>Control-plane data error</b><br>${esc(error?.message||'The control-plane data service is unavailable.')}</div><div class="actions"><button class="btn primary" id="retryControlPlane">RETRY DATA</button><button class="btn muted" id="controlPlaneSignOut">SIGN OUT</button></div></section>`;
    $('#retryControlPlane')?.addEventListener('click',()=>location.reload());$('#controlPlaneSignOut')?.addEventListener('click',platformLogout);
  }
  const storedContext=readExperienceContext();
  const requested=location.hash.slice(1)||storedContext.workspace||'overview';
  show(requested);
}
load();
