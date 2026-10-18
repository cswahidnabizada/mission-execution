import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const registry=read('public/assets/js/frontend/admin/workspace-registry.js');
const panel=read('public/assets/js/frontend/admin/panel-registry.js');
const surfaces=[
  read('public/assets/js/frontend/admin/surfaces/build.js'),
  read('public/assets/js/frontend/admin/surfaces/control.js'),
  read('public/assets/js/frontend/admin/surfaces/governance.js'),
  read('public/assets/js/frontend/admin/surfaces/monitor.js'),
  read('public/assets/js/frontend/admin/surfaces/operations.js')
].join('\n');
const shell=read('public/assets/js/frontend/admin/shell.js');
const factory=read('public/assets/js/frontend/admin/oversight/product-factory.js');
const command=read('public/assets/js/frontend/admin/command-palette.js');
const op=read('public/assets/js/frontend/admin/operating-system.js');

const fail=[]; const ok=[];
const assert=(cond,msg)=>cond?(ok.push(msg),true):(fail.push(msg),false);
const groups=[...registry.matchAll(/\{key:'([^']+)',label:'([^']+)'[^]*?items:\[/g)].map(m=>({key:m[1],label:m[2]}));
const items=[...registry.matchAll(/\['([^']+)','([^']+)'/g)].map(m=>({label:m[1],key:m[2]}));
const primaryItems=items.filter(x=>x.key!=='overview'); const keys=primaryItems.map(x=>x.key);

assert(groups.length===8,`eight operating areas present (${groups.length})`);
assert(groups.map(x=>x.key).join(',')==='command,resources,build,release,launch,operate,govern,recover','current operating areas place Resources before Build and preserve the operating journey');
assert(items.length>=30,`primary workspaces remain registered (${items.length})`);
assert(new Set(keys).size===keys.length,'no duplicate primary workspace keys');
assert(registry.includes("ADMIN_PRIMARY_SECTION=Object.freeze([['Command Center','overview']])"),'Command Center is the sole non-group entry point');
assert(keys.every(k=>registry.includes(`'${k}'`)),'all workspace keys have registry entries');

// Composition coverage: every primary workspace must be represented by a renderer composition.
const rendererCoverage={
 operations:panel, 'action-matrix':panel, 'agentic-control':panel, 'system-health':surfaces, 'infrastructure-governance':panel, 'product-identity':panel,
 'resource-management':panel, 'product-publisher':surfaces, countries:surfaces,
 'release-center':panel, 'product-verification':surfaces, verification:surfaces, certification:surfaces, 'product-dependency-impact':panel,
 'launch-center':panel, 'product-health':surfaces,
 companies:surfaces, roles:surfaces, subscriptions:surfaces, billing:surfaces, missions:surfaces, notifications:surfaces,
 'human-platform':surfaces, 'layout-studio':panel, 'product-experience':panel, 'user-experience':panel, 'demo-product':panel, policies:surfaces, consent:surfaces, 'privacy-rights':surfaces, residency:surfaces, providers:surfaces, 'analytics-governance':surfaces, security:surfaces, audit:surfaces,
 'backup-recovery':surfaces, 'recovery-reconciliation':surfaces
};
for(const k of keys) assert(rendererCoverage[k]?.includes(`'${k}'`) || rendererCoverage[k]?.includes(` ${k}:`) || rendererCoverage[k]?.includes(`\n  ${k}:`) || rendererCoverage[k]?.includes(`'${k}':`),`renderer composition exists for ${k}`);

// New layout contract: no legacy cross-area build rail survives inside Product Factory.
assert(!factory.includes("'RUNTIME','current'"),'Product Factory no longer treats Runtime as a build step');
assert(!factory.includes("'DATA CONTROL','current'"),'Product Factory no longer treats Data Control as a build step');
assert(!factory.includes("'TRASH','current'"),'Product Factory no longer treats Trash as a build step');
assert(factory.includes('NEXT OPERATING AREA'),'Product Factory explicitly hands off to the next operating area');
assert(factory.includes('data-publisher-view="release-center"') || factory.includes('data-publisher-view=\\"release-center\\"'),'Product Factory exposes Release handoff');
assert(factory.includes('data-publisher-view="system-health"') || factory.includes('data-publisher-view=\\"system-health\\"'),'Product Factory exposes Command/health handoff');
assert(factory.includes('data-publisher-view="data-control"') || factory.includes('data-publisher-view=\\"data-control\\"'),'Product Factory exposes Recover/data-control handoff');

// Shell contract: the seven areas are primary; old top-level labels are not rendered as navigation groups.
assert(shell.includes('Super Admin operating model'),'new operating-model shell is active');
assert(shell.includes('workspaceGroups.map(renderPrimary)'),'primary navigation is driven by canonical workspace registry');
assert(shell.includes('sa-primary-nav'),'seven-job primary navigation is rendered');
assert(!/sa-primary[^\n]*SECURE|sa-primary[^\n]*PLATFORM/.test(shell),'SECURE/PLATFORM are not primary navigation groups');

// Command / query journey surfaces.
assert(command.includes('Workspaces + platform resources'),'Command Palette searches workspaces and resources');
assert(command.includes('/api/platform/admin/resource-search'),'resource search uses the canonical Control Plane query projection');
assert(command.includes('openResourceExplorer'),'resource inspection opens the unified Resource Explorer');
assert(command.includes('Canonical authority owns every mutation'),'resource explorer preserves canonical mutation boundary');
assert(op.includes('OPERATION JOURNAL'),'administrative operation journal is present');
assert(op.includes('PLATFORM HISTORY'),'platform history/evidence projection is present');

// Authority safety contract.
assert(factory.includes('canonical authorities remain the owners of truth and mutations') || factory.includes('canonical authorities') && factory.includes('remain separate authorities'),'Product Factory preserves authority boundary');
assert(op.includes('canonical service') && op.includes('read-only projection'),'Operations surface preserves authority boundary');
assert(command.includes('Canonical authority owns every mutation'),'Command Palette preserves mutation boundary');

if(fail.length){
 console.error(`11.04.1 Super Admin workflow certification: FAIL (${fail.length})`);
 for(const x of fail) console.error(`- ${x}`);
 process.exit(1);
}
console.log(`11.04.1 Super Admin workflow certification: PASS (${ok.length} checks)`);
