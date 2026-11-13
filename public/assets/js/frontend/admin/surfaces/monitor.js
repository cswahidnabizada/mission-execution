/* ON Mission 10.82.0 — OPERATE surface composition. Observational only. */
import { renderMonitor } from '../monitor.js?v=16.118.0';
import { renderSubscriptions, renderBilling, renderExpansionWorkspace, loadSystemHealth } from '../oversight/product-operations.js?v=16.118.0';
import { renderCompanies, renderRoles } from '../oversight/platform-governance.js?v=16.118.0';
import { renderRuntime } from '../oversight/product-factory.js?v=16.118.0';

export const operateSurface = Object.freeze({
  'system-health': loadSystemHealth,
  companies: renderCompanies,
  roles: renderRoles,
  subscriptions: renderSubscriptions,
  billing: renderBilling,
  expansion: renderExpansionWorkspace,
  monitor: renderMonitor,
  runtime: renderRuntime,
});
