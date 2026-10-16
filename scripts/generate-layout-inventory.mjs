import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.cwd();
const publicRoot = path.join(root, 'public');
const outDir = path.join(root, 'docs');
const version = fs.readFileSync(path.join(root, 'VERSION'), 'utf8').trim();
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).sort((a,b)=>a.name.localeCompare(b.name)).flatMap((entry) => {
  const full = path.join(dir, entry.name);
  return entry.isDirectory() ? walk(full) : [full];
});
const relative = (file) => path.relative(root, file).split(path.sep).join('/');
const files = walk(publicRoot);
const htmlFiles = files.filter((f) => f.endsWith('.html'));
const cssFiles = files.filter((f) => f.endsWith('.css'));
const jsFiles = files.filter((f) => /\.(?:js|mjs)$/.test(f));
const assets = new Set(files.map(relative));
const routes = [];
const missingAssets = [];
const importEdges = [];
const selectorOccurrences = new Map();
const cssHashes = new Map();

for (const file of htmlFiles) {
  const source = fs.readFileSync(file, 'utf8');
  const linked = [];
  for (const match of source.matchAll(/(?:href|src)=["']([^"']+)["']/g)) {
    const raw = match[1];
    if (/^(?:https?:|data:|#|\/\/|javascript:)/i.test(raw)) continue;
    const assetPath = raw.split(/[?#]/)[0];
    if (!assetPath) continue;
    const normalized = assetPath.startsWith('/') ? `public${assetPath}` : path.posix.normalize(path.posix.join(path.posix.dirname(relative(file)), assetPath));
    if (/\.(?:css|js|mjs)$/.test(normalized)) {
      linked.push(normalized);
      if (!assets.has(normalized)) missingAssets.push({ page: relative(file), reference: raw, resolved: normalized });
    }
  }
  routes.push({ page: relative(file), title: source.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g,' ').trim() || null, stylesheets: linked.filter((x)=>x.endsWith('.css')), scripts: linked.filter((x)=>/\.(?:js|mjs)$/.test(x)), bytes: Buffer.byteLength(source), sha256: crypto.createHash('sha256').update(source).digest('hex') });
}
for (const file of jsFiles) {
  const source = fs.readFileSync(file, 'utf8');
  for (const match of source.matchAll(/\bimport\s+(?:[^'";]*?\s+from\s+)?["']([^"']+)["']/g)) {
    const spec = match[1];
    if (!spec.startsWith('.')) continue;
    const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(relative(file)), spec.split(/[?#]/)[0]));
    importEdges.push({ from: relative(file), specifier: spec, to: resolved, exists: assets.has(resolved) || fs.existsSync(path.join(root, resolved)) });
  }
}
for (const file of cssFiles) {
  const source = fs.readFileSync(file, 'utf8');
  const hash = crypto.createHash('sha256').update(source).digest('hex');
  cssHashes.set(hash, [...(cssHashes.get(hash) || []), relative(file)]);
  // Inventory repeated selector declarations without assuming they are safe to delete.
  const cleaned = source.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const match of cleaned.matchAll(/(^|})\s*([^{}@][^{}]*)\s*\{/g)) {
    const selector = match[2].trim().replace(/\s+/g, ' ');
    if (!selector || selector.length > 240 || selector.includes(';')) continue;
    for (const part of selector.split(',')) {
      const normalized = part.trim().replace(/\s+/g, ' ');
      if (!normalized || normalized.startsWith('@')) continue;
      const key = `${relative(file)} :: ${normalized}`;
      selectorOccurrences.set(key, (selectorOccurrences.get(key) || 0) + 1);
    }
  }
}
const repeatedSelectors = [...selectorOccurrences].filter(([,count])=>count>1).map(([key,count])=>({key,count})).sort((a,b)=>b.count-a.count || a.key.localeCompare(b.key));
const duplicateCssFiles = [...cssHashes].filter(([,paths])=>paths.length>1).map(([sha256,paths])=>({sha256,paths}));
const missingImports = importEdges.filter((edge)=>!edge.exists);
const result = {
  version,
  generatedAt: new Date().toISOString(),
  scope: 'static source inventory only; not proof of runtime reachability or computed browser styles',
  counts: { htmlPages: htmlFiles.length, cssFiles: cssFiles.length, jsModules: jsFiles.length, localPageAssetReferences: routes.reduce((n,r)=>n+r.stylesheets.length+r.scripts.length,0), relativeImportEdges: importEdges.length, missingPageAssets: missingAssets.length, missingRelativeImports: missingImports.length, repeatedSelectorEntries: repeatedSelectors.length, byteIdenticalCssGroups: duplicateCssFiles.length },
  routes: routes.sort((a,b)=>a.page.localeCompare(b.page)),
  relativeImports: importEdges.sort((a,b)=>a.from.localeCompare(b.from)||a.specifier.localeCompare(b.specifier)),
  missingAssets,
  missingImports,
  repeatedSelectors,
  byteIdenticalCssFiles: duplicateCssFiles,
  canonicalLayoutReferences: routes.filter((r)=>r.stylesheets.some((s)=>s.endsWith('/canonical-layout.css'))).map((r)=>r.page),
};
fs.writeFileSync(path.join(outDir, `16.10.39-layout-inventory.json`), JSON.stringify(result,null,2)+'\n');
const md = [
`# ON MISSION ${version} — Layout Inventory & Ownership Map`, '',
`Generated: ${result.generatedAt}`, '',
'## Scope and interpretation', '',
'This is a deterministic static source inventory. It maps HTML pages to local CSS/JS assets, relative JavaScript imports, repeated CSS selector declarations, and byte-identical CSS files. It does **not** prove browser reachability, dynamic imports, runtime event ownership, computed styles, or that a repeated selector is safe to remove.', '',
'## Inventory summary', '',
'| Metric | Count |','|---|---:|',
...Object.entries(result.counts).map(([k,v])=>`| ${k} | ${v} |`), '',
'## Route and asset ownership map', '',
'| HTML page | Title | Stylesheets | Scripts |', '|---|---|---|---|',
...result.routes.map((r)=>`| \`${r.page}\` | ${(r.title||'—').replace(/\|/g,'\\|')} | ${r.stylesheets.map((x)=>'`'+x+'`').join('<br>')||'—'} | ${r.scripts.map((x)=>'`'+x+'`').join('<br>')||'—'} |`), '',
'## Canonical layout coverage', '',
...result.canonicalLayoutReferences.map((x)=>`- \`${x}\``), '',
'## Repeated CSS selector declarations', '',
`Found ${repeatedSelectors.length} selector/file pairs with repeated declarations. This is an investigation queue, **not a deletion list**. The same selector can legitimately appear in different cascade layers or media queries.`, '',
...repeatedSelectors.slice(0,500).map((x)=>`- ${x.count}× \`${x.key}\``),
repeatedSelectors.length>500?`- … ${repeatedSelectors.length-500} additional entries are available in the JSON inventory.`:'', '',
'## Byte-identical CSS files', '',
...(duplicateCssFiles.length?duplicateCssFiles.map((x)=>`- SHA-256 \`${x.sha256}\`: ${x.paths.map((p)=>'`'+p+'`').join(', ')}`):['- None detected.']), '',
'## Missing local references', '',
'### HTML page assets', '',
...(missingAssets.length?missingAssets.map((x)=>`- Page \`${x.page}\` references \`${x.reference}\` → \`${x.resolved}\``):['- None detected.']), '',
'### Relative JavaScript imports', '',
...(missingImports.length?missingImports.map((x)=>`- \`${x.from}\` imports \`${x.specifier}\` → \`${x.to}\``):['- None detected.']), '',
'## Ownership and safe-retirement policy', '',
'- Design tokens: canonical token stylesheet/registry; do not introduce page-local token registries.',
'- Structural layout: `public/assets/css/frontend/canonical-layout.css` is the shared structural layout contract where included.',
'- Component skinning: feature styles remain local until consumers are traced and safely migrated.',
'- Page composition: existing page/runtime implementations remain owners until the route/component dependency graph proves a safe migration path.',
'- Market composition: Market Factory remains the canonical market release publisher; this inventory does not change market packages or releases.',
'- Release publication: existing governed release pipeline only; no mutable live edits.',
'- Do not remove a repeated selector, stylesheet, component, helper, or route based on static duplication alone. Require consumer tracing, runtime/browser evidence, and a regression test.', '',
'## Next audit actions', '',
'1. Inspect missing references and classify redirects/intentional runtime resolution before changing them.',
'2. Group repeated selectors by selector + declaration + media query + specificity and inspect computed styles at supported viewports.',
'3. Trace UI helper imports, event listeners and route consumers before proposing retirement.',
'4. Use the inventory to select a small, high-impact token/component migration for 16.10.40.',
'5. Add browser visual and behavior certification before retiring existing implementations.', ''
].join('\n');
fs.writeFileSync(path.join(outDir, `16.10.39-layout-inventory.md`), md);
console.log(`16.10.39 layout inventory generated: ${result.counts.htmlPages} HTML, ${result.counts.cssFiles} CSS, ${result.counts.jsModules} JS modules, ${result.counts.missingPageAssets} missing page assets, ${result.counts.missingRelativeImports} missing relative imports, ${result.counts.repeatedSelectorEntries} repeated selector/file pairs.`);
