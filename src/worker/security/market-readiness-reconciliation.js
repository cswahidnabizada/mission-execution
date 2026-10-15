/**
 * Read-only classification for Market Factory reconciliation previews.
 * This module never writes canonical records and never declares a market LIVE.
 */
const domainOwner = Object.freeze({
  country: 'Product Country Catalog', sector: 'Reusable Sector Catalog',
  policy: 'Reusable Policy Catalog', content: 'Reusable Content Catalog',
  language: 'Reusable Language Catalog', jurisdiction: 'Jurisdiction Governance',
  residency: 'Residency Governance', sectorPolicy: 'Sector Policy Registry',
  retention: 'Retention Policy Registry', billing: 'Billing Jurisdiction Registry',
  notification: 'Notification Policy Registry'
});

function conflictCategory(code = '') {
  const value = String(code).toUpperCase();
  if (value.includes('SCOPE')) return 'SCOPE_CONFLICT';
  if (value.includes('DRIFT') || value.includes('LABEL')) return 'CANONICAL_DRIFT';
  if (value.includes('VERSION')) return 'VERSION_MISMATCH';
  return 'CANONICAL_CONFLICT';
}

export function classifyMarketReadiness({ operations = [], conflicts = [] } = {}) {
  const byIdentity = new Map();
  for (const conflict of conflicts) {
    const key = `${conflict.domain || ''}:${conflict.identity || ''}`;
    byIdentity.set(key, conflict);
  }
  const issues = [];
  for (const operation of operations) {
    const identityKey = `${operation.domain || ''}:${operation.identity || ''}`;
    const conflict = byIdentity.get(identityKey) || conflicts.find(item => String(item.identity) === String(operation.identity));
    if (conflict) {
      issues.push({
        code: conflict.code || 'MARKET_CANONICAL_CONFLICT', identity: operation.identity,
        domain: operation.domain, category: conflictCategory(conflict.code), state: 'BLOCKED',
        owner: domainOwner[operation.domain] || 'Owning canonical authority',
        nextStep: 'Resolve the conflict in the owning authority, or revise the draft to match canonical truth; then regenerate this preview.',
        message: conflict.message
      });
    } else if (operation.operation === 'CREATE') {
      issues.push({
        code: `MARKET_${String(operation.domain || 'RESOURCE').toUpperCase()}_MISSING`, identity: operation.identity,
        domain: operation.domain, category: 'MISSING_CONFIGURATION', state: 'REQUIRES_GOVERNED_CREATE',
        owner: domainOwner[operation.domain] || 'Owning canonical authority',
        nextStep: 'Confirm the proposed values and create through the owning governed workflow. Previewing alone does not create records.',
        message: `Canonical ${operation.domain || 'resource'} ${operation.identity} does not exist yet.`
      });
    } else if (operation.operation === 'UPDATE') {
      issues.push({
        code: `MARKET_${String(operation.domain || 'RESOURCE').toUpperCase()}_CHANGE_REVIEW`, identity: operation.identity,
        domain: operation.domain, category: 'CHANGE_REVIEW', state: 'HUMAN_REVIEW_REQUIRED',
        owner: domainOwner[operation.domain] || 'Owning canonical authority',
        nextStep: 'Review the difference and use the owning authority’s governed change workflow; do not overwrite canonical values from this preview.',
        message: `Canonical ${operation.domain || 'resource'} ${operation.identity} differs from the requested package values.`
      });
    }
  }
  const counts = issues.reduce((acc, issue) => {
    acc.total += 1;
    acc[issue.state] = (acc[issue.state] || 0) + 1;
    acc[issue.category] = (acc[issue.category] || 0) + 1;
    return acc;
  }, { total: 0, BLOCKED: 0, REQUIRES_GOVERNED_CREATE: 0, HUMAN_REVIEW_REQUIRED: 0 });
  return { issues, counts, safeToApply: conflicts.length === 0, readOnly: true };
}
