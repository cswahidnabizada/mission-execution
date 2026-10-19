/**
 * Versioned virtual device safety profiles. This registry is simulation-only;
 * it never creates vendor connections, credentials, or physical commands.
 */
export const VIRTUAL_DEVICE_PROFILE_VERSION = '1';
const profiles = {
  'virtual-van': {
    id: 'virtual-van', class: 'GROUND_DELIVERY_VEHICLE', profileVersion: '1',
    limits: { maxSpeedKph: 90, maxPayloadKg: 1200 },
    allowedSimulatedStages: ['OBSERVE','UNDERSTAND','PLAN','EVALUATE','ACCEPT','AUTHORIZE','PREPARE','ASSIGN','EXECUTE','EFFECT','VERIFY','RECOVER','OUTCOME','LEARN','NEXT SITUATION'],
    planningOnly: false
  },
  'virtual-robot': {
    id: 'virtual-robot', class: 'WAREHOUSE_MOBILE_ROBOT', profileVersion: '1',
    limits: { maxSpeedKph: 5, maxPayloadKg: 50 },
    allowedSimulatedStages: ['OBSERVE','UNDERSTAND','PLAN','EVALUATE','ACCEPT','AUTHORIZE','PREPARE','ASSIGN','EXECUTE','EFFECT','VERIFY','RECOVER','OUTCOME','LEARN','NEXT SITUATION'],
    planningOnly: false
  },
  'virtual-drone': {
    id: 'virtual-drone', class: 'AERIAL_DELIVERY', profileVersion: '1',
    limits: { maxSpeedKph: 20, maxPayloadKg: 2 },
    allowedSimulatedStages: ['OBSERVE','UNDERSTAND','PLAN','EVALUATE'],
    planningOnly: true
  }
};
const freezeDeep = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freezeDeep); Object.freeze(value);
  }
  return value;
};
Object.values(profiles).forEach(freezeDeep);
export function resolveVirtualDeviceProfile(id) {
  if (typeof id !== 'string' || !Object.hasOwn(profiles, id)) throw new Error('VIRTUAL_DEVICE_PROFILE_UNSUPPORTED');
  const profile = profiles[id];
  return {
    ...profile, limits: { ...profile.limits },
    allowedSimulatedStages: [...profile.allowedSimulatedStages],
    safetyEnvelope: {
      profileVersion: profile.profileVersion, simulationOnly: true, physicalConnectionAllowed: false,
      actuationEnabled: false, productionMutation: false, deviceCommandSent: false,
      geofenceEnforced: true, emergencyStopMode: 'SIMULATED_ONLY',
      planningOnly: profile.planningOnly
    }
  };
}
export function assertVirtualDeviceSafety(profile, requested = {}) {
  if (!profile || profile.safetyEnvelope?.simulationOnly !== true ||
      profile.safetyEnvelope?.physicalConnectionAllowed !== false ||
      profile.safetyEnvelope?.actuationEnabled !== false ||
      profile.safetyEnvelope?.productionMutation !== false ||
      profile.safetyEnvelope?.deviceCommandSent !== false) {
    throw new Error('VIRTUAL_DEVICE_SAFETY_ENVELOPE_INVALID');
  }
  const speed = Number(requested.speedKph ?? 0);
  const payload = Number(requested.payloadKg ?? 0);
  if (!Number.isFinite(speed) || speed < 0 || speed > profile.limits.maxSpeedKph) throw new Error('VIRTUAL_DEVICE_SPEED_LIMIT_EXCEEDED');
  if (!Number.isFinite(payload) || payload < 0 || payload > profile.limits.maxPayloadKg) throw new Error('VIRTUAL_DEVICE_PAYLOAD_LIMIT_EXCEEDED');
  if (profile.planningOnly && requested.stage && !['OBSERVE','UNDERSTAND','PLAN','EVALUATE'].includes(requested.stage)) throw new Error('VIRTUAL_DEVICE_PLANNING_ONLY');
  return { allowed: true, simulatedOnly: true, physicalConnectionAllowed: false, actuationEnabled: false };
}
export function listVirtualDeviceProfiles() { return Object.keys(profiles).map(resolveVirtualDeviceProfile); }
