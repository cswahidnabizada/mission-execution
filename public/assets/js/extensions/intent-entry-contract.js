import {RELEASE_VERSION} from "/assets/js/core/release.js";
/* ON Mission 10.17 — Intent Entry Contract
 * Presentation-only entry surface. The user chooses what they want to do and starts.
 * Existing workspaces/services remain authoritative destinations.
 */
const LABELS = Object.freeze({
  intake: 'Receive',
  operate: 'Operate',
  act: 'Act',
  find: 'Find',
  marketplace: 'Find Work'
});
const DESCRIPTIONS = Object.freeze({
  intake: 'Review incoming requests and shared work.',
  operate: 'Continue work that is already in progress.',
  act: 'Handle the item that needs your attention now.',
  find: 'Find people, missions, or available work.',
  marketplace: 'Find available execution opportunities.'
});
const text = v => String(v ?? '').trim();

export function buildIntentEntry(model = null) {
  const intents = Array.isArray(model?.intents) ? model.intents : [];
  const next = text(model?.nextIntent).toLowerCase();
  const items = intents.map(key => ({
    id: key,
    label: LABELS[key] || key,
    description: DESCRIPTIONS[key] || 'Open this part of your work.',
    next: key === next
  }));
  return Object.freeze({
    version: RELEASE_VERSION,
    visible: items.length > 0,
    title: 'What do you want to do?',
    items: Object.freeze(items),
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

export { LABELS, DESCRIPTIONS };
