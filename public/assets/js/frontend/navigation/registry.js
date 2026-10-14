const ROLE_SET=Object.freeze(['admin','operator','manager','member','executor','driver','participant']);

export const NAV=Object.freeze([
  {key:'home',label:'Today',href:'#home',intent:'orientation',description:'What matters now',roles:ROLE_SET},
  {key:'work',label:'Work',href:'#work',intent:'execution',description:'Act and follow through',roles:ROLE_SET},
  {key:'network',label:'Network',href:'#network',intent:'collaboration',description:'People and organizations connected to work',roles:ROLE_SET},
  {key:'objects',label:'Objects',href:'#objects',intent:'operations',description:'Things being operated on',roles:ROLE_SET},
  {key:'people',label:'People',href:'#people',intent:'responsibility',description:'People, roles and access',roles:ROLE_SET},
  {key:'account',label:'Account',href:'#account',intent:'identity',description:'Identity, organization and security',roles:ROLE_SET}
]);

// Compatibility bridges only: legacy human routes resolve into the canonical Human Work model until Wave 6.
export const ROUTE_ALIASES=Object.freeze({
  missions:'work',mission:'work',assignments:'work',assignment:'work',execution:'work',attention:'work',focus:'work',operations:'work',
  'role-workspace':'work',driver:'work',executor:'work','my-driver':'work',company:'people',
  requests:'network',collaboration:'network',partners:'network','network-missions':'network',
  object:'objects','people-access':'people','company-people':'people',
  profile:'account',subscription:'account',verification:'account',access:'account'
});

export function canonicalRouteKey(key){
  const normalized=String(key||'').replace(/^#/,'').split('?')[0].trim();
  if(NAV.some(x=>x.key===normalized)||normalized==='context')return normalized||'home';
  return ROUTE_ALIASES[normalized]||'home';
}
export function canonicalizeAppHash(rawHash){
  const raw=String(rawHash||'').replace(/^#/,'');
  const [path,...rest]=raw.split('?');
  const key=canonicalRouteKey(path);
  if(key==='context')return `#${raw}`;
  const query=rest.length?`?${rest.join('?')}`:'';
  return `#${key}${query}`;
}
export function visibleNav(situation){
  const role=String(situation?.session?.role||situation?.situation?.role||'member');
  return NAV.filter(x=>x.roles.includes(role)).map(x=>({...x}));
}
