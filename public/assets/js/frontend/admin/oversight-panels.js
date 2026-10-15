/* ON Mission 10.82.0 — bounded Control Plane composition facade.
 * This file owns routing composition only. Domain logic belongs to bounded surface modules.
 */
import { setAdminShow, navigate } from './oversight/context.js?v=16.10.31';
import { refreshAdminData } from './oversight/data.js?v=16.10.31';
import { buildSurface } from './surfaces/build.js?v=16.10.31';
import { operateSurface } from './surfaces/monitor.js?v=16.10.31';
import { controlSurface } from './surfaces/control.js?v=16.10.31';
import { governanceSurface } from './surfaces/governance.js?v=16.10.31';
import { operationsSurface } from './surfaces/operations.js?v=16.10.31';
import { renderControlCenter } from './oversight/product-factory.js?v=16.10.31';
import { renderCommandCenter } from './command-center.js?v=16.10.31';
import { $, api, esc, state, ensureStepUp, loadCommandCenter } from './admin-runtime.js?v=16.10.31';

export { setAdminShow, refreshAdminData };

const withNavigation=(renderer)=>()=>renderer({api,esc,state,ensureStepUp,show:navigate});

export const adminPanelRenderers=Object.freeze({
  ...governanceSurface,
  ...buildSurface,
  ...operateSurface,
  ...controlSurface,
  ...operationsSurface,
  // The active shell mounts #view-overview. The legacy control renderer targets #view-control.
  overview: () => renderCommandCenter({ $, state, esc, loadCommandCenter, api, navigate }),
  control: renderControlCenter,
  'product-publisher': withNavigation(buildSurface['product-publisher']),
  'data-catalog': withNavigation(buildSurface['data-catalog']),
  'data-studio': withNavigation(buildSurface['data-studio']),
  certification: withNavigation(controlSurface.certification),
});

// Keep the facade intentionally small: it is a composition boundary, not a feature module.
void $; void state; void api; void esc; void ensureStepUp;
