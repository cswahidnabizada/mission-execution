/* ON Mission 10.61.0 — shared experience context. UI state only; never a domain authority. */
const clean=v=>String(v??'').trim();
const storageKey=surface=>`onmission.experience.context.${clean(surface)||'admin'}.v1`;
export function readExperienceContext(surface='admin'){try{const raw=sessionStorage.getItem(storageKey(surface));const x=raw?JSON.parse(raw):{};return {surface,workspace:clean(x.workspace)||'overview',countryCode:clean(x.countryCode).toUpperCase(),sectorCode:clean(x.sectorCode).toLowerCase(),productId:x.productId??null,version:clean(x.version)||null}}catch{return {surface,workspace:'overview',countryCode:'',sectorCode:'',productId:null,version:null}}}
export function writeExperienceContext(patch={},surface='admin'){const next={...readExperienceContext(surface),...patch,surface};try{sessionStorage.setItem(storageKey(surface),JSON.stringify(next))}catch{}return next}
export function clearExperienceContext(surface='admin'){try{sessionStorage.removeItem(storageKey(surface))}catch{}}
export function contextLabel(c=readExperienceContext()){const scope=[c.countryCode,c.sectorCode].filter(Boolean).join(' · ');const product=c.productId?`Product #${c.productId}`:'';const version=c.version?`v${c.version}`:'';return [scope,product,version].filter(Boolean).join(' · ')||'Platform-wide'}
