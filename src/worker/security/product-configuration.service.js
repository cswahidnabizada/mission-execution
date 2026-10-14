import {RELEASE_VERSION} from '../core/release.js';
/** ON Mission 10.38.5 — Canonical Product Configuration Runtime
 * Product configuration is the control-plane input to user experience and eligibility.
 * It never replaces authorization, mission truth, lifecycle, billing state or secrets.
 */
import {getActivePlatformConfiguration} from './platform-configuration.service.js';
import {authorityUnavailable} from '../core/canonical-db.js';

export const DEFAULT_PRODUCT_CONFIGURATION=Object.freeze({
  capabilities:{enabled:['organization','people','mission','object','resource','relationship','communication','evidence','policy','capability','logistics']},
  roles:{actions:{
    owner:['create_mission','edit_mission','edit_mission_data','delete_mission','assign_driver','change_driver','share_network','share_foryou','repost_foryou','restart_network','approve_foryou_request','decline_foryou_request'],
    admin:['create_mission','edit_mission','edit_mission_data','delete_mission','assign_driver','change_driver','share_network','share_foryou','repost_foryou','restart_network','approve_foryou_request','decline_foryou_request'],
    manager:['create_mission','edit_mission','edit_mission_data','assign_driver','change_driver','share_network','share_foryou','repost_foryou','restart_network','approve_foryou_request','decline_foryou_request'],
    operator:['edit_mission_data','assign_driver','change_driver','share_network','approve_foryou_request','decline_foryou_request'],
    developer:[]
  }},
  rendering:{labels:{product:'ON Mission',work:'Work',people:'People',objects:'Objects',network:'Network',insights:'Insights'},show:{work:true,network:true,people:true,objects:true,insights:true},capabilityContext:'adaptive'},
  guidance:{organization:{steps:['Activate your organization','Configure your capabilities','Add people','Create your first mission','Assign responsibility','Execute and complete']},executor:{steps:['Complete your identity','Become ready','Review assigned work','Follow the next action','Record evidence','Complete responsibility']}},
  mission_rules:{intake:{mode:'capability_template',defaultCapability:'logistics',requiredCore:['objective','responsibility','schedule'],logisticsFields:['route','object','vehicle','handling']}},
  countries:{mode:'catalog'},
  communication_policies:{defaultMode:'governed'},
  policy:{default:{mode:'policy_driven',denyByDefault:true}},
  operational_thresholds:{liveness:{enabled:true}}
});

const clone=v=>JSON.parse(JSON.stringify(v));
function merge(base,extra){if(!extra||typeof extra!=='object'||Array.isArray(extra))return base;for(const [k,v] of Object.entries(extra)){if(v&&typeof v==='object'&&!Array.isArray(v)&&base[k]&&typeof base[k]==='object'&&!Array.isArray(base[k]))merge(base[k],v);else base[k]=v;}return base;}
export async function resolveProductConfiguration(env){
  const out=clone(DEFAULT_PRODUCT_CONFIGURATION);
  const keys=[['capabilities','catalog'],['roles','action_policy'],['rendering','product_experience'],['guidance','user_journey'],['mission_rules','intake'],['countries','catalog'],['communication_policies','default'],['policy','default'],['operational_thresholds','default']];
  const rows=await Promise.all(keys.map(async ([d,k])=>{
    try{return await getActivePlatformConfiguration(env,d,k);}
    catch(error){throw authorityUnavailable('platform_configuration',error);}
  }));
  for(let i=0;i<keys.length;i++){const row=rows[i];if(row?.payload)merge(out,{[keys[i][0]]:row.payload});}
  return out;
}
export function roleCanAction(configuration,role,action){return new Set(configuration?.roles?.actions?.[String(role)]||[]).has(String(action));}
export function enabledCapability(configuration,code){const list=configuration?.capabilities?.enabled;return !Array.isArray(list)||list.includes(String(code));}
export function publicProductConfiguration(configuration){
  return {version:RELEASE_VERSION,rendering:configuration.rendering,guidance:configuration.guidance,missionRules:configuration.mission_rules,policy:configuration.policy,capabilities:{enabled:configuration.capabilities?.enabled||[]}};
}
