import assert from "node:assert/strict";
import fs from "node:fs";
import {deriveActionCapabilities} from "../../src/worker/extensions/actions-intelligence/action-capability.engine.js";
import {buildActionContract} from "../../src/worker/extensions/actions-intelligence/action-contract.engine.js";

const ui=fs.readFileSync("public/assets/js/core/action-registry.js","utf8");
const map=fs.readFileSync("src/worker/application/actions/action-service-map.js","utf8");
const auth=fs.readFileSync("src/worker/extensions/action-execution/secured-action-authorization.contract.js","utf8");
const routes=fs.readFileSync("src/worker/modules/public/public.routes.js","utf8");
const repo=fs.readFileSync("src/worker/repositories/public.repository.js","utf8");
const workspace=fs.readFileSync("public/assets/ui/canonical-mission-workspace.js","utf8");

const discovery={missionId:247,role:"admin",status:"Pending",accessKind:"foryou-discovery",mission:{id:247,public_enabled:1,status:"Pending"},perspective:{isOwner:false,isExecutingTenant:false,isPersonal:false},responsibility:{},source:{owned:false,shared:false,publicEnabled:true}};
const cap=deriveActionCapabilities(discovery);
assert.deepEqual(cap.capabilities.map(x=>x.code),["request_foryou_mission"]);
const contract=buildActionContract(cap,{conditions:discovery,featureState:{},missionId:247});
assert.deepEqual(contract.all.map(x=>x.code),["request_foryou_mission"]);
assert.equal(contract.primary.code,"request_foryou_mission");

const pending={...discovery,accessKind:"pending-foryou",mission:{...discovery.mission,requester_type:"tenant",requester_company_id:99},forYouRequest:{id:501,pending:true,status:"Pending",relation:"requester"}};
const pcap=deriveActionCapabilities(pending);
assert.deepEqual(pcap.capabilities.map(x=>x.code),["cancel_foryou_request"]);
const pcontract=buildActionContract(pcap,{conditions:pending,featureState:{},missionId:247,forYouRequestId:501});
assert.deepEqual(pcontract.all.map(x=>x.code),["cancel_foryou_request"]);
assert.equal(pcontract.primary.code,"cancel_foryou_request");

const owner={...discovery,accessKind:"owner",perspective:{isOwner:true,isExecutingTenant:false,isPersonal:false},source:{owned:true,shared:false}};
assert.ok(!deriveActionCapabilities(owner).capabilities.some(x=>x.code==="request_foryou_mission"));

assert.match(ui,/"request_foryou_mission","cancel_foryou_request"/);
assert.match(workspace,/c==="cancel_foryou_request"\)return renderCancelForYouRequest/);
assert.match(map,/cancel_foryou_request:route\("foryou"/);
assert.match(auth,/code==="cancel_foryou_request"/);
assert.ok(routes.includes("/api/public/requests/") && routes.includes("/cancel"));
assert.match(repo,/cancelTenantPublicRequest/);
console.log("10.31.41 ForYou request completion OK");
