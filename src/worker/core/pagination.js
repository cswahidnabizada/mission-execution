/** Canonical bounded pagination for user-visible list queries. */
export const PAGINATION_DEFAULT_LIMIT = 100;
export const PAGINATION_MAX_LIMIT = 200;
export const PAGINATION_MAX_OFFSET = 50000;

export function listWindow(filters = {}, { defaultLimit = PAGINATION_DEFAULT_LIMIT, maxLimit = PAGINATION_MAX_LIMIT } = {}) {
  const rawLimit = Number(filters?.limit);
  const rawOffset = Number(filters?.offset);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), maxLimit) : Math.min(defaultLimit, maxLimit);
  const offset = Number.isFinite(rawOffset) && rawOffset >= 0 ? Math.min(Math.floor(rawOffset), PAGINATION_MAX_OFFSET) : 0;
  return { limit, offset };
}

export function trimPage(rows, { limit, offset } = {}) {
  const source = Array.isArray(rows) ? rows : [];
  const safeLimit = Math.max(1, Number(limit) || PAGINATION_DEFAULT_LIMIT);
  const safeOffset = Math.max(0, Number(offset) || 0);
  const page = source.slice(0, safeLimit);
  return { rows: page, hasMore: source.length > safeLimit, nextOffset: source.length > safeLimit ? safeOffset + safeLimit : null };
}
