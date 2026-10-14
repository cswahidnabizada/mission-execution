import fs from 'node:fs';
const html=fs.readFileSync('public/admin.html','utf8');
const js=fs.readFileSync('public/assets/js/pages/dashboard-command-center.js','utf8');
const css=fs.readFileSync('public/assets/css/dashboard-modern-responsive.css','utf8');
const checks=[
 ['fresh insights root',html.includes('class="om52-insight-kpis"')],
 ['performance KPI',html.includes('id="om52Completion"')],
 ['bottleneck surface',html.includes('id="om52Status"')],
 ['execution surface',html.includes('id="om52Executors"')],
 ['operational read',html.includes('id="om52Signals"')],
 ['fresh insights loader',js.includes('async function loadInsights(force=false)')&&js.includes('om52RenderChart')],
 ['legacy insight ids retired',!html.includes('id="nmInsightVolume"')&&!html.includes('id="nmInsightCompletion"')],
 ['fresh responsive styles',css.includes('.om52-insight-grid')&&css.includes('@media(max-width:900px)')]
];
for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)process.exitCode=1;}
