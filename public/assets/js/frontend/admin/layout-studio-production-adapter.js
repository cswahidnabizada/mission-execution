/**
 * ON MISSION Layout Studio production-route adapter boundary.
 * This module deliberately does not apply draft/localStorage content to production.
 * Only a canonical server release runtime may provide a verified immutable layout.
 */
const ROUTES = new Set([
  'public-homepage', 'registration', 'organization-setup',
  'mission-workspace', 'executor-workspace', 'tenant-workspace'
]);
const ADAPTER_VERSION = '16.10.89';

export function resolveLayoutStudioRoute({ pathname = location.pathname, hash = location.hash, role = '' } = {}) {
  if (pathname === '/' || pathname === '/index.html') return 'public-homepage';
  if (pathname === '/register.html') return 'registration';
  if (pathname === '/app/' || pathname === '/app') {
    const key = String(hash || '').replace(/^#/, '').split('?')[0] || 'home';
    const query = new URLSearchParams(String(hash || '').split('?')[1] || '');
    if (key === 'account' && query.get('activation') === '1') return 'organization-setup';
    if (['executor', 'driver'].includes(String(role).toLowerCase())) return 'executor-workspace';
    if (key === 'work') return 'mission-workspace';
    return 'tenant-workspace';
  }
  // Legacy URLs intentionally resolve to the canonical /app renderer via redirect.
  if (pathname === '/missions.html') return 'mission-workspace';
  if (pathname === '/driver/dashboard.html' || pathname === '/driver/') return 'executor-workspace';
  return null;
}

export function attachLayoutStudioRouteAdapter({ root, routeId, getRouteId, role = '' } = {}) {
  if (!root || typeof root.setAttribute !== 'function') return { status: 'UNAVAILABLE', dispose() {} };
  let active = true;
  const update = () => {
    if (!active) return;
    const next = typeof getRouteId === 'function' ? getRouteId() : routeId;
    if (!ROUTES.has(next)) return;
    root.setAttribute('data-onm-layout-route', next);
    root.setAttribute('data-onm-layout-adapter', ADAPTER_VERSION);
    root.setAttribute('data-onm-layout-mode', 'CANONICAL_RENDERER_PRESERVED');
    if (root === document.body) document.documentElement.setAttribute('data-onm-layout-route', next);
  };
  update();
  const observer = typeof MutationObserver !== 'undefined'
    ? new MutationObserver(update) : null;
  if (observer) observer.observe(root, { childList: true, subtree: true });
  const onNavigation = () => update();
  window.addEventListener('hashchange', onNavigation);
  window.addEventListener('popstate', onNavigation);
  return {
    status: 'ADAPTER_INSTALLED_RENDERER_PRESERVED',
    version: ADAPTER_VERSION,
    dispose() { active = false; observer?.disconnect(); window.removeEventListener('hashchange', onNavigation); window.removeEventListener('popstate', onNavigation); }
  };
}

/**
 * Production composition application is intentionally denied until a canonical
 * release runtime injects an immutable, verified artifact and route binding.
 */
export function applyVerifiedLayoutRelease({ routeId, release } = {}) {
  if (!ROUTES.has(routeId)) return { applied: false, reason: 'ROUTE_NOT_ALLOWLISTED' };
  if (!release || release.authority !== 'CANONICAL_RELEASE_LIFECYCLE' ||
      release.state !== 'VERIFIED' || release.immutable !== true ||
      release.routeId !== routeId || typeof release.contentSha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(release.contentSha256)) {
    return { applied: false, reason: 'VERIFIED_CANONICAL_RELEASE_REQUIRED' };
  }
  // No DOM replacement here: a route-specific renderer adapter must be certified
  // before the release lifecycle can activate composition on that route.
  return { applied: false, reason: 'ROUTE_RENDERER_PARITY_NOT_CERTIFIED' };
}
