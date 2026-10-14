export const APP_TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

export function todayLocal() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const get = type => parts.find(part => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function parseTimestamp(value) {
  if (!value) return null;
  const raw = String(value).trim();
  const normalized = raw.includes("T") ? raw : raw.replace(" ", "T");
  const zoned = /Z$|[+-]\d\d:\d\d$/.test(normalized) ? normalized : `${normalized}Z`;
  const date = new Date(zoned);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function timestampMs(value) {
  return parseTimestamp(value)?.getTime() || 0;
}

export function formatDateTime(value) {
  const date = parseTimestamp(value);
  if (!date) return value ? String(value) : "-";
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: APP_TIME_ZONE,
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

export function formatDate(value) {
  const date = parseTimestamp(value);
  if (!date) return value ? String(value) : "-";
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: APP_TIME_ZONE,
    dateStyle: "medium"
  }).format(date);
}

export function formatTime(value) {
  const date = parseTimestamp(value);
  if (!date) return "-";
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: APP_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

export function formatRelativeTime(value, now = Date.now()) {
  const date = parseTimestamp(value);
  if (!date) return "Never";
  const diff = Math.max(0, now - date.getTime());
  const totalMinutes = Math.floor(diff / 60000);
  if (totalMinutes < 1) return "just now";
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m ago`;
  return `${hours}h ${minutes}m ago`;
}


export function dateKeyLocal(value) {
  const date = parseTimestamp(value);
  if (!date) return "";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const get = type => parts.find(part => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function slashDate(value) {
  if (!value) return "";
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  const key = dateKeyLocal(value);
  if (!key) return "";
  const [y,m,d] = key.split("-");
  return `${d}/${m}/${y}`;
}

export function searchDateToIso(value) {
  const raw=String(value||"").trim();
  if(/^\d{4}-\d{2}-\d{2}$/.test(raw))return raw;
  const match=raw.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})$/);
  if(!match)return "";
  const day=String(Number(match[1])).padStart(2,"0"),month=String(Number(match[2])).padStart(2,"0");
  return `${match[3]}-${month}-${day}`;
}
