import fs from 'node:fs';
const route=fs.readFileSync('src/worker/modules/admin-control/admin-launch-config.routes.js','utf8');
const required=[
  'startProductPublisher',
  'savePublisherScope',
  'getPublisherWorkspace',
  'savePublisherFoundation',
  'savePublisherDefinition',
  'savePublisherLifecycle',
  'validatePublisherWorkspace',
  'publishPublisherWorkspace',
  'verifyPublisherWorkspace'
];
for(const name of required){
  if(!route.includes(`const ${name}=ctx.${name};`)) throw new Error(`Product Publisher route dependency is not wired: ${name}`);
}
for(const name of required){
  if(!route.includes(name)) throw new Error(`Product Publisher route does not reference: ${name}`);
}
console.log('10.50.0 Product Publisher route wiring gate: PASS (all publisher stages wired to canonical context)');
