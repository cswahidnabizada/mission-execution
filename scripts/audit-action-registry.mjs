import fs from 'node:fs';
import path from 'node:path';
import {ACTION_REGISTRY} from '../src/worker/extensions/actions-intelligence/action-registry.js';
import {ACTION_SERVICE_MAP} from '../src/worker/extensions/actions-intelligence/action-service-map.js';
import {auditActionRegistry} from '../src/worker/extensions/actions-intelligence/action-registry-audit.js';

const root=process.cwd();
const scanRoots=['public/assets/js','src'];
const files=[];
function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())walk(p);else if(e.isFile()&&p.endsWith('.js'))files.push(p);}}
for(const d of scanRoots)walk(path.join(root,d));
const source=files.map(f=>({file:path.relative(root,f),text:fs.readFileSync(f,'utf8')}));
const canonical=Object.keys(ACTION_REGISTRY);
const usage={};
for(const code of canonical){const re=new RegExp(`(?<![A-Za-z0-9_])${code.replace(/[.*+?^${}()|[\\]\\]/g,'\\$&')}(?![A-Za-z0-9_])`,'g');const hits=[];for(const f of source){const n=(f.text.match(re)||[]).length;if(n)hits.push({file:f.file,count:n});}usage[code]=hits;}
const attributeValues=new Set();
for(const f of source){for(const m of f.text.matchAll(/data-[A-Za-z0-9_-]*action\s*=\s*["']([^"']+)["']/g)){const v=m[1];if(/^[a-z][a-z0-9_:-]+$/.test(v))attributeValues.add(v);}}
const nonCanonical=[...attributeValues].filter(v=>!ACTION_REGISTRY[v]).sort();
const problems=auditActionRegistry();
const multiSurface=canonical.filter(c=>new Set((usage[c]||[]).map(x=>x.file.replace(/^public\/assets\/js\/extensions\/[^/]+$/,'public/assets/js/extensions'))).size>1);
const lines=[];
lines.push('# ON Mission 10.30.38 — Canonical Action Registry Audit');
lines.push('');
lines.push('## Executive result');
lines.push(`- Canonical business actions registered: **${canonical.length}**`);
lines.push(`- Service-map entries: **${Object.keys(ACTION_SERVICE_MAP).length}**`);
lines.push(`- Registry contract problems: **${problems.length}**`);
lines.push(`- Registered actions referenced across source: **${canonical.filter(c=>usage[c].length).length}/${canonical.length}**`);
lines.push(`- Multi-file action consumers (expected shared reuse, not duplicate implementations): **${multiSurface.length}**`);
lines.push(`- Unregistered action-like DOM values found: **${nonCanonical.length}**`);
lines.push('');
lines.push('## Canonical registry');
lines.push('');
lines.push('| Action identity | Domain | Roles | Service route | Confirmation | Lifecycle | Consumers |');
lines.push('|---|---|---|---|---|---|---|');
for(const code of canonical){const d=ACTION_REGISTRY[code];const consumers=usage[code].map(x=>`${x.file} (${x.count})`).join('<br>')||'—';lines.push(`| \`${code}\` | ${d.domain} | ${(d.roles||[]).join(', ')||'—'} | ${ACTION_SERVICE_MAP[code]?'YES':'NO'} | ${d.confirmation?'YES':'NO'} | ${d.lifecycle||'ACTIVE'} | ${consumers} |`);}
lines.push('');
lines.push('## Unregistered action-like UI values');
lines.push('');
lines.push(nonCanonical.length?nonCanonical.map(x=>`- \`${x}\` — classified as a UI/form/legacy interaction candidate; it is not silently promoted to a canonical business action.`).join('\n'):'None detected.');
lines.push('');
lines.push('## Migration rule');
lines.push('');
lines.push('Canonical business actions are invoked by stable action identity. Presentation surfaces may discover or display an action, but they must route to the canonical Mission Context/action execution path and never create a competing business transition. Authorization, custody, truth, lifecycle, event emission and reconciliation remain authoritative in secured services.');
lines.push('');
lines.push('## Audit status');
lines.push('');
lines.push(problems.length?'**FAIL** — registry contract requires correction before protection.':'**PASS** — registry identities and service routes are complete.');
console.log(lines.join('\n'));
console.log(`Action Registry audit: ${problems.length?'FAIL':'PASS'} — ${canonical.length} canonical actions, ${Object.keys(ACTION_SERVICE_MAP).length} service routes, ${nonCanonical.length} unregistered UI action-like values.`);
