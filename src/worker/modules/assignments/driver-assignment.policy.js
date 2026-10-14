export const DRIVER_OPERATIONAL_SITUATIONS=Object.freeze(["Available","Driving","Traffic","Break","Unavailable"]);
import {MISSION_PRE_CUSTODY_STATUSES,isPreCustodyStatus,isCustodyStatus,isLifecycleTerminal,canonicalMissionStatus} from "../../domains/logistics/logistics-lifecycle.contract.js";

export const DIRECT_ASSIGNMENT_STATUSES=MISSION_PRE_CUSTODY_STATUSES;

export function missionAssignmentWindow(status){
  const s=canonicalMissionStatus(status);
  if(isPreCustodyStatus(s))return Object.freeze({mutable:true,reason:null,mode:"DIRECT"});
  if(isCustodyStatus(s))return Object.freeze({mutable:false,reason:"Physical custody is active. Change execution through custody resolution.",mode:"CUSTODY"});
  if(s==="Delivered")return Object.freeze({mutable:false,reason:"Delivery truth is established. Finish or recover completion instead of changing executor.",mode:"DELIVERED"});
  if(isLifecycleTerminal(s))return Object.freeze({mutable:false,reason:"This mission is closed.",mode:"CLOSED"});
  return Object.freeze({mutable:false,reason:`Mission status ${s} does not allow execution assignment.`,mode:"LOCKED"});
}

export function driverAssignmentEligibility(driver={},missionStatus="Pending"){
  const window=missionAssignmentWindow(missionStatus);
  if(!window.mutable)return Object.freeze({allowed:false,severity:"blocked",reason:window.reason,window:window.mode,situation:String(driver?.situation||"Available")});
  if(Number(driver?.active??1)!==1)return Object.freeze({allowed:false,severity:"blocked",reason:"Driver account is inactive.",window:window.mode,situation:String(driver?.situation||"Available")});

  const situation=DRIVER_OPERATIONAL_SITUATIONS.includes(String(driver?.situation||""))
    ?String(driver.situation):"Available";

  if(situation==="Unavailable")return Object.freeze({
    allowed:false,severity:"blocked",reason:"Driver marked Unavailable. Choose another driver or wait until the driver becomes available.",window:window.mode,situation
  });

  const cautions={
    Driving:"Driver is currently driving. Check workload before adding another mission.",
    Traffic:"Driver is in traffic. Assignment is allowed, but timing may be affected.",
    Break:"Driver is on a break. Assignment is allowed, but confirm availability before execution."
  };
  return Object.freeze({
    allowed:true,
    severity:cautions[situation]?"caution":"ready",
    reason:cautions[situation]||"Driver is available for assignment.",
    window:window.mode,
    situation
  });
}
