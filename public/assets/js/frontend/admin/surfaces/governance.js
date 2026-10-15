/* ON Mission 10.82.0 — GOVERN / SECURE / PLATFORM surface composition. */
import { renderOverview, renderCountries, renderPolicies, renderConsent, renderNotifications, renderAnalyticsGovernance, renderResidency, renderProviders, renderAudit, renderBackupRecovery, renderRecoveryReconciliation } from '../oversight/platform-governance.js?v=16.10.14';
import { renderProductStudio, renderCountryDataStudio } from '../oversight/product-studio.js?v=16.10.14';
import { renderProductVerification, loadVerificationQueue, loadPrivacyRights } from '../oversight/privacy-verification.js?v=16.10.14';
import { renderSecurity, renderConfigDomain } from '../oversight/product-operations.js?v=16.10.14';
import { renderDataEntry, renderDataControl, renderTrash } from '../data-governance.js?v=16.10.14';

export const governanceSurface = Object.freeze({
  overview: renderOverview,
  countries: renderCountries,
  policies: renderPolicies,
  consent: renderConsent,
  notifications: renderNotifications,
  'analytics-governance': renderAnalyticsGovernance,
  residency: renderResidency,
  providers: renderProviders,
  audit: renderAudit,
  'backup-recovery': renderBackupRecovery,
  'recovery-reconciliation': renderRecoveryReconciliation,
  security: renderSecurity,
  verification: loadVerificationQueue,
  'product-verification': renderProductVerification,
  'privacy-rights': loadPrivacyRights,
  'country-data-studio': renderCountryDataStudio,
  'data-entry': renderDataEntry,
  trash: renderTrash,
  'data-control': renderDataControl,
  capabilities: () => renderConfigDomain('capabilities','Capabilities','Platform and domain capability configuration; availability is not authorization.'),
  missions: () => renderConfigDomain('mission_rules','Missions','Mission rules are configuration only; Mission Truth and lifecycle remain authoritative.'),
});
