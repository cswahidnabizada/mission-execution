import assert from 'node:assert/strict';
import { buildAdaptiveCoordinationMesh, validateAdaptiveCoordinationMesh } from '../../src/worker/extensions/adaptive-orchestration/adaptive-coordination-mesh.contract.js';
const coordination={priority:[
 {missionId:1,reference:'M-1',coordinationLevel:'HIGH',coordinationScore:85,owner:{type:'driver',id:7,name:'A'},safeNext:{available:true,action:{label:'Start'}}},
 {missionId:2,reference:'M-2',coordinationLevel:'HIGH',coordinationScore:82,owner:{type:'driver',id:7,name:'A'},safeNext:{available:false}}
],resourcePressure:[{key:'driver:7',level:'HIGH',missionIds:[1,2],reason:'Shared owner pressure'}],dependencyPressure:[]};
const model=buildAdaptiveCoordinationMesh({coordination,missions:[{id:1,status:'Pending',driver_id:7,executor_name:'A'},{id:2,status:'Pending',driver_id:7,executor_name:'A'}],now:Date.UTC(2026,8,8)});
assert.equal(model.version,'10.19.27'); assert.equal(model.readOnly,true); assert.equal(model.authoritative,false); assert.equal(model.hotspots.length,1); assert.equal(model.lanes[0].lane,'CAPACITY_FIRST'); assert.equal(model.nextBestCoordination.missionId,1); assert.deepEqual(validateAdaptiveCoordinationMesh(model),[]);
for(const k of ['createsTruth','createsAuthorization','executesAction','changesResponsibility','changesCustody','persistsCoordination']) assert.equal(model.safety[k],false);
console.log('10.19.27 adaptive coordination mesh contract: PASS');
