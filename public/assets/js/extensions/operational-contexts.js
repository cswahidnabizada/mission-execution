/* ON Mission 10.30.33 operational contexts runtime. */
/* ON Mission 10.30.18 — Complete Operational Context Framework
 * Presentation-only context registry. Existing services, workspaces and actions remain authoritative.
 */
const text=v=>String(v??"").trim().toLowerCase();
const num=v=>Number(v||0);
const status=x=>text(x?.status||x?.mission_status||x?.state);
const hasAny=(x,keys)=>keys.some(k=>{const v=x?.[k];return v!==undefined&&v!==null&&v!==""&&v!==0&&v!==false;});

export const CONTEXTS={
  missions:[
    {id:"all",label:"All missions",match:()=>true},
    {id:"inbound",label:"Inbound",match:x=>["inbound","incoming"].includes(text(x?.direction||x?.mission_direction||x?.missionDirection))||text(x?.flow)==="inbound"},
    {id:"own",label:"Own",match:x=>hasAny(x,["owner_company_id","ownerCompanyId","own_mission","is_owner","owned_by_current_tenant"])||text(x?.relationship)==="own"},
    {id:"shared",label:"Shared",match:x=>hasAny(x,["shared_access","shared_tenant_id","shared_company_id","is_shared","sharedAccess","sharedTenantId"])||["network","shared"].includes(text(x?.source))},
    {id:"requested",label:"Requested",match:x=>text(x?.source).includes("request")||hasAny(x,["request_id","mission_request_id","requestId","missionRequestId"])},
    {id:"foryou",label:"ForYou",match:x=>num(x?.public_enabled)===1||num(x?.publicEnabled)===1||text(x?.distribution_type).includes("foryou")||text(x?.source)==="foryou"},
    {id:"completed",label:"Completed",match:x=>status(x)==="completed"},
    {id:"cancelled",label:"Cancelled",match:x=>["cancelled","canceled"].includes(status(x))}
  ],
  people:[
    {id:"all",label:"All people",match:()=>true},
    {id:"customers",label:"Customers",match:x=>text(x?.kind||x?.type)==="customer"},
    {id:"partners",label:"Partners",match:x=>["partner","trust"].includes(text(x?.kind||x?.type))},
    {id:"drivers",label:"Executors",match:x=>["driver","executor"].includes(text(x?.kind||x?.type))},
    {id:"trusted",label:"Trusted partners",match:x=>["partner","trust"].includes(text(x?.kind||x?.type))&&(text(x?.trust_status||x?.status)==="active"||num(x?.trusted)===1)},
    {id:"non_trusted",label:"Non-trusted",match:x=>["partner","trust"].includes(text(x?.kind||x?.type))&&["pending","inactive","revoked","blocked"].includes(text(x?.trust_status||x?.status))}
  ],
  requests:[
    {id:"all",label:"All requests",match:()=>true},
    {id:"sharing",label:"Sharing mission",match:x=>/share|sharing/i.test(`${x?.type||""} ${x?.kind||""} ${x?.request_type||""}`)},
    {id:"foryou",label:"ForYou",match:x=>/foryou|for you/i.test(`${x?.type||""} ${x?.kind||""} ${x?.request_type||""}`)},
    {id:"shared",label:"Currently shared",match:x=>/shared/i.test(`${x?.type||""} ${x?.kind||""} ${x?.request_type||""}`)},
    {id:"pending",label:"Pending",match:x=>["pending","requested","open"].includes(status(x))},
    {id:"completed",label:"Completed",match:x=>["approved","accepted","completed","fulfilled"].includes(status(x))},
    {id:"declined",label:"Declined",match:x=>["declined","rejected","cancelled","canceled"].includes(status(x))}
  ]
};

export function contextsFor(domain){return CONTEXTS[domain]||CONTEXTS.missions;}
export function contextMatches(domain,id,item){
  const c=contextsFor(domain).find(x=>x.id===id)||contextsFor(domain)[0];
  return Boolean(c?.match(item));
}
export function contextCounts(domain,items){
  return Object.fromEntries(contextsFor(domain).map(c=>[c.id,(items||[]).filter(x=>c.match(x)).length]));
}
