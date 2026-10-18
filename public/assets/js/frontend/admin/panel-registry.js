/* ON Mission 10.79.0 — Canonical Admin Panel Registry
 * Single composition point. Workspaces own their implementation; this registry owns only routing composition.
 */
import { setAdminShow, adminPanelRenderers as oversightRenderers, refreshAdminData } from './oversight-panels.js?v=16.10.55';
import { setGovernanceShow, renderDataControl, renderDataEntry, renderTrash } from './data-governance.js?v=16.10.55';
import {renderOperations,renderActionMatrix,renderReleaseCenter,renderLaunchCenter,renderDependencyImpact,renderAgenticControl} from './operating-system.js?v=16.10.55';
import {renderResourceManagement} from './resource-management.js?v=16.10.55';
import {renderUserExperienceLab} from './user-experience-lab.js?v=16.10.55';
import {renderDemoProduct} from './demo-product.js?v=16.10.55';
import {renderProductExperience} from './product-experience.js?v=16.10.55';
import {renderInfrastructureGovernance} from './infrastructure-governance.js?v=16.10.55';
import {renderProductIdentity} from './product-identity.js?v=16.10.55';

let show=null;
export function configureAdminPanelShow(fn){
  if(typeof fn!=='function')throw new TypeError('Canonical admin navigation must be configured before panel composition');
  show=fn;
  setAdminShow(show);
  setGovernanceShow(show);
}

export { refreshAdminData };
function renderLayoutStudioEntry(){
  const host=document.querySelector('#view-layout-studio');
  if(!host)return;
  host.innerHTML=`<div class="eyebrow">GOVERN · EXPERIENCE STUDIO</div>
    <h1 class="title">Layout Studio</h1>
    <p class="sub">The governed workspace for approved page composition, design tokens, responsive preview and release readiness.</p>
    <section class="card section"><div class="eyebrow">CANONICAL EXPERIENCE WORKSPACE</div>
      <h2>Edit the real ON MISSION experience</h2>
      <p class="sub">Open the full-screen Studio to inspect pages, edit approved components, save server-owned drafts and review route certification. Saving a draft does not change production. Publication stays blocked until canonical release verification is complete.</p>
      <div class="actions"><a class="btn primary" href="/layout-studio.html">OPEN LAYOUT STUDIO</a><a class="btn muted" href="/layout-studio.html#routes">PRODUCTION ROUTE CERTIFICATION</a></div>
      <div class="notice">Current release policy: draft and preview only until real production renderer parity, authorization, immutable publication, verification and rollback are certified.</div>
    </section>`;
}
export const adminPanelRenderers={...oversightRenderers,
  'layout-studio':renderLayoutStudioEntry,
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
