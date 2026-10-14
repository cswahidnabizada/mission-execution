import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const must=(file,patterns)=>{const s=fs.readFileSync(path.join(root,file),'utf8');for(const [label,re] of patterns){if(!re.test(s))throw new Error(`${file}: missing ${label}`)}};
must('database/migrations/0076_compliance_evidence_control_plane.sql',[["evidence registry",/CREATE TABLE IF NOT EXISTS compliance_evidence_registry/],["control code",/control_code TEXT NOT NULL/],["metadata",/metadata TEXT/],["tenant scope",/company_id INTEGER/],["retention",/retention_policy_code/]]);
must('src/worker/modules/admin-control/admin-control.service.js',[["read evidence",/export async function getComplianceEvidence/],["record evidence",/export async function recordComplianceEvidence/],["registry",/compliance_evidence_registry/]]);
must('src/worker/modules/admin-control/admin-control.routes.js',[["GET route",/api\/platform\/admin\/compliance-evidence/],["POST route",/recordComplianceEvidence/]]);
must('public/assets/js/frontend/admin/admin.js',[["renderer",/Compliance evidence/],["coverage",/Control coverage/],["refresh",/complianceEvidence/]]);
console.log('10.35.8 compliance evidence / control plane contract: PASS');
