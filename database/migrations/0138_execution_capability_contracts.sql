-- ON Mission 12.8.0 — Execution Integrity + Capability Contract Foundation
-- Contract metadata only. Canonical domain authorities remain the owners of truth.

CREATE TABLE IF NOT EXISTS canonical_capability_contracts (
  capability_code TEXT PRIMARY KEY,
  version TEXT NOT NULL DEFAULT '1',
  purpose TEXT NOT NULL,
  inputs_json TEXT NOT NULL DEFAULT '[]',
  outputs_json TEXT NOT NULL DEFAULT '[]',
  commands_json TEXT NOT NULL DEFAULT '[]',
  queries_json TEXT NOT NULL DEFAULT '[]',
  resource_types_json TEXT NOT NULL DEFAULT '[]',
  risk_class TEXT NOT NULL DEFAULT 'medium' CHECK(risk_class IN ('low','medium','high','critical')),
  tenant_scope TEXT NOT NULL DEFAULT 'tenant',
  side_effects_json TEXT NOT NULL DEFAULT '[]',
  dependencies_json TEXT NOT NULL DEFAULT '[]',
  preconditions_json TEXT NOT NULL DEFAULT '[]',
  postconditions_json TEXT NOT NULL DEFAULT '[]',
  failure_contract_json TEXT NOT NULL DEFAULT '{}',
  verification_contract_json TEXT NOT NULL DEFAULT '{}',
  recovery_contract_json TEXT NOT NULL DEFAULT '{}',
  health_contract_json TEXT NOT NULL DEFAULT '{}',
  observability_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','planned','retired')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(capability_code) REFERENCES canonical_capability_registry(code)
);
CREATE INDEX IF NOT EXISTS idx_capability_contract_status ON canonical_capability_contracts(status,capability_code);

ALTER TABLE platform_control_plane_resource_contracts ADD COLUMN owner_capability TEXT;
ALTER TABLE platform_control_plane_resource_contracts ADD COLUMN risk_class TEXT NOT NULL DEFAULT 'medium';
ALTER TABLE platform_control_plane_resource_contracts ADD COLUMN step_up_required INTEGER NOT NULL DEFAULT 0;
ALTER TABLE platform_control_plane_resource_contracts ADD COLUMN identity_rule TEXT;
ALTER TABLE platform_control_plane_resource_contracts ADD COLUMN lifecycle_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE platform_control_plane_resource_contracts ADD COLUMN provenance_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE platform_control_plane_resource_contracts ADD COLUMN consumer_scope_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE platform_control_plane_resource_contracts ADD COLUMN version TEXT NOT NULL DEFAULT '1';
CREATE INDEX IF NOT EXISTS idx_cp_resource_contract_owner ON platform_control_plane_resource_contracts(owner_capability,resource_type);

INSERT OR IGNORE INTO canonical_capability_registry(code,label,domain_code,description) VALUES
('mission_intake','Mission Intake','platform','Transforms a user objective into a governed mission request without becoming mission truth.'),
('mission_truth','Mission Truth','platform','Owns canonical mission state, lifecycle and authoritative mission transitions.'),
('situation_intelligence','Situation Intelligence','platform','Builds an evidence-backed representation of the current mission situation.'),
('responsibility','Responsibility','platform','Determines the authorized responsible party or capability for the next mission step.'),
('readiness','Readiness','platform','Determines whether a mission/action can safely proceed under current truth and constraints.'),
('planning','Planning','platform','Produces a governed candidate plan from current truth, situation, constraints and resources.'),
('authorization','Authorization','platform','Determines whether an actor/action is allowed, denied, deferred or requires step-up.'),
('execution','Execution','platform','Executes an authorized action attempt and records execution state without owning unrelated domain truth.'),
('provider_integration','Provider Integration','platform','Adapts governed execution to approved external providers and records external operation evidence.'),
('verification','Verification','platform','Determines whether the intended effect actually occurred using canonical and external evidence.'),
('recovery','Recovery','platform','Resolves failed, unknown or divergent execution states without treating uncertainty as success.'),
('outcome','Outcome','platform','Records verified execution outcomes and mission results.'),
('learning','Learning','platform','Derives bounded learning signals from recorded outcomes without changing authorization or truth.'),
('communication','Communication','platform','Delivers authorized mission and operational communication.'),
('resource_governance','Resource Governance','platform','Governs platform resources through resource contracts while preserving domain ownership.'),
('platform_control','Platform Control','platform','Provides Super Admin governance, monitoring, audit and control over platform resources and capabilities.');

INSERT OR IGNORE INTO canonical_capability_contracts
(capability_code,version,purpose,inputs_json,outputs_json,commands_json,queries_json,resource_types_json,risk_class,tenant_scope,side_effects_json,dependencies_json,preconditions_json,postconditions_json,failure_contract_json,verification_contract_json,recovery_contract_json,health_contract_json,observability_json)
VALUES
('mission_intake','1','Transforms an objective into a governed mission request','["objective","actor","context"]','["mission_request","normalized_intent"]','["create_mission_request"]','["read_intake_context"]','["mission"]','medium','tenant','["mission_request"]','["identity","organization"]','["authenticated_actor","tenant_scope"]','["mission_request_recorded"]','{"unknown":"reject","canonical_unavailable":"503"}','{"required":"request_persisted"}','{"strategy":"reopen_or_escalate"}','{"required":"authority_available"}','{"audit":true,"request_id":true}'),
('mission_truth','1','Owns canonical mission state and lifecycle','["mission","transition","state_token"]','["canonical_mission","transition_result"]','["transition_mission","cancel_mission"]','["read_mission"]','["mission","assignment"]','critical','tenant','["mission_state"]','["policy","responsibility","liveness"]','["valid_state_token","authorized_transition"]','["single_canonical_state"]','{"stale":"409","canonical_unavailable":"503"}','{"required":"transition_event"}','{"strategy":"reconcile_or_escalate"}','{"required":"authority_available"}','{"audit":true,"transition_event":true}'),
('situation_intelligence','1','Builds an evidence-backed current situation','["mission","evidence","resources"]','["situation","confidence"]','[]','["read_situation"]','["mission","evidence","resource"]','medium','tenant','[]','["mission_truth","evidence","resource"]','["canonical_reads_available"]','["evidence_backed_situation"]','{"canonical_unavailable":"503","optional":"degraded"}','{"required":"source_provenance"}','{"strategy":"refresh"}','{"required":"read_dependencies"}','{"sources":true,"confidence":true}'),
('responsibility','1','Determines authorized execution responsibility','["mission","actors","assignments","policy"]','["responsibility"]','["assign_responsibility","reclaim_responsibility"]','["read_responsibility"]','["mission","people","resource"]','high','tenant','["assignment"]','["mission_truth","authorization"]','["single_owner_or_explicit_shared_scope"]','["responsibility_recorded"]','{"conflict":"409","canonical_unavailable":"503"}','{"required":"assignment_evidence"}','{"strategy":"reconcile"}','{"required":"assignment_authority"}','{"audit":true}'),
('readiness','1','Determines whether execution can safely proceed','["mission","situation","responsibility","policy","resources"]','["readiness","blockers","warnings"]','[]','["evaluate_readiness"]','["mission","resource","policy"]','high','tenant','[]','["mission_truth","policy","responsibility","resource"]','["canonical_dependencies_readable"]','["explicit_ready_or_blocked"]','{"canonical_unavailable":"AUTHORITY_UNAVAILABLE"}','{"required":"dependency_status"}','{"strategy":"re-evaluate"}','{"required":"dependency_health"}','{"blockers":true,"dependencies":true}'),
('planning','1','Produces a governed candidate next-action plan','["mission","situation","constraints","resources"]','["plan","candidate_actions","risk","confidence"]','["create_plan"]','["read_plan_context"]','["mission","resource","capability","policy"]','high','tenant','[]','["mission_truth","situation","readiness"]','["current_truth","readiness"]','["plan_is_non_authoritative"]','{"stale":"409","canonical_unavailable":"503"}','{"required":"plan_context_hash"}','{"strategy":"replan"}','{"required":"planner_health"}','{"plan_hash":true,"confidence":true}'),
('authorization','1','Evaluates whether an action is permitted','["actor","mission","action","policy","risk"]','["ALLOW","DENY","DEFER","STEP_UP_REQUIRED"]','["authorize_action","step_up"]','["read_policy"]','["mission","policy","resource"]','critical','tenant','["authorization_decision"]','["identity","policy","mission_truth"]','["fresh_policy","actor_context"]','["immutable_decision"]','{"deny":"403","step_up":"423","canonical_unavailable":"503"}','{"required":"decision_record"}','{"strategy":"re-evaluate"}','{"required":"policy_authority"}','{"decision_id":true,"policy_hash":true}'),
('execution','1','Executes an authorized action attempt','["authorized_command","execution_context"]','["attempt","execution_status","observed_effect"]','["execute_action","resume_attempt"]','["read_execution_attempt"]','["mission","execution_attempt","resource"]','critical','tenant','["external_or_internal_effect"]','["authorization","mission_truth","provider_integration"]','["ALLOW","idempotency_key","current_truth"]','["explicit_attempt_state"]','{"unknown":"UNRESOLVED","canonical_unavailable":"503"}','{"required":"attempt_and_effect_evidence"}','{"strategy":"never_auto_retry_unknown_without_verification"}','{"required":"execution_authority"}','{"attempt_id":true,"phase":true}'),
('provider_integration','1','Executes and verifies approved external provider operations','["execution_attempt","provider_capability","payload"]','["provider_operation","provider_evidence"]','["dispatch_provider","verify_provider"]','["read_provider_capability"]','["provider","execution_attempt"]','critical','tenant','["external_side_effect"]','["provider_governance","execution"]','["approved_provider","idempotency_key","data_policy"]','["operation_id_or_unknown"]','{"timeout":"UNKNOWN","provider_failure":"FAILED","verification_unknown":"UNKNOWN"}','{"required":"provider_operation_id","verification":"required"}','{"strategy":"reconcile_before_retry"}','{"required":"provider_health"}','{"provider_event":true,"request_hash":true}'),
('verification','1','Verifies intended effects against evidence','["execution_attempt","expected_effect","canonical_truth","provider_evidence"]','["VERIFIED","FAILED","UNKNOWN","RECOVERY_REQUIRED"]','["verify_effect"]','["read_verification_evidence"]','["execution_attempt","mission","evidence"]','critical','tenant','[]','["execution","mission_truth","provider_integration","evidence"]','["evidence_available"]','["explicit_verification_state"]','{"missing_evidence":"UNKNOWN","conflict":"RECOVERY_REQUIRED"}','{"required":"evidence_chain"}','{"strategy":"reconcile_or_escalate"}','{"required":"evidence_authority"}','{"evidence_refs":true}'),
('recovery','1','Resolves failed, unknown or divergent execution','["attempt","truth","evidence","provider_state"]','["REASSESS","RETRY_CANDIDATE","COMPENSATE","ESCALATE","RECOVERED"]','["recover_execution","reconcile_execution"]','["read_recovery_state"]','["execution_attempt","mission","provider"]','critical','tenant','["recovery_event"]','["verification","mission_truth","provider_integration"]','["explicit_unresolved_state"]','["recovery_decision_recorded"]','{"unknown":"no_automatic_success","conflict":"human_or_policy_review"}','{"required":"recovery_evidence"}','{"strategy":"reconcile_provider_and_truth"}','{"required":"recovery_authority"}','{"recovery_event":true}'),
('outcome','1','Records verified mission outcomes','["execution","verification","mission"]','["outcome"]','["record_outcome"]','["read_outcome"]','["mission","evidence"]','medium','tenant','["outcome_record"]','["mission_truth","verification"]','["execution_result"]','["immutable_outcome"]','{"recording_failure":"EXPLICIT_UNRECORDED"}','{"required":"source_execution"}','{"strategy":"reconcile_recording"}','{"required":"outcome_ledger"}','{"event_hash":true}'),
('learning','1','Derives bounded learning signals from outcomes','["outcomes","observations"]','["learning_observation"]','["record_learning"]','["read_learning_sources"]','["outcome"]','low','tenant','["derived_learning"]','["outcome"]','["verified_or_resolved_outcome"]','["derived_only_learning"]','{"source_unavailable":"DEGRADED"}','{"required":"source_outcome"}','{"strategy":"defer"}','{"required":"learning_pipeline"}','{"derived_only":true}'),
('communication','1','Delivers authorized operational communication','["message","recipient","mission_context"]','["delivery_status"]','["send_message"]','["read_delivery"]','["mission","people","communication"]','medium','tenant','["communication"]','["identity","policy","mission_truth"]','["authorized_recipient"]','["delivery_evidence"]','{"provider_failure":"FAILED","unknown":"UNKNOWN"}','{"required":"delivery_receipt_when_supported"}','{"strategy":"retry_with_idempotency"}','{"required":"channel_health"}','{"delivery_id":true}'),
('resource_governance','1','Governs resources without owning domain truth','["resource_contract","actor","resource"]','["resource_projection","governance_result"]','["create_resource","configure_resource","activate_resource","deactivate_resource","observe_resource"]','["read_resource","read_dependencies"]','["resource"]','high','platform','["resource_governance_metadata"]','["platform_control","owning_capability"]','["resource_contract","owner_capability"]','["governed_resource"]','{"owner_unavailable":"AUTHORITY_UNAVAILABLE","policy":"BLOCKED"}','{"required":"owner_authority"}','{"strategy":"defer_to_owner"}','{"required":"owner_health"}','{"authority":true,"provenance":true}'),
('platform_control','1','Governs platform resources, capabilities and operational controls','["actor","resource","governance_contract"]','["governance_result","audit_evidence"]','["govern","monitor","recover","audit"]','["read_platform_resource","read_health"]','["resource","capability","policy","provider"]','critical','platform','["governance_state","audit"]','["resource_governance","policy","security"]','["platform_super_admin","step_up_when_required"]','["auditable_governance_decision"]','{"unauthorized":"403","step_up":"423","authority_unavailable":"503"}','{"required":"audit_evidence"}','{"strategy":"platform_reconciliation"}','{"required":"control_plane_health"}','{"audit":true,"actor":true,"request_id":true}');

-- Establish the resource contract metadata for the highest-risk platform resources.
INSERT OR IGNORE INTO platform_control_plane_resource_contracts(resource_type,resource_key,label,authority_code,governance_version,metadata_json,owner_capability,risk_class,step_up_required,identity_rule,lifecycle_json,provenance_json,consumer_scope_json,version)
VALUES
('capability','*','Canonical capabilities','canonical_capability_registry','12.8.0','{"contract":"capability"}','platform_control','critical',1,'code','{"states":["active","planned","retired"]}','{"source":"platform_control"}','{"scope":"platform"}','1'),
('provider','*','External providers','external_provider_registry','12.8.0','{"contract":"provider"}','provider_integration','critical',1,'provider.code','{"states":["pending_review","configured","approved","blocked"]}','{"source":"platform_control"}','{"scope":"tenant_or_platform"}','1'),
('policy','*','Governance policies','policy_authority','12.8.0','{"contract":"policy"}','authorization','critical',1,'policy.identity','{"states":["draft","active","retired"]}','{"source":"platform_control"}','{"scope":"platform_or_tenant"}','1'),
('configuration','*','Platform configuration','platform_configuration','12.8.0','{"contract":"configuration"}','platform_control','high',1,'domain_code:config_key:version','{"states":["draft","active","retired"]}','{"source":"platform_control"}','{"scope":"platform"}','1');

INSERT OR IGNORE INTO data_classification_registry(table_name,column_name,classification,purpose_code,retention_policy_code,export_allowed,audit_required,jurisdiction_policy_code)
VALUES
('canonical_capability_contracts','purpose','INTERNAL','compliance','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1'),
('canonical_capability_contracts','failure_contract_json','INTERNAL','compliance','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1'),
('platform_control_plane_resource_contracts','metadata_json','INTERNAL','compliance','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1');
