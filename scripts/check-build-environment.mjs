import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
const nodeMajor=Number(process.versions.node.split('.')[0]);
const npmResult=spawnSync('npm',['--version'],{encoding:'utf8'});
if(npmResult.status!==0) throw new Error('Build environment gate: unable to determine npm version');
const npmVersion=npmResult.stdout.trim();
const npmMajor=Number(npmVersion.split('.')[0]);
const declaredNode=pkg.engines?.node;
const declaredNpm=pkg.engines?.npm;
const expectedNode=fs.readFileSync('.node-version','utf8').trim();
const expectedNodeMajor=Number(expectedNode.split('.')[0]);
const errors=[];
if(nodeMajor!==24 || expectedNodeMajor!==24 || declaredNode!=='24.x') errors.push(`Node contract mismatch: runtime=${process.versions.node}, .node-version=${expectedNode}, engines.node=${declaredNode}`);
if(![10,11].includes(npmMajor) || declaredNpm!=='>=10 <12') errors.push(`npm contract mismatch: runtime=${npmVersion}, engines.npm=${declaredNpm}; supported npm majors are 10 and 11`);
if(errors.length){console.error('Build environment gate: FAIL');for(const error of errors)console.error(`- ${error}`);console.error('Configure Cloudflare Workers Builds to use Node.js 24.18.0. The build image may expose npm 10.x or 11.x; both are accepted by this release contract.');process.exit(1);}
console.log(`Build environment gate: PASS (Node ${process.versions.node}; npm ${npmVersion})`);
