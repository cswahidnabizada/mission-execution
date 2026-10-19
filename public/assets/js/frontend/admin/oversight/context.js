/* ON Mission 10.79.0 — canonical administrative navigation bridge.
 * Navigation is a composition dependency, not an authority. The bridge is
 * deliberately process-global so independently loaded/cached ES modules can
 * never create competing navigation state for the same Control Plane.
 */
export { $, api, esc, state, configList, loadCountryLaunches, loadCountryBlueprints, loadAdminCountries, loadProductCountries, countryPickerMarkup, bindCountryPicker, bindProductCountryPicker, loadCommandCenter, launchManifestFromForm, ensureStepUp, login } from '../admin-runtime.js?v=16.10.75';

const NAVIGATION_KEY='__ON_MISSION_CANONICAL_ADMIN_NAVIGATE__';
let localNavigate=null;

export function setAdminShow(fn){
  if(typeof fn!=='function')throw new TypeError('Canonical admin navigation must be configured before rendering Admin workspaces');
  localNavigate=fn;
  globalThis[NAVIGATION_KEY]=fn;
}

export const navigate=(...args)=>{
  const fn=globalThis[NAVIGATION_KEY]||localNavigate;
  if(typeof fn!=='function')throw new TypeError('Canonical admin navigation is unavailable');
  return fn(...args);
};

export const productEcosystemState={subview:'overview',countryCode:'',sectorCode:''};
