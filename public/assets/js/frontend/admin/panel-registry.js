/* ON Mission 10.79.0 — Canonical Admin Panel Registry
 * Single composition point. Workspaces own their implementation; this registry owns only routing composition.
 */
import { setAdminShow, adminPanelRenderers as oversightRenderers, refreshAdminData } from './oversight-panels.js?v=16.10.35';
import { setGovernanceShow, renderDataControl, renderDataEntry, renderTrash } from './data-governance.js?v=16.10.35';
import {renderOperations,renderActionMatrix,renderReleaseCenter,renderLaunchCenter,renderDependencyImpact,renderAgenticControl} from './operating-system.js?v=16.10.35';
import {renderResourceManagement} from './resource-management.js?v=16.10.35';
import {renderUserExperienceLab} from './user-experience-lab.js?v=16.10.35';
import {renderDemoProduct} from './demo-product.js?v=16.10.35';
import {renderProductExperience} from './product-experience.js?v=16.10.35';
import {renderInfrastructureGovernance} from './infrastructure-governance.js?v=16.10.35';
import {renderProductIdentity} from './product-identity.js?v=16.10.35';

let show=null;
export function configureAdminPanelShow(fn){
  if(typeof fn!=='function')throw new TypeError('Canonical admin navigation must be configured before panel composition');
  show=fn;
  setAdminShow(show);
  setGovernanceShow(show);
}

export { refreshAdminData };
export const adminPanelRenderers={...oversightRenderers,
  'resource-management':()=>renderResourceManagement({show}),
  'data-entry':renderDataEntry,
  trash:renderTrash,
  'data-control':renderDataControl,
  operations:renderOperations,
  'action-matrix':renderActionMatrix,
  'release-center':renderReleaseCenter,
  'launch-center':renderLaunchCenter,
  'product-dependency-impact':renderDependencyImpact,
  'agentic-control':renderAgenticControl,
  'product-experience':renderProductExperience,
  'infrastructure-governance':renderInfrastructureGovernance,
  'product-identity':renderProductIdentity,
  'user-experience':renderUserExperienceLab,
  'demo-product':renderDemoProduct
};
