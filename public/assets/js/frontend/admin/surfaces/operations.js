/* ON Mission 10.82.0 — OPERATIONS support surface composition. */
import { renderProductEcosystem, renderSupportingGovernance } from '../oversight/product-factory.js?v=16.10.62';
import { renderCompanies, renderRoles } from '../oversight/platform-governance.js?v=16.10.62';
import { renderSubscriptions, renderBilling } from '../oversight/product-operations.js?v=16.10.62';

export const operationsSurface = Object.freeze({
  'product-ecosystem': renderProductEcosystem,
  supporting: renderSupportingGovernance,
  companies: renderCompanies,
  roles: renderRoles,
  subscriptions: renderSubscriptions,
  billing: renderBilling,
});
