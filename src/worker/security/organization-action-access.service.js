import {requireSession} from '../core/auth-session.js';
import {resolveProductConfiguration,roleCanAction} from './product-configuration.service.js';
function bad(message,status=403){const e=new Error(message);e.status=status;return e;}
export async function requireOrganizationAction(request,env,actionCode){
  const session=await requireSession(request,env);
  if(session.role!=='admin')throw bad('Organization access required');
  const role=String(session.organizationRole||'');
  if(!role)throw bad('Organization role is unavailable');
  const config=await resolveProductConfiguration(env);
  if(!roleCanAction(config,role,actionCode))throw bad('Organization role is not authorized for this action');
  session.organizationRole=role;
  return session;
}
