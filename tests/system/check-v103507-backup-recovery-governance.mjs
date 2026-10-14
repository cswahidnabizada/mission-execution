import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const must=(file,patterns)=>{const s=fs.readFileSync(path.join(root,file),'utf8');for(const [label,re] of patterns){if(!re.test(s))throw new Error(`${file}: missing ${label}`)}};
must('database/migrations/0075_backup_recovery_governance.sql',[
 ['backup registry',/CREATE TABLE IF NOT EXISTS backup_registry/],['recovery points',/CREATE TABLE IF NOT EXISTS backup_recovery_points/],['restore requests',/CREATE TABLE IF NOT EXISTS backup_restore_requests/],['reconciliation',/CREATE TABLE IF NOT EXISTS backup_reconciliation_events/],['backup purpose',/backup_recovery/],['retention',/DE_BACKUP_DEFAULT/],['provider',/d1_managed_backup/],['security classification',/SECURITY_SENSITIVE/],['legal hold',/legal_hold_propagation/],['encryption',/encryption_status/],['restore authorization',/restore_authorization_scope/]
]);
must('src/worker/security/backup-recovery-governance.service.js',[
 ['version',/BACKUP_RECOVERY_GOVERNANCE_VERSION='10\.35\.7'/],['provider governance',/resolveExternalProviderGovernance/],['restore authorization',/BACKUP_RESTORE_AUTHORIZATION_REQUIRED/],['integrity gate',/BACKUP_RECOVERY_POINT_NOT_VERIFIED/],['expiry gate',/BACKUP_RECOVERY_POINT_EXPIRED/],['reconciliation',/reconcileBackupRecoveryPoint/]
]);
must('src/worker/security/external-provider-governance.service.js',[['backup purpose',/backup_recovery/],['multi scope',/policyScopes/]]);
must('src/worker/modules/admin-control/admin-control.routes.js',[['governance route',/backup-recovery-governance/],['restore route',/restore-requests/],['reconciliation route',/reconciliation/]]);
must('public/assets/js/frontend/admin/admin.js',[['nav',/Backup & Recovery/],['renderer',/function renderBackupRecovery/],['refresh',/backupRecoveryGovernance/]]);
console.log('10.35.7 backup & recovery governance contract: PASS');
