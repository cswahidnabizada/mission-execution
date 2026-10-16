/* ON Mission 10.82.0 — OPERATE surface composition. Observational only. */
import { renderMonitor } from '../monitor.js?v=16.10.41';
import { renderProductHealth, renderSubscriptions, renderBilling, renderExpansionWorkspace, loadSystemHealth } from '../oversight/product-operations.js?v=16.10.41';
import { renderCompanies, renderRoles } from '../oversight/platform-governance.js?v=16.10.41';
import { renderRuntime } from '../oversight/product-factory.js?v=16.10.41';

export const operateSurface = Object.freeze({
  'product-health': renderProductHealth,
  'system-health': loadSystemHealth,
  companies: renderCompanies,
  roles: renderRoles,
  subscriptions: renderSubscriptions,
  billing: renderBilling,
  expansion: renderExpansionWorkspace,
  monitor: renderMonitor,
  runtime: renderRuntime,
});
