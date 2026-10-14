import { json } from "../../core/http.js";
import { requireSession, requireAdmin } from "../../core/auth-session.js";
import { limitAction } from "../../security/action-limit.js";
import { getForSession, listForSession } from "../../modules/missions/missions.service.js";
import { listMissionExceptions } from "../../modules/attention/attention.service.js";
import { coordinateMissionEngines } from "../engine-coordinator/engine-coordinator.service.js";
import { buildAdaptiveOrchestrationContract, validateAdaptiveOrchestrationContract } from "./adaptive-orchestration.contract.js";
import { buildOperationalIntelligenceOrchestration, validateOperationalIntelligenceOrchestration } from "./operational-intelligence-orchestration.contract.js";
import { buildCapabilityAudit } from "../operations-context/mission-capability-convergence.js";
import { latestActionTelemetry } from "../../modules/telemetry/action-loop-read.service.js";
import { buildClosedLoopCoordination, validateClosedLoopCoordination } from "./closed-loop-coordination.contract.js";
import { buildMultiMissionCoordination, validateMultiMissionCoordination } from "./multi-mission-coordination.contract.js";
import { buildPredictiveOperations } from "../../modules/intelligence/predictive-operations.engine.js";
import { executionPartners } from "../../modules/network/network.service.js";
import { attentionForSession } from "../../modules/attention/attention.service.js";
import { buildAdaptiveCoordinationMesh, validateAdaptiveCoordinationMesh } from "./adaptive-coordination-mesh.contract.js";
import { buildAdaptiveCoordinationMesh101936, validateAdaptiveCoordinationMesh101936 } from "./adaptive-coordination-mesh-101936.contract.js";
import { buildTemporalCoordination, validateTemporalCoordination } from "./temporal-adaptive-coordination-101937.contract.js";
import { buildAdaptiveMultiMissionCoordination, validateAdaptiveMultiMissionCoordination } from "./adaptive-multi-mission-coordination-101935.contract.js";

export function registerAdaptiveOrchestrationRoutes(router) {
  router.get("/api/operations/temporal-coordination", async ({ request, env, url }) => {
    try {
      const session = await requireAdmin(request, env);
      await limitAction(env, session, "temporal-coordination-read", { limit: 30, windowSeconds: 60 });
      const limit = Math.max(1, Math.min(Number(url.searchParams.get("limit")) || 100, 150));
      const [missionsResult, attentionResult, partnersResult] = await Promise.allSettled([
        listForSession(env, session, { activeOnly: true, limit, offset: 0 }),
        attentionForSession(env, session, { limit: 100 }),
        executionPartners(env, session)
      ]);
      if(missionsResult.status!=="fulfilled") throw missionsResult.reason||new Error("Mission coordination data unavailable");
      const missions=missionsResult.value;
      const attention=attentionResult.status==="fulfilled"?attentionResult.value:null;
      const partners=partnersResult.status==="fulfilled"?partnersResult.value:[];
      const list = Array.isArray(missions) ? missions : [];
      const predictive = buildPredictiveOperations({ missions:list, attentionItems:attention?.items||[], drivers:[], networkPartners:partners||[], now:Date.now() });
      const coordination = buildMultiMissionCoordination({ missions:list, predictions:predictive.predictions, workloadPressure:predictive.workloadPressure, networkNeed:predictive.networkNeed, now:Date.now() });
      const mesh = buildAdaptiveCoordinationMesh({ coordination, missions:list, now:Date.now() });
      const temporal = buildTemporalCoordination({ missions:list, coordination:mesh, mesh, networkPartners:partners||[], now:Date.now() });
      const problems = validateTemporalCoordination(temporal);
      return json({ success:true, temporalCoordination:temporal, problems });
    } catch (error) {
      const status=Number(error?.status)||(error?.message==="AUTH_REQUIRED"?401:error?.message==="FORBIDDEN"?403:500);
      return json({ success:false, error:status===500?"Temporal coordination unavailable":(error?.message||"Temporal coordination unavailable") },status);
    }
  });
  router.get("/api/operations/coordination-mesh", async ({ request, env, url }) => {
    try {
      const session = await requireAdmin(request, env);
      await limitAction(env, session, "adaptive-coordination-mesh-read", { limit: 30, windowSeconds: 60 });
      const limit = Math.max(1, Math.min(Number(url.searchParams.get("limit")) || 100, 150));
      const [missionsResult, attentionResult, partnersResult] = await Promise.allSettled([
        listForSession(env, session, { activeOnly: true, limit, offset: 0 }),
        attentionForSession(env, session, { limit: 100 }),
        executionPartners(env, session)
      ]);
      if(missionsResult.status!=="fulfilled") throw missionsResult.reason||new Error("Mission coordination data unavailable");
      const missions=missionsResult.value;
      const attention=attentionResult.status==="fulfilled"?attentionResult.value:null;
      const partners=partnersResult.status==="fulfilled"?partnersResult.value:[];
      const list = Array.isArray(missions) ? missions : [];
      const predictive = buildPredictiveOperations({ missions:list, attentionItems:attention?.items||[], drivers:[], networkPartners:partners||[], now:Date.now() });
      const coordination = buildMultiMissionCoordination({ missions:list, predictions:predictive.predictions, workloadPressure:predictive.workloadPressure, networkNeed:predictive.networkNeed, now:Date.now() });
      const mesh = buildAdaptiveCoordinationMesh101936({ coordination, missions:list, networkNeed:predictive.networkNeed, networkPartners:partners||[], now:Date.now() });
      const problems = validateAdaptiveCoordinationMesh101936(mesh);
      return json({ success:true, mesh, problems });
    } catch (error) {
      const status=Number(error?.status)||(error?.message==="AUTH_REQUIRED"?401:error?.message==="FORBIDDEN"?403:500);
      return json({ success:false, error:status===500?"Adaptive coordination mesh unavailable":(error?.message||"Adaptive coordination mesh unavailable") },status);
    }
  });

  router.get("/api/operations/multi-mission", async ({ request, env, url }) => {
    try {
      const session = await requireAdmin(request, env);
      await limitAction(env, session, "multi-mission-coordination-read", { limit: 30, windowSeconds: 60 });
      const limit = Math.max(1, Math.min(Number(url.searchParams.get("limit")) || 100, 150));
      const [missionsResult, attentionResult, partnersResult] = await Promise.allSettled([
        listForSession(env, session, { activeOnly: true, limit, offset: 0 }),
        attentionForSession(env, session, { limit: 100 }),
        executionPartners(env, session)
      ]);
      if(missionsResult.status!=="fulfilled") throw missionsResult.reason||new Error("Mission coordination data unavailable");
      const missions=missionsResult.value;
      const attention=attentionResult.status==="fulfilled"?attentionResult.value:null;
      const partners=partnersResult.status==="fulfilled"?partnersResult.value:[];
      const predictive = buildPredictiveOperations({
        missions: Array.isArray(missions) ? missions : [],
        attentionItems: attention?.items || [], drivers: [], networkPartners: partners || [], now: Date.now()
      });
      const mesh = buildAdaptiveCoordinationMesh101936({
        coordination: buildMultiMissionCoordination({ missions: Array.isArray(missions) ? missions : [], predictions: predictive.predictions, workloadPressure: predictive.workloadPressure, networkNeed: predictive.networkNeed, now: Date.now() }),
        missions: Array.isArray(missions) ? missions : [], networkNeed: predictive.networkNeed, networkPartners: partners||[], now: Date.now()
      });
      const model = buildAdaptiveMultiMissionCoordination({
        missions: Array.isArray(missions) ? missions : [], predictions: predictive.predictions,
        workloadPressure: predictive.workloadPressure, networkNeed: predictive.networkNeed, mesh, now: Date.now()
      });
      const problems = validateAdaptiveMultiMissionCoordination(model);
      return json({ success: true, coordination: model, problems });
    } catch (error) {
      const status = Number(error?.status) || (error?.message === "AUTH_REQUIRED" ? 401 : error?.message === "FORBIDDEN" ? 403 : 500);
      return json({ success: false, error: status === 500 ? "Multi-mission coordination unavailable" : (error?.message || "Multi-mission coordination unavailable") }, status);
    }
  });

  router.get(/^\/api\/operations\/closed-loop\/(?<missionId>\d+)$/, async ({ request, env, params }) => {
    try {
      const session = await requireSession(request, env);
      await limitAction(env, session, "closed-loop-coordination-read", { limit: 90, windowSeconds: 60 });
      const missionId = Number(params.missionId);
      const { mission, latest, telemetryUnavailable, initialStateToken } = await latestActionTelemetry(env, session, missionId);
      if (!mission) return json({ success: false, error: "Mission not found or access denied" }, 404);
      const exceptions = await listMissionExceptions(env, session, missionId);
      const bundle = await coordinateMissionEngines(env, session, mission, { exceptions });
      const capabilityAudit = buildCapabilityAudit();
      const orchestration = buildOperationalIntelligenceOrchestration({ mission, coordination: bundle.coordination, finalOperationalProduct: bundle.finalOperationalProduct, capabilityAudit, now: Date.now() });
      const loop = buildClosedLoopCoordination({ mission, orchestration, telemetry: { latest, initialStateToken }, now: Date.now() });
      const problems = validateClosedLoopCoordination(loop);
      return json({ success: true, closedLoop: loop, telemetryAvailable: !telemetryUnavailable, problems });
    } catch (error) {
      const status = Number(error?.status) || (error?.message === "AUTH_REQUIRED" ? 401 : error?.message === "FORBIDDEN" ? 403 : 500);
      return json({ success: false, error: status === 500 ? "Closed-loop coordination unavailable" : (error?.message || "Closed-loop coordination unavailable") }, status);
    }
  });

  router.get(/^\/api\/operations\/orchestration\/(?<missionId>\d+)$/, async ({ request, env, params }) => {
    try {
      const session = await requireSession(request, env);
      await limitAction(env, session, "operational-intelligence-orchestration-read", { limit: 90, windowSeconds: 60 });
      const missionId = Number(params.missionId);
      const mission = await getForSession(env, session, missionId);
      if (!mission) return json({ success: false, error: "Mission not found or access denied" }, 404);
      const exceptions = await listMissionExceptions(env, session, missionId);
      const bundle = await coordinateMissionEngines(env, session, mission, { exceptions });
      const capabilityAudit = buildCapabilityAudit();
      const model = buildOperationalIntelligenceOrchestration({
        mission, coordination: bundle.coordination, finalOperationalProduct: bundle.finalOperationalProduct,
        capabilityAudit, now: Date.now()
      });
      const problems = validateOperationalIntelligenceOrchestration(model);
      if (problems.length) console.warn("OPERATIONAL_INTELLIGENCE_ORCHESTRATION_CONTRACT_VIOLATION", { missionId, problems });
      return json({ success: true, orchestration: model, problems });
    } catch (error) {
      const status = Number(error?.status) || (error?.message === "AUTH_REQUIRED" ? 401 : error?.message === "FORBIDDEN" ? 403 : 500);
      return json({ success: false, error: status === 500 ? "Operational intelligence orchestration unavailable" : (error?.message || "Operational intelligence orchestration unavailable") }, status);
    }
  });
  router.get(/^\/api\/adaptive-orchestration\/missions\/(?<missionId>\d+)$/, async ({ request, env, params }) => {
    try {
      const session = await requireSession(request, env);
      await limitAction(env, session, "adaptive-orchestration-read", { limit: 90, windowSeconds: 60 });
      const missionId = Number(params.missionId);
      const mission = await getForSession(env, session, missionId);
      if (!mission) return json({ success: false, error: "Mission not found or access denied" }, 404);
      const exceptions = await listMissionExceptions(env, session, missionId);
      const bundle = await coordinateMissionEngines(env, session, mission, { exceptions });
      const contract = buildAdaptiveOrchestrationContract({
        mission,
        coordination: bundle.coordination,
        finalOperationalProduct: bundle.finalOperationalProduct,
        session
      });
      const problems = validateAdaptiveOrchestrationContract(contract);
      if (problems.length) console.warn("ADAPTIVE_ORCHESTRATION_CONTRACT_VIOLATION", { missionId, problems });
      return json({ success: true, orchestration: contract, problems });
    } catch (error) {
      const status = Number(error?.status) || (error?.message === "AUTH_REQUIRED" ? 401 : error?.message === "FORBIDDEN" ? 403 : 500);
      return json({ success: false, error: status === 500 ? "Adaptive orchestration unavailable" : (error?.message || "Adaptive orchestration unavailable") }, status);
    }
  });
}
