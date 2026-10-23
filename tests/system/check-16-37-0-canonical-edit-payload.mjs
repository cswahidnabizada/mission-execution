import fs from 'node:fs';
import assert from 'node:assert/strict';
const ui=fs.readFileSync('public/assets/js/frontend/admin/data-studio.js','utf8');
assert.match(ui,/const immutableCodeTypes=new Set\(\['product_country','sector','language','currency','region','classification','policy','residency','retention','role','capability','responsibility','storage','provider','page','feature','guidance','eligibility','pricing'\]\)/);
assert.match(ui,/payload\.code=type==='product_country'\?canonical\.toUpperCase\(\):canonical/);
assert.match(ui,/Canonical identity code is missing/);
console.log('16.37.0 canonical edit payload contract: PASS');
