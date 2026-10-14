import {esc} from '../core/api.js';

export function page(title,subtitle='',eyebrow='ON MISSION'){
  return `<header class="onm-page-head"><div class="onm-page-head-copy"><div class="onm-eyebrow">${esc(eyebrow)}</div><h1>${esc(title)}</h1><p>${esc(subtitle)}</p></div></header>`;
}
export function card(content,cls=''){return `<section class="onm-surface onm-card ${cls}">${content}</section>`;}
export function empty(text){return `<div class="onm-state onm-state-empty"><p>${esc(text)}</p></div>`;}
export function loading(text='Loading…'){return `<div class="onm-state onm-state-loading" role="status">${esc(text)}</div>`;}
export function unavailable(message='This workspace is temporarily unavailable.',retryId='retryWorkspace'){
  return `<section class="onm-state onm-state-error" role="alert"><div class="onm-eyebrow">AUTHORITY UNAVAILABLE</div><h2>Workspace unavailable</h2><p>${esc(message)}</p><div class="onm-state-actions"><button class="onm-btn onm-btn-primary" id="${esc(retryId)}">RETRY</button></div></section>`;
}
export function degraded(message='Some optional data is unavailable. Canonical state remains authoritative.',retryId='retryWorkspace'){
  return `<section class="onm-state onm-state-degraded" role="status"><div class="onm-eyebrow">DEGRADED</div><h2>Some context is unavailable</h2><p>${esc(message)}</p><div class="onm-state-actions"><button class="onm-btn" id="${esc(retryId)}">REFRESH</button></div></section>`;
}
export function listRow(title,detail='',status=''){return `<div class="onm-list-row"><span><strong>${esc(title)}</strong><small>${esc(detail)}</small></span>${status?`<span class="onm-chip">${esc(status)}</span>`:''}</div>`;}
