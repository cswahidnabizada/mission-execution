import assert from "node:assert/strict";
import { buildTemporalCoordination, validateTemporalCoordination, TEMPORAL_COORDINATION_VERSION } from "../../src/worker/extensions/adaptive-orchestration/temporal-coordination.contract.js";
const now=Date.parse("2026-09-08T18:00:00.000Z");
const missions=[
 {id:1,reference:"M-001",status:"IN_TRANSIT",created_at:"2026-09-01T10:00:00Z",updated_at:"2026-09-05T10:00:00Z",status_changed_at:"2026-09-05T10:00:00Z",priority:"HIGH"},
 {id:2,reference:"M-002",status:"ASSIGNED",created_at:"2026-09-08T12:00:00Z",updated_at:"2026-09-08T17:30:00Z",priority:"MEDIUM"},
 {id:3,reference:"M-003",status:"WAITING",created_at:"2026-09-06T10:00:00Z",updated_at:"2026-09-07T10:00:00Z",priority:"HIGH"},
 {id:4,reference:"M-004",status:"DELIVERED",created_at:"2026-09-01T10:00:00Z",updated_at:"2026-09-02T10:00:00Z"}
];
const coordination={hotspots:[{type:"RESOURCE",key:"executor:7",level:"HIGH",missionIds:[1,2],reason:"Shared execution capacity is under pressure."}]};
const model=buildTemporalCoordination({missions,coordination,now});
assert.equal(model.version,TEMPORAL_COORDINATION_VERSION);
assert.equal(model.readOnly,true); assert.equal(model.authoritative,false);
assert.equal(model.agingMissionCount,2); assert.equal(model.staleMissionCount,2);
assert.equal(model.systemTrend,"AGING_PRESSURE");
assert.ok(model.trends.some(x=>x.missionId===1&&x.direction==="AGING"));
assert.ok(model.adaptiveHotspots.length>=1);
assert.ok(model.nextAdaptiveCoordination?.missionId===1);
assert.deepEqual(validateTemporalCoordination(model),[]);
assert.equal(model.safety.executesAction,false); assert.equal(model.safety.persistsCoordination,false);
console.log("10.19.28 temporal adaptive coordination: PASS");
