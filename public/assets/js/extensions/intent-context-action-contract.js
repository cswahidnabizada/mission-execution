/* ON Mission 10.17.4-H1 — Context → Action Contract
 * Presentation-only bridge to one existing valid action. No execution authority.
 */
const text = v => String(v ?? '').trim();
const num = v => Number(v || 0) || 0;

const ACTIONS = Object.freeze({
  intake: Object.freeze({ Request:'Review' }),
  operate: Object.freeze({ Mission:'Continue' }),
  act: Object.freeze({ Mission:'Open' }),
  find: Object.freeze({ People:'Find', Mission:'Find', Opportunity:'Review', Request:'Review' }),
  marketplace: Object.freeze({ Opportunity:'Review' })
});
const FALLBACK = Object.freeze({ Request:'Review', Mission:'Open', People:'Find', Opportunity:'Review' });

function resolveAction(context = {}) {
  const object = text(context.object);
  const intent = text(context.intent).toLowerCase();
  const requested = text(context.action);
  const allowed = ACTIONS[intent]?.[object] || FALLBACK[object] || '';
  if (!allowed) return null;
  return requested === allowed ? requested : allowed;
}

export function buildIntentContextAction(context = {}) {
  if (!context?.visible || !context?.object) return Object.freeze({ version:'10.17.4-H1', visible:false, action:null, target:null });
  const action = resolveAction(context);
  if (!action) return Object.freeze({ version:'10.17.4-H1', visible:false, action:null, target:null });
  const target = Object.freeze({ missionId:num(context.target?.missionId)||null, requestId:num(context.target?.requestId)||null, opportunityId:num(context.target?.opportunityId)||null });
  return Object.freeze({ version:'10.17.4-H1', visible:true, intent:text(context.intent).toLowerCase()||null, navigation:text(context.navigation)||'operations', scope:text(context.scope)||null, object:text(context.object), action, target,
    safety:Object.freeze({ readOnly:true, createsTruth:false, createsAuthorization:false, createsAction:false, executesAction:false, changesResponsibility:false, changesCustody:false }) });
}
export { ACTIONS };
