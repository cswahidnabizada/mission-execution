-- ON Mission 13.2.0 — Capability + Resource Contract Operationalization
-- Contract metadata only. No new authority is introduced.

UPDATE canonical_capability_contracts
SET version='3',
    commands_json='["execute_action","resume_attempt","record_execution_intent","commit_verified_effect"]',
    preconditions_json='["authorized_action","state_token_current","capability_command_contracted","required_resources_contracted"]',
    postconditions_json='["explicit_attempt_state","execution_intent_recorded","canonical_effect_committed_only_after_verified_external_effect"]',
    failure_contract_json='{"contract_unavailable":"503","command_not_contracted":"409","resource_contract_unavailable":"503","resource_consumer_not_contracted":"403"}',
    verification_contract_json='{"required":"intent_and_effect_evidence","external":"provider_verification_before_effect_commit"}',
    recovery_contract_json='{"strategy":"reconcile_intent_provider_and_truth","unknown":"remain_unresolved"}',
    observability_json='{"attempt_id":true,"intent_id":true,"phase":true,"provider_operation_id":true,"contract_gateway_version":true}'
WHERE capability_code='execution';

UPDATE canonical_capability_contracts
SET version='3',
    preconditions_json='["approved_provider","provider_resource_contract","capability_command_contracted"]',
    postconditions_json='["operation_id_or_unknown","provider_evidence_recorded"]',
    failure_contract_json='{"contract_unavailable":"503","resource_not_contracted":"403","provider_failure":"FAILED","unknown":"UNKNOWN"}',
    observability_json='{"provider_event":true,"request_hash":true,"intent_id":true,"operation_id":true,"contract_gateway_version":true}'
WHERE capability_code='provider_integration';

UPDATE canonical_capability_contracts
SET version='3',
    preconditions_json='["intent_exists","provider_evidence_or_internal_effect_evidence","capability_command_contracted"]',
    failure_contract_json='{"contract_unavailable":"503","missing_evidence":"UNKNOWN","conflict":"RECOVERY_REQUIRED"}',
    observability_json='{"evidence_refs":true,"intent_id":true,"contract_gateway_version":true}'
WHERE capability_code='verification';

UPDATE canonical_capability_contracts
SET version='3',
    preconditions_json='["explicit_unresolved_state","capability_command_contracted"]',
    failure_contract_json='{"contract_unavailable":"503","unknown":"no_automatic_success","conflict":"human_or_policy_review"}',
    recovery_contract_json='{"strategy":"reconcile_intent_provider_and_truth","never_auto_retry_unknown_without_verification":true,"fresh_authorization_required_for_retry":true}',
    observability_json='{"recovery_event":true,"intent_id":true,"provider_operation_id":true,"contract_gateway_version":true}'
WHERE capability_code='recovery';

UPDATE canonical_capability_contracts
SET version='2',
    failure_contract_json='{"owner_unavailable":"503","resource_contract_unavailable":"503","consumer_not_contracted":"403","policy":"BLOCKED"}',
    verification_contract_json='{"required":"owner_authority","resource_contract":"required"}',
    observability_json='{"authority":true,"provenance":true,"contract_gateway_version":true}'
WHERE capability_code='resource_governance';

UPDATE platform_control_plane_resource_contracts
SET consumer_scope_json='{"scope":"platform","capabilities":["platform_control","resource_governance","execution","provider_integration","verification","recovery"]}',
    version='2'
WHERE resource_type='provider' AND resource_key='*';

UPDATE platform_control_plane_resource_contracts
SET consumer_scope_json='{"scope":"platform","capabilities":["platform_control","resource_governance","authorization","planning","readiness","mission_intake","execution","verification","recovery"]}',
    version='2'
WHERE resource_type='policy' AND resource_key='*';

UPDATE platform_control_plane_resource_contracts
SET consumer_scope_json='{"scope":"platform","capabilities":["platform_control","resource_governance","planning","readiness","execution","provider_integration","verification"]}',
    version='2'
WHERE resource_type='configuration' AND resource_key='*';

UPDATE platform_control_plane_resource_contracts
SET consumer_scope_json='{"scope":"platform","capabilities":["platform_control","resource_governance","planning","situation_intelligence","mission_intake","readiness"]}',
    version='2'
WHERE resource_type='capability' AND resource_key='*';
