/* ON Mission 10.82.0 — GOVERN / SECURE / PLATFORM surface composition. */
import { renderOverview, renderPolicies, renderConsent, renderNotifications, renderAnalyticsGovernance, renderResidency, renderProviders, renderAudit, renderBackupRecovery, renderRecoveryReconciliation } from '../oversight/platform-governance.js?v=16.98.0';
import { renderCountryDataStudio } from '../oversight/product-studio.js?v=16.98.0';
import { loadVerificationQueue, loadPrivacyRights } from '../oversight/privacy-verification.js?v=16.98.0';
import { renderSecurity, renderConfigDomain } from '../oversight/product-operations.js?v=16.98.0';
import { renderDataEntry, renderDataControl, renderTrash } from '../data-governance.js?v=16.98.0';

export const governanceSurface = Object.freeze({
  overview: renderOverview,
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
  'privacy-rights': loadPrivacyRights,
  'country-data-studio': renderCountryDataStudio,
  'data-entry': renderDataEntry,
  trash: renderTrash,
  'data-control': renderDataControl,
  capabilities: () => renderConfigDomain('capabilities','Capabilities','Platform and domain capability configuration; availability is not authorization.'),
  missions: () => renderConfigDomain('mission_rules','Missions','Mission rules are configuration only; Mission Truth and lifecycle remain authoritative.'),
});
