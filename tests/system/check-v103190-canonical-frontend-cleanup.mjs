import assert from "node:assert/strict";
import fs from "node:fs";
const dead=[
  "public/assets/js/core/verification-widget.js",
  "public/assets/js/core/user-progress.js",
  "public/assets/js/core/access-visibility.js",
  "src/worker/modules/balm-verification/balm.parser.js",
  "src/worker/modules/balm-verification/balm.routes.js",
  "src/worker/modules/balm-verification/balm.service.js",
  "src/worker/modules/balm-verification/balm.validator.js"
];
for(const f of dead)assert.equal(fs.existsSync(f),false,`dead legacy implementation remains: ${f}`);
const refs=[];
function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(["node_modules",".git"].includes(e.name))continue;const p=`${dir}/${e.name}`;if(e.isDirectory())walk(p);else if(/\.(js|mjs|html)$/.test(e.name) && !p.endsWith("check-v103190-canonical-frontend-cleanup.mjs")){const s=fs.readFileSync(p,"utf8");for(const f of dead)if(s.includes(f))refs.push(`${p} -> ${f}`);}}}
walk(".");
assert.deepEqual(refs,[],`legacy references remain\n${refs.join("\n")}`);
console.log("10.31.90 canonical frontend cleanup: PASS");
