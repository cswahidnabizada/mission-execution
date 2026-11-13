-- 16.118.0: align the seeded global package with the resolver's non-overridable security contract.
-- The original seed used descriptive strings for two boolean invariants. The resolver correctly
-- fails closed on mismatches, which made public onboarding classification return HTTP 503.
UPDATE platform_configuration_releases
SET configuration_json = json_set(
  configuration_json,
  '$.security.tenantIsolation', json('true'),
  '$.security.serverSideAuthorization', json('true'),
  '$.security.failClosed', json('true'),
  '$.security.audit', 'append_only',
  '$.security.configurationVersionPinnedToMission', json('true'),
  '$.security.lowerScopesCannotRelaxHigherScopeRestrictions', json('true')
),
updated_at = CURRENT_TIMESTAMP
WHERE scope_type='global' AND scope_key='default' AND lifecycle_status='published'
  AND json_valid(configuration_json)
  AND json_extract(configuration_json,'$.schema')='onmission.platform-package.v1';
