/**
 * ON MISSION Layout Studio composition renderer contract.
 * Renders only approved component types and escaped scalar properties.
 * This is the canonical Studio-preview renderer; production-route bindings remain a separate gate.
 */
export const STUDIO_RENDERER_VERSION = '16.10.75';

const SAFE_INTERNAL_ROUTES = new Set(['/','/register.html','/driver/','/login.html','/status.html','/app/','/missions.html']);
export function isSafeInternalRoute(href) { return typeof href === 'string' && SAFE_INTERNAL_ROUTES.has(href); }
export const COMPONENT_RENDERERS = Object.freeze({
  header: { label: 'Header', properties: ['label', 'density'] },
  footer: { label: 'Footer', properties: ['label'] },
  hero: { label: 'Hero', properties: ['eyebrow', 'title', 'description', 'cta', 'href'] },
  section: { label: 'Section', properties: ['label', 'title', 'description'] },
  card: { label: 'Card', properties: ['label', 'title', 'state', 'description'] },
  button: { label: 'Button', properties: ['label', 'variant', 'href'] },
  badge: { label: 'Badge', properties: ['label', 'tone'] },
  input: { label: 'Input', properties: ['label', 'placeholder'] },
  table: { label: 'Table', properties: ['label', 'description'] },
  dialog: { label: 'Dialog', properties: ['label', 'description'] },
  navigation: { label: 'Navigation', properties: ['label'] },
  'mission-list': { label: 'Mission list', properties: ['label', 'description'] },
  'evidence-panel': { label: 'Evidence panel', properties: ['label', 'description'] },
  'status-panel': { label: 'Status panel', properties: ['label', 'state', 'description'] },
  progress: { label: 'Progress', properties: ['label', 'state'] }
});

export function escapeMarkup(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

const value = (properties, key, fallback = '') => escapeMarkup(properties?.[key] ?? fallback);

export function renderComponent(component, options = {}) {
  if (!component || typeof component !== 'object' || Array.isArray(component)) return '';
  const definition = COMPONENT_RENDERERS[component.type];
  if (!definition) return `<div class="ls-renderer-unsupported" role="status">Unsupported component type: ${escapeMarkup(component.type || 'unknown')}</div>`;
  const p = component.properties && typeof component.properties === 'object' && !Array.isArray(component.properties) ? component.properties : {};
  const id = escapeMarkup(component.id || 'component');
  switch (component.type) {
    case 'header': return options.mode === 'production' ? `<header class="ls-render ls-render-header" data-component-id="${id}"><a class="ls-render-brand" href="/"><strong>${value(p, 'label', 'ON MISSION')}</strong></a><nav aria-label="Primary"><a href="/status.html">Product status</a><a href="/login.html">Sign in</a></nav></header>` : `<header class="ls-render ls-render-header" data-component-id="${id}"><strong>${value(p, 'label', 'ON MISSION')}</strong><span>Workspace · Help</span></header>`;
    case 'footer': return `<footer class="ls-render ls-render-footer" data-component-id="${id}">${value(p, 'label')}</footer>`;
    case 'hero': { const action = options.mode === 'production' && isSafeInternalRoute(p.href) ? `<a class="ls-render-button" href="${escapeMarkup(p.href)}">${value(p, 'cta', 'Continue')} <span aria-hidden="true">→</span></a>` : `<button type="button" class="ls-render-button" disabled>${value(p, 'cta', 'Continue')} <span aria-hidden="true">→</span></button>`; return `<section class="ls-render ls-render-hero" data-component-id="${id}"><small>${value(p, 'eyebrow')}</small><h2>${value(p, 'title', 'Your next mission')}</h2><p>${value(p, 'description')}</p>${action}</section>`; }
    case 'button': { const action = options.mode === 'production' && isSafeInternalRoute(p.href) ? `<a class="ls-render-button" href="${escapeMarkup(p.href)}">${value(p, 'label', 'Action')}</a>` : `<button type="button" class="ls-render-button" disabled>${value(p, 'label', 'Action')}</button>`; return `<div class="ls-render" data-component-id="${id}">${action}</div>`; }
    case 'badge': return `<div class="ls-render" data-component-id="${id}"><span class="ls-render-badge">${value(p, 'label', 'STATUS')}</span></div>`;
    case 'input': return `<label class="ls-render ls-render-field" data-component-id="${id}"><span>${value(p, 'label', 'Field')}</span><input disabled placeholder="${value(p, 'placeholder', 'Preview only')}" /></label>`;
    case 'navigation': return `<nav class="ls-render ls-render-navigation" aria-label="Preview navigation" data-component-id="${id}"><strong>${value(p, 'label', 'Navigation')}</strong><span>Overview</span><span>Missions</span><span>Evidence</span></nav>`;
    case 'table': return `<section class="ls-render ls-render-card" data-component-id="${id}"><h3>${value(p, 'label', 'Data table')}</h3><p>${value(p, 'description', 'Table content is represented in preview.')}</p><div class="ls-render-skeleton" aria-hidden="true"></div></section>`;
    case 'dialog': return `<section class="ls-render ls-render-dialog" role="group" aria-label="Dialog preview" data-component-id="${id}"><strong>${value(p, 'label', 'Dialog')}</strong><p>${value(p, 'description')}</p><span class="ls-render-muted">Interaction disabled in draft preview</span></section>`;
    case 'mission-list': return `<section class="ls-render ls-render-card" data-component-id="${id}"><h3>${value(p, 'label', 'Missions')}</h3><p>${value(p, 'description', 'Canonical mission data is not loaded into design preview.')}</p><ul><li>Waiting for authorization</li><li>Ready for execution</li><li>Evidence review</li></ul></section>`;
    case 'evidence-panel': return `<section class="ls-render ls-render-card" data-component-id="${id}"><h3>${value(p, 'label', 'Evidence')}</h3><p>${value(p, 'description', 'Evidence is represented; no evidence is created by preview.')}</p><span class="ls-render-muted">No evidence mutation</span></section>`;
    case 'status-panel': return `<section class="ls-render ls-render-card ls-render-status" data-component-id="${id}"><h3>${value(p, 'label', 'Mission status')}</h3><span class="ls-render-badge">${value(p, 'state', 'DRAFT')}</span><p>${value(p, 'description')}</p></section>`;
    case 'progress': return `<section class="ls-render ls-render-card" data-component-id="${id}"><h3>${value(p, 'label', 'Progress')}</h3><div class="ls-render-progress" role="img" aria-label="Illustrative progress preview"><span></span></div><small>${value(p, 'state', 'Illustrative only')}</small></section>`;
    case 'section':
    case 'card': return `<section class="ls-render ls-render-card" data-component-id="${id}">${p.label ? `<small class="ls-render-eyebrow">${value(p, 'label')}</small>` : ''}<h3>${value(p, 'title', p.label || definition.label)}</h3><p>${value(p, 'description')}</p>${p.state !== undefined ? `<span class="ls-render-badge">${value(p, 'state')}</span>` : ''}</section>`;
    default: return `<div class="ls-renderer-unsupported" role="status">Renderer unavailable</div>`;
  }
}

export function resolvePageComponents(page, components) {
  if (!page || !Array.isArray(page.componentIds) || !Array.isArray(components)) return [];
  const byId = new Map(components.map(component => [component?.id, component]));
  return page.componentIds.map(id => byId.get(id)).filter(Boolean);
}

export function renderPage(page, components, options = {}) {
  if (!page || !Array.isArray(page.componentIds) || !Array.isArray(components)) return '<p class="ls-renderer-empty">Select a valid page composition.</p>';
  const byId = new Map(components.map(component => [component?.id, component]));
  const parts = page.componentIds.map(id => {
    const component = byId.get(id);
    if (!component) return `<div class="ls-renderer-unsupported" role="status">Missing component reference: ${escapeMarkup(id)}</div>`;
    let markup = renderComponent(component, options);
    if (options.selectedComponentId === component.id) markup = markup.replace('class="ls-render', 'class="ls-render ls-selected-component');
    return markup;
  });
  const body = parts.join('') || '<p class="ls-renderer-empty">No components on this page.</p>';
  const marketLabel = options.marketCode && options.mode !== 'production' ? `<div class="ls-renderer-market">${escapeMarkup(options.marketCode)} · draft variant</div>` : '';
  return `${marketLabel}<main class="ls-renderer-page" data-page-id="${escapeMarkup(page.id || '')}">${body}</main>`;
}
