/* ON Mission 10.16 — Coordination Surface Boundary
 * Final presentation-only boundary for the 10.16 coordination surface.
 * Visible primary content is limited to Navigation → Scope → Object → Action.
 * Waiting On / Why are optional supporting context. Internal architecture
 * vocabulary and competing coordination surfaces are never part of this model.
 */

const text = value => String(value ?? '').trim();
const NAVIGATION_LABELS = Object.freeze({
  overview: 'Overview',
  operations: 'Operations',
  insights: 'Insights',
  marketplace: 'Marketplace'
});

const ALLOWED_PRIMARY = Object.freeze(['navigation', 'scope', 'object', 'action']);

export function buildCoordinationSurface(situation = null) {
  if (!situation?.action) return Object.freeze({ visible: false, primary: null, waitingOn: null, why: null });

  const navigationKey = text(situation.navigation).toLowerCase();
  const navigation = NAVIGATION_LABELS[navigationKey] || 'Operations';
  const primary = Object.freeze({
    navigation,
    scope: text(situation.scope) || 'Current',
    object: text(situation.object) || 'Item',
    action: text(situation.action?.label) || 'Open'
  });

  return Object.freeze({
    visible: true,
    primary,
    waitingOn: text(situation.waitingOn) || null,
    why: text(situation.reason) || null,
    allowedPrimary: ALLOWED_PRIMARY,
    safety: Object.freeze({
      readOnly: true,
      createsTruth: false,
      createsAuthorization: false,
      createsAction: false,
      executesAction: false,
      changesResponsibility: false,
      changesCustody: false
    })
  });
}

export { ALLOWED_PRIMARY, NAVIGATION_LABELS };
