-- ON Mission 10.37.9 — Product Configuration Runtime
-- Ensure the classification dependency exists before the governed configuration record is inserted.
INSERT OR IGNORE INTO processing_purposes
(code,label,description,default_legal_basis,data_minimization_rule)
VALUES
('product_configuration','Product configuration','Govern and operate platform product configuration, country launch configuration, eligibility rules and controlled product activation.','legitimate_interests','Store only configuration data necessary to govern and operate the configured product.');

-- Activates the control-plane configuration center as a real runtime input.
INSERT OR IGNORE INTO platform_configuration_versions(configuration_id,domain_code,config_key,version,status,payload_json,effective_at,active,created_by_type,created_by_id,audit_event_id)
VALUES
('capabilities:catalog','capabilities','catalog','1','active','{"enabled":["organization","people","mission","object","resource","relationship","communication","evidence","policy","capability","logistics"]}',CURRENT_TIMESTAMP,1,'system','10.37.9','10.37.9'),
('roles:action_policy','roles','action_policy','1','active','{"actions":{"owner":["create_mission","edit_mission","edit_mission_data","delete_mission","assign_driver","change_driver","share_network","share_foryou","repost_foryou","restart_network","approve_foryou_request","decline_foryou_request"],"admin":["create_mission","edit_mission","edit_mission_data","delete_mission","assign_driver","change_driver","share_network","share_foryou","repost_foryou","restart_network","approve_foryou_request","decline_foryou_request"],"manager":["create_mission","edit_mission","edit_mission_data","assign_driver","change_driver","share_network","share_foryou","repost_foryou","restart_network","approve_foryou_request","decline_foryou_request"],"operator":["edit_mission_data","assign_driver","change_driver","share_network","approve_foryou_request","decline_foryou_request"],"developer":[]}}',CURRENT_TIMESTAMP,1,'system','10.37.9','10.37.9'),
('rendering:product_experience','rendering','product_experience','1','active','{"labels":{"product":"ON Mission","work":"Work","people":"People","objects":"Objects","network":"Network","insights":"Insights"},"show":{"work":true,"network":true,"people":true,"objects":true,"insights":true},"capabilityContext":"adaptive"}',CURRENT_TIMESTAMP,1,'system','10.37.9','10.37.9'),
('guidance:user_journey','guidance','user_journey','1','active','{"organization":{"steps":["Activate your organization","Configure your capabilities","Add people","Create your first mission","Assign responsibility","Execute and complete"]},"executor":{"steps":["Complete your identity","Become ready","Review assigned work","Follow the next action","Record evidence","Complete responsibility"]}}',CURRENT_TIMESTAMP,1,'system','10.37.9','10.37.9'),
('policy:default','policy','default','1','active','{"mode":"policy_driven","denyByDefault":true}',CURRENT_TIMESTAMP,1,'system','10.37.9','10.37.9'),
('mission_rules:intake','mission_rules','intake','1','active','{"mode":"capability_template","defaultCapability":"logistics","requiredCore":["objective","responsibility","schedule"],"logisticsFields":["route","object","vehicle","handling"]}',CURRENT_TIMESTAMP,1,'system','10.37.9','10.37.9');

INSERT OR IGNORE INTO data_classification_registry(table_name,column_name,classification,purpose_code,retention_policy_code,export_allowed,audit_required,jurisdiction_policy_code)
VALUES('platform_configuration_versions','payload_json','INTERNAL','product_configuration','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1');

-- Universal mission intake metadata. Logistics fields remain capability-specific extensions.
ALTER TABLE missions ADD COLUMN capability_code TEXT;
ALTER TABLE missions ADD COLUMN objective TEXT;
ALTER TABLE missions ADD COLUMN responsibility_mode TEXT;
CREATE INDEX IF NOT EXISTS idx_missions_capability ON missions(capability_code,status,updated_at);
