/**
 * Read-only launch control projection. It composes existing canonical workbench,
 * authority-health and evidence records; it never writes market or release state.
 */
const HUMAN_PREFIXES = ['legal:', 'content:'];
const HUMAN_KEYS = new Set(['runtime-certification', 'mission-journey', 'publication-recovery']);
const PROOF_CASES = [
  ['tenant-isolation', 'Cross-tenant isolation'],
  ['authorization', 'Authorization and step-up'],
  ['assignment', 'Assignment integrity'],
  ['execution', 'Controlled execution'],
  ['effects', 'Recorded mission effects'],
  ['independent-verification', 'Independent effect verification'],
  ['failure-containment', 'Failure containment'],
  ['recovery', 'Recovery and reconciliation']
];
const RELEASE_GATES = [
  ['canonical-preparation', 'Canonical preparation'],
  ['human-approvals', 'Human approvals'],
  ['mission-proof', 'End-to-end mission proof'],
  ['immutable-validation', 'Immutable package validation'],
  ['publication', 'Authorized publication'],
  ['verification', 'Post-publication verification'],
  ['activation', 'Market activation'],
  ['onboarding', 'Public onboarding']
];
const upper = value => String(value ?? 'UNKNOWN').toUpperCase();
const verifiedTask = task => upper(task?.status) === 'COMPLETE' && !String(task?.gate || '').trim() && task?.evidence && typeof task.evidence === 'object' && Object.keys(task.evidence).length > 0;
const humanTask = task => HUMAN_PREFIXES.some(prefix => String(task?.key || '').startsWith(prefix)) || String(task?.key || '').startsWith('integration:') || HUMAN_KEYS.has(String(task?.key || ''));
const taskStatus = task => String(task?.gate || '').trim() ? (humanTask(task) ? 'HUMAN_INPUT_REQUIRED' : 'BLOCKED') : verifiedTask(task) ? 'VERIFIED' : humanTask(task) ? 'HUMAN_INPUT_REQUIRED' : 'SYSTEM_ACTION_REQUIRED';
const evidenceRef = value => String(value ?? '').trim().length >= 6;

function proofMatrix(runtimeEvidence) {
  // Never accept proof assertions from editable workbench task evidence. Only a
  // separately supplied trusted runtime-certifier result can satisfy these gates.
  const cases = runtimeEvidence?.proofCases && typeof runtimeEvidence.proofCases === 'object' ? runtimeEvidence.proofCases : {};
  return PROOF_CASES.map(([key, title]) => {
    const item = cases[key];
    const passed = item?.verified === true && evidenceRef(item.evidenceRef) && item.observedAt && item.source;
    return { key, title, status: passed ? 'EVIDENCE_ATTACHED' : 'EVIDENCE_REQUIRED', evidenceRef: passed ? String(item.evidenceRef) : null, observedAt: passed ? String(item.observedAt) : null, source: passed ? String(item.source) : null };
  });
}

function preparation(workbench) {
  const preview = workbench.preview || {};
  const rows = Array.isArray(preview.operations) ? preview.operations : Array.isArray(preview.resources) ? preview.resources : Array.isArray(preview.items) ? preview.items : [];
  const conflicts = Array.isArray(preview.conflicts) ? preview.conflicts.length : Number(preview.conflictCount || 0);
  const count = (names) => rows.filter(row => names.includes(upper(row.operation || row.status || row.disposition || row.action))).length;
  return {
    inspected: rows.length,
    create: count(['CREATE', 'MISSING', 'CREATE_REQUIRED']),
    reuse: count(['REUSE', 'EXISTS', 'LINKED', 'READY']),
    review: count(['UPDATE', 'REVIEW', 'CHANGE_REVIEW', 'APPROVAL_REQUIRED']),
    conflicts,
    safeToApply: preview.safeToApply === true && conflicts === 0,
    note: 'Counts are a projection of the workbench preview; the canonical resource owner remains authoritative.'
  };
}

function externalDependencies(tasks) {
  return tasks.filter(t => /^(legal:|content:)|provider|runtime-certification|mission-journey|publication-recovery|residency|backup|restore/i.test(`${t.key || ''} ${t.title || ''}`)).map(t => ({
    key: t.key, title: t.title || t.key, status: taskStatus(t), owner: humanTask(t) ? 'Named human reviewer / evidence provider' : 'Owning platform or provider authority',
    dueAt: t.dueAt || t.due_at || null, evidenceRequired: t.evidence?.required || t.description || 'Authority-issued evidence and a canonical read-back are required.',
    blocker: String(t.gate || '') || null
  }));
}

export function buildMarketLaunchControl({ market = {}, workbench = {}, authorityHealth = { status: 'UNKNOWN', unavailable: [] }, runtimeEvidence = null } = {}) {
  const tasks = Array.isArray(workbench.tasks) ? workbench.tasks : [];
  const marketStatus = upper(market.status || workbench.marketStatus);
  const packageStatus = upper(market.packageStatus || workbench.packageStatus);
  const unavailable = Array.isArray(authorityHealth.unavailable) ? authorityHealth.unavailable : [];
  const prep = preparation(workbench);
  const conflicts = prep.conflicts;
  const taskRegister = tasks.map(task => ({ key: task.key, title: task.title || task.key, status: taskStatus(task), owner: humanTask(task) ? 'Human reviewer / evidence provider' : 'Canonical launch workflow', reason: String(task.gate || (!verifiedTask(task) ? 'Required evidence has not yet been verified by the owning authority.' : 'Verified evidence recorded.')), evidenceRequired: task.description || 'Complete the governed task and refresh canonical state.' }));
  let status = 'IN_PROGRESS', nextAction = null, stopReason = null;
  if (['SUSPENDED', 'RETIRED'].includes(marketStatus)) { status = 'BLOCKED'; stopReason = `Market lifecycle is ${marketStatus}; resolve it through the governed lifecycle.`; }
  else if (unavailable.length) { status = 'WAITING_CANONICAL_AUTHORITY'; stopReason = 'Canonical authority unavailable; unknown state is not treated as ready.'; }
  else if (conflicts > 0) { status = 'BLOCKED'; stopReason = 'Canonical resource reconciliation conflicts must be resolved by their owning authorities.'; }
  else {
    const next = tasks.find(task => !verifiedTask(task));
    if (next) {
      const state = taskStatus(next);
      nextAction = { taskKey: next.key, title: next.title || next.key, owner: humanTask(next) ? 'Human reviewer / evidence provider' : 'Canonical launch workflow', mode: state === 'HUMAN_INPUT_REQUIRED' ? 'REQUEST_INPUT_OR_REVIEW' : state === 'BLOCKED' ? 'RESOLVE_BLOCKER' : 'RUN_GOVERNED_STEP', reason: String(next.gate || 'Continue through the canonical authority, then refresh this assessment.'), evidenceRequired: next.description || 'Canonical read-back and evidence required.' };
      status = state === 'BLOCKED' ? 'BLOCKED' : state === 'HUMAN_INPUT_REQUIRED' ? 'WAITING_FOR_USER' : 'READY_TO_CONTINUE';
      if (state === 'BLOCKED') stopReason = nextAction.reason;
    } else {
      const runtimeVerified = runtimeEvidence?.verified === true && runtimeEvidence?.source && runtimeEvidence?.observedAt;
      if (!runtimeVerified) { status = 'WAITING_FOR_RUNTIME_EVIDENCE'; stopReason = 'Workbench tasks are complete, but independent runtime certification evidence is missing.'; }
      else if (!['VERIFIED', 'PUBLISHED', 'LIVE'].includes(packageStatus)) { status = 'READY_FOR_GOVERNED_VALIDATION'; nextAction = { taskKey: 'validate-release', title: 'Validate the immutable package version', owner: 'Market Factory', mode: 'RUN_GOVERNED_STEP', reason: 'Invoke the existing version validation lifecycle and honor its blockers.' }; }
      else { status = 'WAITING_FOR_AUTHORIZED_RELEASE_TRANSITION'; stopReason = 'Publication, verification, activation and onboarding remain separate authorized transitions.'; }
    }
  }
  const proof = proofMatrix(runtimeEvidence);
  const operationStage = upper(workbench.publicationOperation?.stage);
  const onboardingMode = upper(workbench.onboardingMode || workbench.onboardingStatus);
  const onboardingReady = ['OPEN', 'INVITE_ONLY'].includes(onboardingMode) && marketStatus === 'LIVE';
  const humanTasks = taskRegister.filter(t => HUMAN_PREFIXES.some(prefix => String(t.key || '').startsWith(prefix)));
  const approvalsReady = humanTasks.every(t => t.status === 'VERIFIED');
  const validationReady = ['VERIFIED', 'PUBLISHED', 'LIVE'].includes(packageStatus);
  const publicationReady = ['PUBLISHED', 'VERIFIED', 'LIVE'].includes(packageStatus) || ['PUBLISHED_WAITING_VERIFICATION', 'VERIFIED_WAITING_ACTIVATION', 'LIVE'].includes(operationStage);
  const verificationReady = ['VERIFIED', 'LIVE'].includes(packageStatus) || ['VERIFIED_WAITING_ACTIVATION', 'LIVE'].includes(operationStage);
  const releaseGates = RELEASE_GATES.map(([key, title]) => {
    let gateStatus = 'NOT_CERTIFIED';
    if (key === 'canonical-preparation') gateStatus = prep.safeToApply && taskRegister.every(t => t.status === 'VERIFIED') ? 'COMPLETE' : prep.safeToApply ? 'READY_FOR_AUTHORIZED_STEP' : 'NOT_CERTIFIED';
    if (key === 'human-approvals') gateStatus = approvalsReady ? 'COMPLETE' : 'APPROVAL_REQUIRED';
    if (key === 'mission-proof') gateStatus = proof.every(p => p.status === 'EVIDENCE_ATTACHED') ? 'EVIDENCE_ATTACHED' : 'EVIDENCE_REQUIRED';
    if (key === 'immutable-validation') gateStatus = validationReady ? 'COMPLETE' : 'NOT_CERTIFIED';
    if (key === 'publication') gateStatus = publicationReady ? 'COMPLETE' : 'NOT_CERTIFIED';
    if (key === 'verification') gateStatus = verificationReady ? 'COMPLETE' : 'NOT_CERTIFIED';
    if (key === 'activation') gateStatus = marketStatus === 'LIVE' && packageStatus === 'LIVE' ? 'COMPLETE' : 'NOT_CERTIFIED';
    if (key === 'onboarding') gateStatus = onboardingReady ? 'COMPLETE' : 'NOT_CERTIFIED';
    return { key, title, status: gateStatus };
  });
  const counts = taskRegister.reduce((a, t) => { a.total++; a[t.status] = (a[t.status] || 0) + 1; return a; }, { total: 0, VERIFIED: 0, BLOCKED: 0, HUMAN_INPUT_REQUIRED: 0, SYSTEM_ACTION_REQUIRED: 0 });
  const complete = marketStatus === 'LIVE' && packageStatus === 'LIVE' && onboardingReady && taskRegister.every(t => t.status === 'VERIFIED') && proof.every(p => p.status === 'EVIDENCE_ATTACHED') && runtimeEvidence?.verified === true && unavailable.length === 0 && conflicts === 0 && releaseGates.every(g => ['COMPLETE', 'EVIDENCE_ATTACHED'].includes(g.status));
  if (complete) { status = 'COMPLETE'; nextAction = null; stopReason = 'Market, package, onboarding and independent proof gates are verified.'; }
  return { schemaVersion: 2, mode: 'CONTROLLED_CONTINUATION', readOnly: true, status, marketStatus, packageStatus, nextAction, stopReason, counts, tasks: taskRegister, preparation: prep, externalDependencies: externalDependencies(tasks), missionProof: { status: proof.every(p => p.status === 'EVIDENCE_ATTACHED') ? 'EVIDENCE_ATTACHED' : 'EVIDENCE_REQUIRED', cases: proof }, releaseGates, authorityHealth: { status: upper(authorityHealth.status), unavailableCount: unavailable.length }, reconciliation: { conflictCount: conflicts, safeToApply: prep.safeToApply }, completionRule: 'COMPLETE only with LIVE market and package, OPEN onboarding, all canonical tasks verified, all eight proof cases evidenced, independent runtime evidence, healthy authorities and zero conflicts. A readiness score is not certification.', assessedAt: new Date().toISOString() };
}
