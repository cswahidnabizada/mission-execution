import {resolveActionTarget} from "./action-service-map.js";

/** @deprecated Compatibility adapter. All routing truth lives in action-service-map.js. */
export function targetForAction(action,context={}){
  return resolveActionTarget(action?.code,context);
}
