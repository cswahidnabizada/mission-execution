/* ON Mission 10.17.5-H1 — Journey Integrity Hardening
 * Presentation-only continuity from Intent → Object → Context → Action → Result.
 * Results are tied to the selected object's before/after read-only snapshot.
 */
const text = v => String(v ?? '').trim();
const num = v => Number(v || 0) || 0;
const normalizeStatus = v => text(v).toLowerCase();
const hashable = v => JSON.stringify(v ?? null);

function requestRows(data = {}) {
  return [
    ...(data?.requests?.pending || []),
    ...(data?.requests?.items || []),
    ...(data?.operation?.collaboration?.pendingRequests || [])
  ];
}
function missionRows(data = {}) { return Array.isArray(data?.intelligence?.signals) ? data.intelligence.signals : []; }
function opportunityRows(data = {}) { return [...(data?.marketplace?.opportunities || []), ...(data?.marketplace?.items || [])]; }

function targetRecord(object, target, data) {
  if (object === 'Request') {
    const id = num(target?.requestId);
    const row = requestRows(data).find(x => num(x?.id || x?.requestId || x?.request_id) === id);
    return row ? { id, status: normalizeStatus(row.status || 'pending'), reference: text(row.reference || row.title || row.missionReference), updatedAt: row.updatedAt || row.updated_at || null } : null;
  }
  if (object === 'Mission') {
    const id = num(target?.missionId);
    const row = missionRows(data).find(x => num(x?.missionId || x?.id) === id);
    return row ? { id, status: normalizeStatus(row.status || row.statusLabel), reference: text(row.reference || row.missionReference), reason: text(row.reason), score: num(row.score), updatedAt: row.updatedAt || row.updated_at || null } : null;
  }
  if (object === 'Opportunity') {
    const id = num(target?.opportunityId);
    const row = opportunityRows(data).find(x => num(x?.id || x?.opportunityId || x?.opportunity_id) === id);
    return row ? { id, status: normalizeStatus(row.status || 'available'), reference: text(row.reference || row.title), updatedAt: row.updatedAt || row.updated_at || null } : null;
  }
  if (object === 'People') return { id: null, status: 'available', reference: 'People' };
  return null;
}

function snapshot(object, target, data) {
  const record = targetRecord(object, target, data);
  return Object.freeze({ exists: Boolean(record), fingerprint: hashable(record), record: record ? Object.freeze(record) : null });
}

export function beginIntentJourney(action = {}, data = {}) {
  if (!action?.visible || !action?.action || !action?.object) return null;
  const target = Object.freeze({
    missionId: num(action.target?.missionId) || null,
    requestId: num(action.target?.requestId) || null,
    opportunityId: num(action.target?.opportunityId) || null
  });
  return Object.freeze({
    version: '10.17.5-H1', intent: text(action.intent).toLowerCase() || null,
    navigation: text(action.navigation) || 'operations', scope: text(action.scope) || null,
    object: text(action.object), action: text(action.action), target, started: true,
    before: snapshot(text(action.object), target, data),
    safety: Object.freeze({ readOnly:true, createsTruth:false, createsAuthorization:false, createsAction:false, executesAction:false, changesResponsibility:false, changesCustody:false })
  });
}

export function resolveIntentJourneyResult(journey, data = {}) {
  if (!journey?.started) return Object.freeze({ visible:false, state:'NONE', result:null, next:null });
  const after = snapshot(journey.object, journey.target, data);
  const before = journey.before || Object.freeze({ exists:false, fingerprint:null, record:null });
  const changed = before.fingerprint !== after.fingerprint;
  const disappeared = before.exists && !after.exists;
  let state = changed ? 'UPDATED' : 'UNCHANGED';
  if (disappeared) state = 'RESOLVED';

  let headline = `${journey.object} is unchanged`;
  let detail = `The latest ${journey.object.toLowerCase()} information is current.`;
  if (state === 'UPDATED') {
    headline = `${journey.object} updated`;
    detail = `The latest ${journey.object.toLowerCase()} information is now shown.`;
  } else if (state === 'RESOLVED') {
    headline = `${journey.object} resolved`;
    detail = `The selected ${journey.object.toLowerCase()} is no longer in the current view.`;
  }
  if (journey.object === 'People') {
    state = 'UNCHANGED'; headline = 'People'; detail = 'The People workspace is ready for your search.';
  }
  return Object.freeze({
    version:'10.17.5-H1', visible:true, state,
    result:Object.freeze({ headline, detail, changed, beforeExists:Boolean(before.exists), afterExists:Boolean(after.exists) }),
    next:null,
    target:journey.target
  });
}
