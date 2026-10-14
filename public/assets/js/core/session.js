// Browser session is cookie/server authoritative. This module keeps only a small, non-authoritative
// compatibility projection for UI helpers; authentication and authorization never trust it.
const KEY = "onmission_ui_session";
export function saveAccessSession(data) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({role:data.role||null,organizationRole:data.organizationRole||null,countryCode:data.countryCode||null}));
  } catch {}
}
export function getSession(){try{return JSON.parse(sessionStorage.getItem(KEY)||"null")||{};}catch{return {};}}
export function getDriverSession(){return getSession();}
export function isAdmin(){const s=getSession();return s.role==="admin"&&["owner","admin"].includes(s.organizationRole||"admin");}
export function clearSession(){try{sessionStorage.removeItem(KEY);}catch{}}
