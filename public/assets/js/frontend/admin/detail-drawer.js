/* ON Mission 10.72.0 — shared read-only admin detail drawer. */
import {escapeHtml} from './ui-system.js?v=16.58.0';
export function openAdminDrawer({title='Details',eyebrow='PLATFORM DETAIL',summary='',facts=[],actionLabel='OPEN WORKSPACE',onAction=()=>{}}={}){
 const root=document.querySelector('#adminDrawerRoot'); if(!root)return;
 root.innerHTML=`<div class="admin-drawer-backdrop" data-drawer-close></div><aside class="admin-detail-drawer" role="dialog" aria-modal="true" aria-labelledby="adminDrawerTitle"><header><div><span class="eyebrow">${escapeHtml(eyebrow)}</span><h2 id="adminDrawerTitle">${escapeHtml(title)}</h2></div><button class="btn muted" type="button" data-drawer-close>ESC</button></header><div class="admin-drawer-body">${summary?`<p class="sub">${escapeHtml(summary)}</p>`:''}<div class="admin-drawer-facts">${facts.map(f=>`<div><span>${escapeHtml(f.label||'')}</span><b>${escapeHtml(f.value??'—')}</b></div>`).join('')}</div></div><footer><button class="btn primary" id="adminDrawerAction">${escapeHtml(actionLabel)}</button><button class="btn muted" data-drawer-close>CLOSE</button></footer></aside>`;
 root.classList.add('open');
 const close=()=>{root.classList.remove('open');setTimeout(()=>{root.innerHTML=''},160)};
 root.querySelectorAll('[data-drawer-close]').forEach(x=>x.addEventListener('click',close));
 root.querySelector('#adminDrawerAction')?.addEventListener('click',()=>{close();onAction()});
 const esc=e=>{if(e.key==='Escape'){e.preventDefault();close();document.removeEventListener('keydown',esc)}};document.addEventListener('keydown',esc);
}
