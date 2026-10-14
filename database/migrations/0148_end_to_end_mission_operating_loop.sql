-- ON Mission 14.0.0 — End-to-End Mission Operating Loop
-- Adds a tenant-scoped universal mission context envelope. Domain truth remains
-- owned by the canonical mission authority; sector contracts remain authoritative
-- for sector-specific requirements.
ALTER TABLE missions ADD COLUMN mission_context_json TEXT NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS idx_missions_company_sector_country_updated
  ON missions(company_id,sector_code,country_code,updated_at DESC,id DESC);

INSERT OR IGNORE INTO canonical_capability_registry(code,label,domain_code,description)
VALUES('mission_contract','Mission Contract','platform','Universal mission contract projection and validation boundary; never owns mission truth or execution.');

INSERT OR IGNORE INTO canonical_capability_contracts(capability_code,version,purpose,inputs_json,outputs_json,commands_json,queries_json,resource_types_json,preconditions_json,postconditions_json,failure_contract_json,verification_contract_json,recovery_contract_json,observability_json)
VALUES('mission_contract','1','Universal mission contract projection and validation','[]','[]','[]','["read_mission_contract"]','["mission","product","country","sector","resource","capability","policy"]','["canonical_mission_truth","sector_contract_when_execution_ready"]','["universal_contract_projected","sector_specific_contract_preserved"]','{"canonical_unavailable":"503","invalid_contract":"422","tenant_mismatch":"404"}','{"required":"mission_truth_and_sector_contract"}','{"strategy":"rebuild_contract_from_current_truth","automatic_execution":false}','{"mission_id":true,"country_code":true,"sector_code":true,"contract_version":true}');
