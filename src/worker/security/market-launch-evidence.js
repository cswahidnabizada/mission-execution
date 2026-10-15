/**
 * Evidence quality contract for market-launch workbench tasks.
 * User-entered text is a pointer/claim, not proof by itself; this gate rejects
 * obvious placeholders and generic completion assertions. Domain-specific
 * verification still has to be performed by the existing certification gates.
 */
const clean = (value, max = 2000) => String(value ?? '').trim().slice(0, max);
const PLACEHOLDER_REFERENCE = /^(?:test(?:\s+one)?|demo|sample|placeholder|todo|tbd|none|n\/?a|na|done|ok|resolved|fixed|complete|evidence)$/i;
const GENERIC_SUMMARY = /^(?:i\s+)?(?:resolved|completed|fixed|checked|reviewed|verified|done|finished|all good|everything is ready)(?:\s+the\s+market\s+lifecycle)?[.!\s]*$/i;

export function assessMarketLaunchEvidence(evidence = {}) {
  const summary = clean(evidence?.summary, 2000);
  const evidenceRef = clean(evidence?.evidenceRef, 1000);
  const reasons = [];
  if (summary.length < 20) reasons.push('summary_too_short');
  if (GENERIC_SUMMARY.test(summary)) reasons.push('summary_is_generic');
  if (evidenceRef.length < 6) reasons.push('reference_too_short');
  if (PLACEHOLDER_REFERENCE.test(evidenceRef)) reasons.push('reference_is_placeholder');
  if (/^(?:https?:\/\/)?(?:example\.com|localhost)(?:\/|$)/i.test(evidenceRef)) reasons.push('reference_is_example');
  return { valid: reasons.length === 0, reasons, summaryLength: summary.length, referenceLength: evidenceRef.length };
}

export function requireMarketLaunchEvidence(evidence = {}) {
  const assessment = assessMarketLaunchEvidence(evidence);
  if (!assessment.valid) {
    const error = new Error(`Launch evidence is insufficient: ${assessment.reasons.join(', ')}.`);
    error.status = 422;
    error.code = 'MARKET_LAUNCH_EVIDENCE_QUALITY_INSUFFICIENT';
    error.details = assessment;
    throw error;
  }
  return assessment;
}
