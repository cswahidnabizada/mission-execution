export function json(data, status = 200, headers = {}) {
  const exposeError = Boolean(data && typeof data === "object" && data.publicError === true);
  const payload = (Number(status) >= 500 && data && typeof data === "object" && data.success === false && !exposeError)
    ? {...data,error:"Internal server error",details:undefined,code:undefined}
    : data;
  if (payload && typeof payload === "object" && Object.prototype.hasOwnProperty.call(payload,"publicError")) {
    const sanitized = {...payload};
    delete sanitized.publicError;
    return new Response(JSON.stringify(sanitized,(key,value)=>["state_lock_token","state_lock_at"].includes(key)?undefined:value), {
      status,
      headers: { "Content-Type": "application/json; charset=utf-8", ...headers }
    });
  }
  return new Response(JSON.stringify(payload,(key,value)=>["state_lock_token","state_lock_at"].includes(key)?undefined:value), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers }
  });
}

export const MAX_JSON_BODY_BYTES = 256 * 1024;

export async function readJson(request, maxBytes = MAX_JSON_BODY_BYTES) {
  const declared = Number(request.headers.get("Content-Length") || 0);
  if (declared > maxBytes) {
    const error = new Error("Request body is too large");
    error.status = 413;
    throw error;
  }
  try {
    const raw = await request.text();
    if (!raw.trim()) return {};
    if (new TextEncoder().encode(raw).byteLength > maxBytes) {
      const error = new Error("Request body is too large");
      error.status = 413;
      throw error;
    }
    return JSON.parse(raw);
  } catch (error) {
    if (error?.status === 413) throw error;
    throw new Error("Invalid JSON body");
  }
}


export function assertContentLength(request, maxBytes) {
  const declared = Number(request.headers.get("Content-Length") || 0);
  if (declared > Number(maxBytes)) {
    const error = new Error("Request body is too large");
    error.status = 413;
    throw error;
  }
}

export function cleanText(value, max = 4000) {
  return String(value ?? "").trim().slice(0, max);
}

export function numberParam(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : 0;
}


const PUBLIC_ERROR_CODES = Object.freeze({
  AUTH_REQUIRED: "Authentication required",
  FORBIDDEN: "Permission denied",
  TOO_MANY_ATTEMPTS: "Too many attempts. Try again later.",
  ACCOUNT_ALREADY_EXISTS: "An account with this email already exists.",
  LOGIN_ALREADY_IN_USE: "This username is already in use",
  COUNTRY_NOT_FOUND: "Country does not exist",
  COUNTRY_INACTIVE: "Country is inactive",
  COUNTRY_NOT_LAUNCHED: "This country is not currently available.",
  COUNTRY_PRODUCT_NOT_ACTIVE: "This country product is not currently active.",
  COUNTRY_PRODUCT_ACTIVE_VERSION_CHANGED: "The country product changed. Refresh and try again.",
  PRODUCT_DEFINITION_NOT_COMPILED: "The product is not ready yet.",
  PRODUCT_MANIFEST_NOT_FOUND: "The product runtime is not ready yet.",
  PRODUCT_MANIFEST_INVALID: "The product runtime is invalid.",
  PRODUCT_MANIFEST_SCOPE_MISMATCH: "The product runtime scope does not match.",
  PRODUCT_MANIFEST_INTEGRITY_FAILED: "The product runtime integrity check failed.",
  PRODUCT_NOT_ELIGIBLE: "This account is not eligible for this product.",
  VERIFICATION_REQUIRED: "Verification is required before this operation.",
  SUBSCRIPTION_REQUIRED: "An active subscription is required.",
  PAYMENT_REQUIRED: "Your subscription needs attention before this operation.",
  MISSION_LIMIT_REACHED: "Your mission limit has been reached.",
  DRIVER_LIMIT_REACHED: "Your driver limit has been reached.",
  RESOURCE_ALREADY_IN_TRASH: "This record is already in Trash.",
  TRASH_LEGAL_HOLD: "This record is protected by legal hold.",
  TRASH_PURGE_BLOCKED: "This record cannot be permanently removed yet."
});

export function publicErrorMessage(error, fallback = "Request failed") {
  const status = Number(error?.status || 500);
  const raw = String(error?.message || "").trim();
  if (status >= 500) return fallback;
  if (!raw) return fallback;
  if (PUBLIC_ERROR_CODES[raw]) return PUBLIC_ERROR_CODES[raw];
  if (/^(?:[A-Z][A-Z0-9_.-]*)(?::.*)?$/.test(raw) && !/[a-z]/.test(raw)) return fallback;
  if (/^(?:ACTION_|SUBSCRIPTION_ACTION_|EXPANSION_|PRODUCT_|COUNTRY_PRODUCT_|TRASH_|PLATFORM_)/.test(raw)) return fallback;
  return raw.slice(0, 500);
}
