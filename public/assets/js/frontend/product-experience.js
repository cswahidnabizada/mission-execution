import {esc} from './core/api.js';

export const TRUSTED_EXPERIENCE_TYPES=Object.freeze(['workspace','section','navigation','card','panel','form','empty-state','guidance']);
const TRUSTED_ROUTES=new Map([['home','#home'],['work','#work'],['network','#network'],['objects','#objects'],['people','#people'],['account','#account']]);
const arr=v=>Array.isArray(v)?v:[];
const obj=v=>v&&typeof v==='object'&&!Array.isArray(v)?v:{};
const text=(v,f='')=>String(v??f);

function contentMap(manifest){return new Map(arr(manifest?.presentation?.content).map(x=>[text(x.key),x]));}
function labelMap(manifest){return obj(manifest?.presentation?.labels);}
function enabledCapabilities(manifest){return new Set(arr(manifest?.capabilities).filter(x=>x?.enabled!==false).map(x=>text(x.key)));}
function contentFor(map,key){const c=map.get(text(key));return c||null;}
function resolveText(value,manifest,map,fallback=''){
  const raw=text(value);
  const labels=labelMap(manifest);
  if(raw.startsWith('label:'))return text(labels[raw.slice(6)],fallback);
  if(raw.startsWith('content:'))return text(contentFor(map,raw.slice(8))?.body,fallback);
  return raw||fallback;
}

function canRender(item,caps){return !item?.capability||caps.has(text(item.capability));}

function navigationModel(item,manifest){
  return arr(item?.navigation).filter(x=>x&&x.visible!==false).map(x=>({
    key:text(x.key),label:resolveText(x.labelKey||x.key,manifest,new Map(),'Navigation'),href:TRUSTED_ROUTES.get(text(x.key))||null
  })).filter(x=>x.key&&x.href);
}

export function resolveTrustedNavigation(product,situation){
  const base=Array.from(TRUSTED_ROUTES.entries()).map(([key,href])=>({key,href,label:key.charAt(0).toUpperCase()+key.slice(1)}));
  const experiences=arr(product?.runtime?.manifest?.presentation?.experiences);
  const caps=enabledCapabilities(product?.runtime?.manifest);
  const exp=experiences.find(x=>x.type==='workspace')||experiences[0];
  if(!exp)return base;
  const nav=navigationModel(exp,product.runtime.manifest);
  if(!nav.length)return base;
  const allowed=new Set(base.map(x=>x.key));
  const role=String(situation?.role||situation?.session?.role||'member');
  // Product presentation may relabel canonical destinations, but it cannot remove the
  // Human Work Model's six authenticated destinations. Authorization remains enforced by each destination.
  const labels=new Map(nav.filter(x=>allowed.has(x.key)).map(x=>[x.key,x.label]));
  return base.map(x=>({...x,label:labels.get(x.key)||x.label}));
}

function contentBlock(c,manifest,map){
  if(!c)return '';
  const title=resolveText(c.title,c&&manifest,map,'');
  const body=resolveText(c.body,c&&manifest,map,'');
  return `${title?`<h3>${esc(title)}</h3>`:''}${body?`<p class="muted">${esc(body)}</p>`:''}`;
}

function renderSection(item,ctx){
  if(!canRender(item,ctx.caps))return '';
  const c=contentFor(ctx.content,text(item.contentKey));
  const title=resolveText(item.key,ctx.manifest,ctx.content,'');
  const inner=contentBlock(c,ctx.manifest,ctx.content);
  const type=text(item.type,'section');
  if(type==='navigation'){
    const nav=navigationModel({navigation:item.navigation||[]},ctx.manifest).map(n=>`<a class="btn" href="${esc(n.href)}">${esc(n.label)}</a>`).join('');
    return nav?`<section class="app-card surface-card"><div class="eyebrow">NAVIGATION</div><div class="actions">${nav}</div></section>`:'';
  }
  if(type==='empty-state')return `<section class="app-card surface-card"><div class="empty">${esc(resolveText(c?.body||title,ctx.manifest,ctx.content,'Nothing is currently available.'))}</div></section>`;
  if(type==='guidance')return `<section class="app-card surface-card"><div class="eyebrow">GUIDANCE</div>${inner||`<p class="muted">${esc(resolveText(title,ctx.manifest,ctx.content,'Follow the next valid step.'))}</p>`}</section>`;
  const cls=type==='card'?'surface-card':type==='panel'?'surface-card':'surface-card';
  return `<section class="app-card ${cls}"><div class="eyebrow">${esc(type.toUpperCase())}</div>${title?`<h3>${esc(title)}</h3>`:''}${inner}${type==='form'?'<div class="mini">This form is presentation-only. Mutations remain owned by canonical secured actions.</div>':''}</section>`;
}

export function renderProductExperience(host,product,{experienceKey=null,title='Product experience'}={}){
  const manifest=product?.runtime?.available?product?.runtime?.manifest:null;
  const experiences=arr(manifest?.presentation?.experiences).filter(x=>TRUSTED_EXPERIENCE_TYPES.includes(x?.type));
  if(!host||!manifest||!experiences.length)return false;
  const exp=experiences.find(x=>x.key===experienceKey)||experiences.find(x=>x.type==='workspace')||experiences[0];
  if(!exp)return false;
  const ctx={manifest,content:contentMap(manifest),caps:enabledCapabilities(manifest)};
  const sections=arr(exp.sections).filter(x=>canRender(x,ctx.caps)).map(x=>renderSection(x,ctx)).join('');
  const guidance=obj(manifest.presentation?.guidance);
  const guidanceText=resolveText(guidance[exp.key]||guidance.default,manifest,ctx.content,'');
  host.innerHTML=`<section class="product-runtime-experience"><div class="page-head"><div class="eyebrow">GOVERNED PRODUCT EXPERIENCE</div><h1>${esc(resolveText(exp.key,manifest,ctx.content,title))}</h1>${guidanceText?`<p>${esc(guidanceText)}</p>`:''}</div>${sections||'<div class="empty">The compiled product experience has no renderable sections yet.</div>'}</section>`;
  return true;
}
