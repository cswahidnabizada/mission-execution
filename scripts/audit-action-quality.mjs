import fs from 'node:fs';
import path from 'node:path';
import {ACTION_REGISTRY,ACTION_COMPATIBILITY_ALIASES} from '../src/worker/extensions/actions-intelligence/action-registry.js';
import {ACTION_SERVICE_MAP} from '../src/worker/extensions/actions-intelligence/action-service-map.js';
import {auditActionQuality,actionQualitySummary} from '../src/worker/extensions/actions-intelligence/action-quality-contract.js';

const root=process.cwd();
const files=[];
function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())walk(p);else if(e.isFile()&&/\.(js|mjs)$/.test(p))files.push(p);}}
walk(path.join(root,'public/assets/js')); walk(path.join(root,'src'));
const source=files.map(f=>({file:path.relative(root,f),text:fs.readFileSync(f,'utf8')}));
const codes=Object.keys(ACTION_REGISTRY);
const usage=Object.fromEntries(codes.map(code=>[code,source.filter(f=>new RegExp(`(?<![A-Za-z0-9_])${code.replace(/[.*+?^${}()|[\\]\\]/g,'\\$&')}(?![A-Za-z0-9_])`).test(f.text)).map(f=>f.file)]));
const summary=actionQualitySummary();
const problems=auditActionQuality();
const lines=[];
lines.push('# ON Mission 10.30.38 — Canonical Action Quality & Execution Intelligence Audit','');
lines.push('## Executive result',`- Canonical actions: **${summary.canonicalActions}**`,`- High-consequence actions: **${summary.highConsequence}**`,`- Mutation actions: **${summary.mutations}**`,`- Read-only actions: **${summary.readOnly}**`,`- Service routes: **${summary.serviceRoutes}**`,`- Compatibility aliases: **${summary.compatibilityAliases}**`,`- Contract problems: **${problems.length}**`,'');
lines.push('## Action quality matrix','');
lines.push('| Action | Domain | Risk class | Roles | Preconditions | State transition | Evidence | Stale protection | Service | Consumers |');
lines.push('|---|---|---|---|---|---|---|---|---|---|');
for(const code of codes){const a=ACTION_REGISTRY[code], q=a.quality, pre=[];if(a.requiresMission)pre.push('mission');if(a.requiredStatus)pre.push(`status=${a.requiredStatus}`);if(a.requiresInvitation)pre.push('invitation');if(a.requiresRequest)pre.push('request');if(a.requiresOpenException)pre.push('open_exception');if(q?.stateTransition)pre.push('transition-valid');lines.push(`| \`${code}\` | ${a.domain} | ${q.executionClass} | ${(a.roles||[]).join(', ')} | ${pre.join(', ')||'context'} | ${q.stateTransition?`${q.stateTransition.from.join(' / ')} → ${q.stateTransition.to}`:'none/direct'} | ${q.evidence} | ${q.concurrency} | ${ACTION_SERVICE_MAP[code]?'mapped':'MISSING'} | ${usage[code].length} |`)}
lines.push('');
lines.push('## Removed canonical duplicates','',...Object.entries(ACTION_COMPATIBILITY_ALIASES).map(([alias,target])=>`- \`${alias}\` → compatibility alias for canonical \`${target}\`; no separate business implementation remains.`),'');
lines.push('## Recommendations','',
'- Keep read-only navigation/review interactions out of mutation contracts.',
'- Keep high-consequence actions behind explicit server-side authorization, state-token/concurrency checks, and contextual confirmation.',
'- Add new business actions only when an existing action cannot express the required business transition; do not create UI-only aliases as canonical identities.',
'- Future candidates such as custody review or execution-channel selection should remain presentation/intelligence concepts until an authoritative business transition or service contract is proven.',
'- Preserve the Action Registry as WHAT, Service Map as WHERE, secured services as WHETHER, and canonical truth/events as the resulting state.',
'');
lines.push('## Status',problems.length?'**FAIL** — quality contract requires correction before release protection.':'**PASS** — all canonical actions satisfy the 10.30.38 quality contract.');
console.log(lines.join('\n'));
console.log(`Action Quality audit: ${problems.length?'FAIL':'PASS'} — ${summary.canonicalActions} canonical actions, ${summary.serviceRoutes} routes, ${summary.highConsequence} high-consequence, ${summary.mutations} mutations, ${summary.readOnly} read-only, ${summary.compatibilityAliases} compatibility aliases.`);
