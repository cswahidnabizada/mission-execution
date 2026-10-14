/* ON Mission 10.29.53 — Canonical Operator Action Inventory
 * Read-only presentation contract. It classifies the viewer's legitimate action
 * inventory without granting authority, changing truth, or executing mutations.
 */
export const CANONICAL_OPERATOR_ACTION_INVENTORY_VERSION="2.0";
const EXECUTION_CODES=new Set(["confirm_arrival","confirm_pickup","start_transit","confirm_delivery","complete_mission","assign_driver","change_driver","request_current_location","reclaim_execution","accept_custody","reassign_custody_receiver","confirm_custody_release","finalize_custody_transfer","abort_custody_transfer","start_custody_resolution","start_custody_recovery"]);
const SUPPORT_CODES=new Set(["message","check_assignment","capture_delivery_proof","report_exception","resolve_exception","open_assignment","open_edit","share_current_location","resolve_traffic","resolve_waiting","start_navigation","navigate_route","request_current_location"]);
const MANAGEMENT_CODES=new Set(["edit_mission","edit_mission_data","edit_executor","delete_mission","cancel_mission","reactivate_mission","repost_foryou","restart_network"]);
const HIDDEN_CODES=new Set(["open_mission","navigate"]);

function codeOf(a){return String(a?.code||"").trim().toLowerCase();}
function labelOf(a){return String(a?.label||a?.experience?.label||a?.code||"").trim()||codeOf(a);}
function domainOf(a){return String(a?.domain||a?.category||"operations").trim().toLowerCase();}
function classify(a){
  const code=codeOf(a);
  if(HIDDEN_CODES.has(code))return "NAVIGATION";
  if(EXECUTION_CODES.has(code))return "EXECUTION";
  if(MANAGEMENT_CODES.has(code)||domainOf(a).includes("management"))return "MANAGEMENT";
  if(SUPPORT_CODES.has(code)||domainOf(a).includes("support")||domainOf(a)==="mission")return "SUPPORT";
  return "SUPPORT";
}
function item(a){
  const code=codeOf(a); if(!code||HIDDEN_CODES.has(code))return null;
  const kind=classify(a);
  return Object.freeze({code,label:labelOf(a),kind,domain:domainOf(a),confirmation:Boolean(a?.confirmation),target:a?.target||null,reason:String(a?.reason||a?.experience?.hint||"")});
}
export function buildCanonicalOperatorActionInventory({availableActions=[],primaryAction=null,operatorIntent=null,canonicalCapability=null}={}){
  const input=[...(primaryAction?[primaryAction]:[]),...(Array.isArray(availableActions)?availableActions:[])];
  const seen=new Set(), all=[];
  for(const raw of input){const x=item(raw);if(!x||seen.has(x.code))continue;seen.add(x.code);all.push(x);}
  const execution=all.filter(a=>a.kind==="EXECUTION");
  const support=all.filter(a=>a.kind==="SUPPORT");
  const management=all.filter(a=>a.kind==="MANAGEMENT");
  const intent=String(operatorIntent?.state||"").toUpperCase()||"OBSERVE";
  const canonicalCode=String(canonicalCapability?.code||"").toLowerCase()||null;
  const canonicalInInventory=Boolean(canonicalCode&&all.some(a=>a.code===canonicalCode));
  const result={version:CANONICAL_OPERATOR_ACTION_INVENTORY_VERSION,advisory:true,authoritative:false,
    missionId:Number(operatorIntent?.missionId||0)||null,intent,
    counts:Object.freeze({all:all.length,execution:execution.length,support:support.length,management:management.length}),
    surface:Object.freeze({primaryCode:codeOf(primaryAction)||null,secondaryCount:Math.max(0,all.length-(primaryAction&&all.some(a=>a.code===codeOf(primaryAction))?1:0))}),
    all:Object.freeze(all),execution:Object.freeze(execution),support:Object.freeze(support),management:Object.freeze(management),
    canonical:Object.freeze({code:canonicalCode,exposed:canonicalInInventory,kind:canonicalInInventory?all.find(a=>a.code===canonicalCode)?.kind||null:null}),
    safety:Object.freeze({createsTruth:false,createsAuthorization:false,changesCustody:false,changesResponsibility:false,executesAction:false})};
  return Object.freeze(result);
}
export function validateCanonicalOperatorActionInventory(c){
  const p=[];
  if(c?.advisory!==true||c?.authoritative!==false)p.push("authority_boundary_violation");
  if(!["EXECUTE","SUPPORT","WAIT","REVIEW","OBSERVE"].includes(String(c?.intent||"")))p.push("invalid_intent");
  if(c?.counts?.all!==c?.all?.length)p.push("all_count_mismatch");
  if(c?.counts?.execution!==c?.execution?.length||c?.counts?.support!==c?.support?.length||c?.counts?.management!==c?.management?.length)p.push("category_count_mismatch");
  if(c?.safety?.createsTruth!==false||c?.safety?.createsAuthorization!==false||c?.safety?.executesAction!==false)p.push("mutation_boundary_violation");
  const codes=new Set((c?.all||[]).map(a=>a.code));
  for(const group of [c?.execution,c?.support,c?.management])for(const a of group||[])if(!codes.has(a.code))p.push(`category_member_missing:${a.code}`);
  return [...new Set(p)];
}
