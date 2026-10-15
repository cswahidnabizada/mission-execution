import fs from "node:fs";
import path from "node:path";
const root=process.cwd();
const version=fs.readFileSync(path.join(root,"VERSION"),"utf8").trim();
const releaseFile='RELEASE.md';
const required=[
  "VERSION","RELEASE.md","package.json","src/worker/security/market-readiness-reconciliation.js","tests/system/check-16-10-29-market-readiness-reconciliation.mjs",
  "src/worker/security/controlled-market-launch-certification.js",
  "tests/system/check-16-10-30-controlled-market-launch-certification.mjs",
  "tests/system/check-v103027-adaptive-context-queues.mjs",
  "tests/security/check-v103027-authorization-adversarial.mjs",
  "tests/system/check-v103027-dashboard-width-queue.mjs",
  "scripts/check-duplicate-files.mjs"
];
for(const f of required){if(!fs.existsSync(path.join(root,f)))throw new Error(`Missing release artifact: ${f}`);}
const releaseDoc=fs.readFileSync(path.join(root,releaseFile),"utf8");
if(!releaseDoc.includes(`# Mission Execution ${version}`))throw new Error("Release document version does not match VERSION.");
if(!releaseDoc.includes("Status: final audited project") && !releaseDoc.includes("Status: protected candidate") && !releaseDoc.includes("Status: hardening candidate"))throw new Error("Release status is missing.");
const currentVersion=fs.readFileSync(path.join(root,'VERSION'),'utf8').trim();
if(!releaseDoc.includes(currentVersion))throw new Error(`Current release document must identify VERSION ${currentVersion}.`);

