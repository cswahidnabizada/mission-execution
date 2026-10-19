/**
 * ON Mission simulation integration certification contracts.
 * Deterministic local harness only: no network, vendor credentials, live mission
 * writes, hardware transport, or physical actuation are available from this module.
 */
export const SIMULATION_INTEGRATION_VERSION = '16.10.78';
export const HIL_ACTUATION_ENABLED = false;
export const VENDOR_TRANSPORT_ENABLED = false;
export const LIVE_MISSION_MUTATION_ENABLED = false;

const freeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
};
const fail = code => { throw Object.assign(new Error(code), { code }); };

export const VENDOR_SIMULATOR_CONTRACT = freeze({
  schema: 'onmission.vendor-simulator-contract.v1', version: '1', mode: 'LOCAL_DETERMINISTIC',
  transport: 'NONE', credentialsRequired: false, networkAllowed: false,
  productionMutation: false, physicalEffects: false,
  responseModes: ['SUCCESS', 'TIMEOUT', 'MALFORMED', 'SAFETY_LIMIT_VIOLATION', 'HEARTBEAT_LOST']
});

export function simulateVendorResponse({ mode = 'SUCCESS', requestId = 'vendor-test-001', seed = 'stable' } = {}) {
  if (!VENDOR_SIMULATOR_CONTRACT.responseModes.includes(mode)) fail('VENDOR_SIMULATION_MODE_UNSUPPORTED');
  const base = { schema: VENDOR_SIMULATOR_CONTRACT.schema, requestId: String(requestId).slice(0, 100), seed: String(seed).slice(0, 80), mode, simulated: true, transportUsed: false, networkUsed: false, credentialsUsed: false, productionMutation: false, physicalEffects: false };
  const cases = {
    SUCCESS: { status: 'ACKNOWLEDGED', vendorReference: `sim-${String(seed).replace(/[^A-Za-z0-9-]/g, '').slice(0, 24) || 'stable'}`, effect: 'SIMULATED_ONLY' },
    TIMEOUT: { status: 'TIMEOUT', retry: 'RECONCILE_BEFORE_RETRY', retryAllowedAutomatically: false },
    MALFORMED: { status: 'REJECTED', reason: 'VENDOR_RESPONSE_SCHEMA_INVALID' },
    SAFETY_LIMIT_VIOLATION: { status: 'BLOCKED', reason: 'DEVICE_SAFETY_ENVELOPE_VIOLATION' },
    HEARTBEAT_LOST: { status: 'SAFE_STOP_REQUIRED', reason: 'VENDOR_HEARTBEAT_LOST', automaticActuation: false }
  };
  return freeze({ ...base, result: cases[mode] });
}

export function runSoftwareInLoop({ mode = 'SUCCESS', deviceProfile, speedKph = 0, payloadKg = 0, heartbeat = true } = {}) {
  const simulated = simulateVendorResponse({ mode, requestId: `sil-${deviceProfile || 'unknown'}` });
  let status = 'PASS'; const findings = [];
  if (!['virtual-van', 'virtual-robot', 'virtual-drone'].includes(deviceProfile)) { status = 'BLOCKED'; findings.push('DEVICE_PROFILE_UNSUPPORTED'); }
  const limits = { 'virtual-van': { speed: 90, payload: 1200 }, 'virtual-robot': { speed: 5, payload: 50 }, 'virtual-drone': { speed: 20, payload: 2 } }[deviceProfile];
  if (limits && (!Number.isFinite(Number(speedKph)) || Number(speedKph) < 0 || Number(speedKph) > limits.speed)) { status = 'BLOCKED'; findings.push('DEVICE_SPEED_LIMIT_EXCEEDED'); }
  if (limits && (!Number.isFinite(Number(payloadKg)) || Number(payloadKg) < 0 || Number(payloadKg) > limits.payload)) { status = 'BLOCKED'; findings.push('DEVICE_PAYLOAD_LIMIT_EXCEEDED'); }
  if (!heartbeat || mode === 'HEARTBEAT_LOST') { status = 'BLOCKED'; findings.push('HEARTBEAT_LOST_FAIL_CLOSED'); }
  if (mode !== 'SUCCESS') { status = 'BLOCKED'; findings.push(simulated.result.reason || simulated.result.status); }
  if (deviceProfile === 'virtual-drone') { status = 'BLOCKED'; findings.push('DRONE_PLANNING_ONLY_NO_SIL_ACTUATION'); }
  return freeze({ schema: 'onmission.sil-result.v1', mode: 'SOFTWARE_IN_THE_LOOP', deviceProfile: deviceProfile || null, status, findings, vendor: simulated, safety: { simulationOnly: true, deviceCommandSent: false, physicalConnectionAllowed: false, actuationEnabled: false, productionMutation: false } });
}

export function evaluateHardwareInLoopRequest({ deviceId, safetyApproval, supervisedTestId, emergencyStopVerified } = {}) {
  const approved = Boolean(deviceId && safetyApproval?.status === 'APPROVED' && safetyApproval?.deviceId === deviceId && safetyApproval?.scope === 'HIL_TEST_ONLY' && safetyApproval?.expiresAt && Date.parse(safetyApproval.expiresAt) > Date.now() && supervisedTestId && emergencyStopVerified === true);
  // This release deliberately has no hardware transport or actuation implementation.
  return freeze({ schema: 'onmission.hil-interlock.v1', requested: Boolean(deviceId), allowed: false, status: approved ? 'BLOCKED_IMPLEMENTATION_NOT_PRESENT' : 'BLOCKED_SAFETY_APPROVAL_REQUIRED', reason: approved ? 'HIL_TRANSPORT_NOT_IMPLEMENTED_IN_THIS_RELEASE' : 'DEVICE_SPECIFIC_APPROVAL_SUPERVISION_AND_EMERGENCY_STOP_REQUIRED', hardwareTransportAvailable: false, actuationEnabled: false, productionMutation: false, deviceCommandSent: false });
}

export const GERMANY_LOGISTICS_SCENARIOS = freeze([
  { id: 'DE-LOG-001', name: 'Normal delivery', scenarioId: 'normal', executor: 'virtual-van', deadlineMinutes: 60, expected: 'DELIVERY_VERIFIED', expectedRecovery: 'NOT_REQUIRED', requiresIndependentEvidence: true },
  { id: 'DE-LOG-002', name: 'Blocked assignment', scenarioId: 'executor-unavailable', executor: 'virtual-van', deadlineMinutes: 60, expected: 'SAFE_BLOCK_AND_REPLAN', expectedRecovery: 'REPLAN_REQUIRED', requiresIndependentEvidence: false },
  { id: 'DE-LOG-003', name: 'Failed delivery and recovery', scenarioId: 'failed-delivery', executor: 'virtual-van', deadlineMinutes: 60, expected: 'RECOVERY_VERIFIED', expectedRecovery: 'SIMULATED_RECOVERY_VERIFIED', requiresIndependentEvidence: true },
  { id: 'DE-LOG-004', name: 'Device disconnect safe stop', scenarioId: 'device-disconnect', executor: 'virtual-robot', deadlineMinutes: 60, expected: 'SAFE_STOP_AND_RECONCILE', expectedRecovery: 'SIMULATED_SAFE_STOP', requiresIndependentEvidence: true }
]);

export function certifyGermanyLogisticsRun(run, scenario) {
  const failures = [];
  if (!run || run.schema !== 'onmission.simulation-run.v1') failures.push('SIMULATION_RUN_SCHEMA_INVALID');
  if (run?.simulationOnly !== true || run?.realWorldEffects !== false || run?.productionMutation !== false || run?.deviceCommandSent !== false) failures.push('SIMULATION_SAFETY_INVARIANT_FAILED');
  if (run?.outcomeComparison?.expected !== scenario?.expected || run?.outcomeComparison?.match !== true) failures.push('EXPECTED_OUTCOME_MISMATCH');
  if (run?.recoveryStatus !== scenario?.expectedRecovery) failures.push('RECOVERY_STATE_MISMATCH');
  if (!Array.isArray(run?.journey) || !run.journey.some(x => x.stage === 'VERIFY')) failures.push('INDEPENDENT_VERIFICATION_STAGE_MISSING');
  if (scenario?.requiresIndependentEvidence && !run?.evidence?.some(x => x.classification === 'SIMULATED' && /OUTCOME_CHECK/.test(x.detail))) failures.push('SIMULATED_VERIFICATION_EVIDENCE_MISSING');
  return freeze({ schema: 'onmission.germany-logistics-certification.v1', scenarioId: scenario?.id || null, status: failures.length ? 'FAIL' : 'PASS_SIMULATED_ONLY', failures, realWorldCertified: false, physicalDeliveryProven: false, productionMutation: false });
}
