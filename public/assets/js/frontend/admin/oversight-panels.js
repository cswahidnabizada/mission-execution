/* ON Mission 10.82.0 — bounded Control Plane composition facade.
 * This file owns routing composition only. Domain logic belongs to bounded surface modules.
 */
import { setAdminShow, navigate } from './oversight/context.js?v=16.10.10';
import { refreshAdminData } from './oversight/data.js?v=16.10.10';
import { buildSurface } from './surfaces/build.js?v=16.10.10';
import { operateSurface } from './surfaces/monitor.js?v=16.10.10';
import { controlSurface } from './surfaces/control.js?v=16.10.10';
import { governanceSurface } from './surfaces/governance.js?v=16.10.10';
import { operationsSurface } from './surfaces/operations.js?v=16.10.10';
import { renderControlCenter } from './oversight/product-factory.js?v=16.10.10';
import { $, api, esc, state, ensureStepUp } from './admin-runtime.js?v=16.10.10';

export { setAdminShow, refreshAdminData };

const withNavigation=(renderer)=>()=>renderer({api,esc,state,ensureStepUp,show:navigate});

export const adminPanelRenderers=Object.freeze({
  ...governanceSurface,
  ...buildSurface,
  ...operateSurface,
  ...controlSurface,
  ...operationsSurface,
  control: renderControlCenter,
  'product-publisher': withNavigation(buildSurface['product-publisher']),
  'data-catalog': withNavigation(buildSurface['data-catalog']),
  'data-studio': withNavigation(buildSurface['data-studio']),
  certification: withNavigation(controlSurface.certification),
});

// Keep the facade intentionally small: it is a composition boundary, not a feature module.
void $; void state; void api; void esc; void ensureStepUp;
