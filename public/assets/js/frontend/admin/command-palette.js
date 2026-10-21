/* ON Mission 11.03.0 — Super Admin Command Palette 2.0.
 * Searches workspace capabilities locally and real platform resources through the read-only
 * Control Plane resource-search projection. Resource actions open their canonical workspace.
 */
import {ADMIN_WORKSPACES} from './workspace-registry.js?v=16.10.90';
import {api,esc} from './admin-runtime.js?v=16.10.90';
import {openResourceExplorer} from './resource-explorer.js?v=16.10.90';

export function installCommandPalette({show,state}){
 if(document.querySelector('#adminCommandPalette'))return;
 const host=document.createElement('div');host.id='adminCommandPalette';
 host.innerHTML=`<div class="command-palette-backdrop" data-palette-close></div><section class="command-palette command-palette-v2" role="dialog" aria-modal="true" aria-labelledby="commandPaletteTitle"><header class="command-palette-head"><div><div class="eyebrow">SUPER ADMIN · COMMAND</div><h2 id="commandPaletteTitle">Find anything</h2><p class="mini">Workspaces + platform resources · context preserved · read-only search</p></div><button class="btn muted" type="button" data-palette-close>ESC</button></header><div class="command-palette-search"><span>⌘</span><input id="commandPaletteInput" type="search" autocomplete="off" placeholder="Search product, tenant, mission, release, operation…" aria-label="Search platform"></div><div id="commandPaletteResults" class="command-palette-results"></div><footer class="command-palette-foot"><span>Enter to open first result</span><span>Esc to close</span><span>Canonical authority owns every mutation</span></footer></section>`;
 document.body.appendChild(host);
 const input=host.querySelector('#commandPaletteInput');const results=host.querySelector('#commandPaletteResults');let timer=null;let requestId=0;
 const openResource=(r)=>{close();openResourceExplorer({type:r.type,id:r.id})};
 const render=(query='',resources=[])=>{const q=String(query||'').trim().toLowerCase();const workspaces=ADMIN_WORKSPACES.filter(w=>!q||`${w.label} ${w.key} ${w.description} ${w.groupLabel}`.toLowerCase().includes(q)).slice(0,10);results.innerHTML=`${workspaces.length?`<div class="palette-section"><span class="eyebrow">WORKSPACES</span>${workspaces.map((w,i)=>`<button type="button" class="command-palette-item" data-palette-key="${esc(w.key)}"><span class="command-palette-icon">${esc(w.label.slice(0,1))}</span><span><b>${esc(w.label)}</b><small>${esc(w.groupLabel)} · ${esc(w.description)}</small></span><kbd>${i<9?i+1:''}</kbd></button>`).join('')}</div>`:''}${resources.length?`<div class="palette-section"><span class="eyebrow">PLATFORM RESOURCES</span>${resources.map((r,i)=>`<button type="button" class="command-palette-item resource" data-resource-index="${i}"><span class="command-palette-icon resource-icon">${esc(String(r.type||'R').slice(0,1).toUpperCase())}</span><span><b>${esc(r.name||'Resource')}</b><small>${esc(String(r.type||'resource').toUpperCase())} · ${esc(r.subtitle||r.status||'')}</small></span><kbd>↵</kbd></button>`).join('')}</div>`:''}${!workspaces.length&&!resources.length?'<div class="empty palette-empty">No workspace or platform resource matched.</div>':''}`;
 results.querySelectorAll('[data-palette-key]').forEach(b=>b.addEventListener('click',()=>{close();show(b.dataset.paletteKey)}));results.querySelectorAll('[data-resource-index]').forEach(b=>b.addEventListener('click',()=>openResource(resources[Number(b.dataset.resourceIndex)])))};
 const search=async(query)=>{const id=++requestId;const q=String(query||'').trim();if(q.length<2){render(q,[]);return}try{const d=await api(`/api/platform/admin/resource-search?q=${encodeURIComponent(q)}&limit=20`);if(id!==requestId)return;render(q,d.results||[])}catch(e){if(id!==requestId)return;render(q,[]);results.insertAdjacentHTML('beforeend',`<div class="palette-error">${esc(e.message||'Resource search unavailable')}</div>`)}};
 const open=()=>{host.classList.add('open');input.value=state.commandLauncherQuery||'';render(input.value,[]);requestAnimationFrame(()=>{input.focus();input.select();if(input.value.length>=2)search(input.value)})};
 const close=()=>{host.classList.remove('open');state.commandLauncherQuery='';input.value='';requestId++};
 host.querySelectorAll('[data-palette-close]').forEach(x=>x.addEventListener('click',close));
 input.addEventListener('input',()=>{state.commandLauncherQuery=input.value;clearTimeout(timer);timer=setTimeout(()=>search(input.value),160);if(input.value.trim().length<2)render(input.value,[])});
 input.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();close();return}if(event.key==='Enter'){const first=results.querySelector('.command-palette-item');if(first){event.preventDefault();first.click()}}});
 document.addEventListener('keydown',event=>{if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'){event.preventDefault();open()}else if(event.key==='Escape'&&host.classList.contains('open'))close()});
 document.querySelectorAll('[data-open-command-palette]').forEach(button=>button.addEventListener('click',open));
 return {open,close};
}
