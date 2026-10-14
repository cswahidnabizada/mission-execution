import {api} from './api.js';


function browserGuess(){
  try{
    const tz=Intl.DateTimeFormat().resolvedOptions().timeZone||'';
    const lang=(navigator.language||'').toUpperCase();
    if(tz==='Europe/Berlin'||tz==='Europe/Busingen'||lang.endsWith('-DE'))return 'DE';
    if(lang.endsWith('-AT'))return 'AT';if(lang.endsWith('-CH'))return 'CH';if(lang.endsWith('-NL'))return 'NL';if(lang.endsWith('-BE'))return 'BE';if(lang.endsWith('-FR'))return 'FR';if(lang.endsWith('-GB'))return 'GB';if(lang.endsWith('-US'))return 'US';
  }catch{}
  return '';
}
export async function hydrateCountryPicker(target){
  const select=typeof target==='string'?document.querySelector(target):target;if(!select)return;
  const original=select.id;select.setAttribute('hidden','');select.setAttribute('aria-hidden','true');
  let wrap=select.parentElement?.querySelector(`[data-country-combo="${original}"]`);
  if(!wrap){wrap=document.createElement('div');wrap.className='country-combo';wrap.dataset.countryCombo=original;select.parentElement?.insertBefore(wrap,select);}
  wrap.innerHTML=`<label class="country-combo-label" for="${original}Search">Country</label><input id="${original}Search" class="input country-combo-input" type="search" autocomplete="country-name" list="${original}Options" placeholder="Search your country…" aria-describedby="${original}Hint"><datalist id="${original}Options"></datalist><div id="${original}Hint" class="country-combo-hint">Start typing to find and select your country.</div>`;
  const input=wrap.querySelector('input'),list=wrap.querySelector('datalist');
  let countries=[];try{const r=await api('/api/countries',{credentials:'same-origin',cache:'no-store'});countries=Array.isArray(r?.countries)?r.countries:[];}catch{}
  if(!countries.length){input.placeholder='No country is currently available';input.disabled=true;select.required=false;wrap.querySelector('.country-combo-hint').textContent='Country access appears only after Super Admin activates a country product.';return;}
  list.innerHTML=countries.map(c=>`<option value="${escapeHtml(c.name)}" label="${escapeHtml(c.code)}"></option>`).join('');
  const guess=select.value||browserGuess();const guessed=countries.find(c=>String(c.code).toUpperCase()===guess);if(guessed){select.value=guessed.code;input.value=guessed.name;wrap.querySelector('[data-country-guessed]')?.remove();const hint=wrap.querySelector('.country-combo-hint');hint.dataset.countryGuessed='1';hint.textContent=`Suggested from your browser region: ${guessed.name}. You can change it.`;}
  function sync(){const raw=input.value.trim().toLowerCase();const match=countries.find(c=>String(c.name).toLowerCase()===raw||String(c.code).toLowerCase()===raw);if(match){select.value=String(match.code).toUpperCase();input.dataset.countryCode=String(match.code).toUpperCase();input.setCustomValidity('');wrap.classList.remove('invalid');}else{select.value='';delete input.dataset.countryCode;input.setCustomValidity(raw?'Choose a country from the list.':'');wrap.classList.toggle('invalid',raw.length>0);} input.dispatchEvent(new CustomEvent('country-picker-change',{bubbles:true,detail:{code:select.value||null}}));}
  input.addEventListener('input',sync);input.addEventListener('change',sync);select.required=true;
  if(!select.value)input.value='';
  sync();
}
function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
