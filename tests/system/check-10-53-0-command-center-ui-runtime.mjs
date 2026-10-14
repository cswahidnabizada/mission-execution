import assert from 'node:assert/strict';

const overview={id:'view-overview',innerHTML:'',querySelector:()=>null,querySelectorAll:()=>[]};
const documentMock={
  querySelector:(selector)=>selector==='#view-overview'?overview:null,
  querySelectorAll:()=>[]
};
globalThis.document=documentMock;
const mod=await import(`../../public/assets/js/frontend/admin/command-center.js?runtime=${Date.now()}`);
let shown=null;
const sample={
  surface:{status:'HEALTHY',version:'10.60.0',stats:[{label:'Active countries',value:1,action:'countries'}],workspaceStates:[{key:'product-publisher',status:'READY',count:1,action:'product-publisher'}],lifecycle:[{label:'DRAFT',count:1}],queue:[],preview:{productStatus:'OPERATING',activeCountries:1,activeProducts:1,readinessPercent:100,pendingReviews:0}},
  now:{reason:'No blocking work',actionKey:'product-health',actionLabel:'OPEN PRODUCT MONITOR'},
  productLens:{countryCode:null,sectorCode:null},
  recentOperations:[],
  unavailableAuthorities:[]
};
await mod.renderCommandCenter({
  $:(selector)=>selector==='#view-overview'?overview:null,
  state:{view:'overview',commandScope:{}},
  esc:v=>String(v??''),
  loadCommandCenter:async()=>sample,
  api:async()=>({}),
  navigate:v=>{shown=v}
});
assert.match(overview.innerHTML,/Control Center/);
assert.match(overview.innerHTML,/BUILD/);
assert.match(overview.innerHTML,/Market Factory/);
assert.match(overview.innerHTML,/CURRENT ACTION/);
assert.match(overview.innerHTML,/RELEASE JOURNEY/);
assert.equal(shown,null);
console.log('10.53.0 Command Center browser-render contract: PASS');
