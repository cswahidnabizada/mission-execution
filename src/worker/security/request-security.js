const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function validateMutationRequest(request, url) {
  const method = request.method.toUpperCase();
  if (!UNSAFE_METHODS.has(method)) return null;

  const fetchSite = String(request.headers.get("Sec-Fetch-Site") || "").toLowerCase();
  if (fetchSite === "cross-site") return "Cross-site request rejected";

  const origin = request.headers.get("Origin");
  if (origin && origin !== url.origin) return "Cross-origin request rejected";

  // Cookie-authenticated mutations must prove same-origin. Browsers normally
  // send Origin on POST, but privacy tooling, embedded browser modes and some
  // proxy paths can omit Origin while preserving a same-origin Referer. Treat
  // a same-origin Referer as an equivalent CSRF signal; never fail open when
  // both signals are absent. Non-cookie integrations remain compatible.
  const hasSessionCookie = /(?:^|;)\s*(?:onmission_session|onmission_platform_super_admin)=/.test(String(request.headers.get("Cookie") || ""));
  if (!origin) {
    const referer = request.headers.get("Referer");
    if (referer) {
      try {
        if (new URL(referer).origin !== url.origin) return "Cross-origin request rejected";
      } catch {
        return "Invalid request origin";
      }
    } else if (hasSessionCookie) {
      return "Same-origin authentication required";
    }
  }

  return null;
}

export function applySecurityHeaders(response, { isApi = false, isHttps = true, allowSameOriginFrame = false } = {}) {
  const headers = new Headers();
  // Preserve every Set-Cookie value when security headers wrap a response.
  // Reconstructing Headers(response.headers) can collapse multiple Set-Cookie
  // values, which is fatal for the platform login because it establishes both
  // the Super Admin cookie in one response.
  const sourceCookies = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : (typeof response.headers.getAll === 'function'
      ? response.headers.getAll('Set-Cookie')
      : (() => {
          const cookie = response.headers.get('Set-Cookie');
          return cookie ? [cookie] : [];
        })());
  for (const [key,value] of response.headers.entries()) {
    if (key.toLowerCase() !== 'set-cookie') headers.append(key,value);
  }
  for (const cookie of sourceCookies) headers.append('Set-Cookie',cookie);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", allowSameOriginFrame ? "SAMEORIGIN" : "DENY");
  headers.set("X-XSS-Protection", "0");
  headers.set("X-Permitted-Cross-Domain-Policies", "none");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", "camera=(self), microphone=(), geolocation=()");
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  headers.set("Cross-Origin-Resource-Policy", "same-origin");

  // Tailwind is compiled into a local static stylesheet. Scripts are therefore
  // restricted to same-origin external modules; runtime code generation is denied.
  headers.set("Content-Security-Policy",
    `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; frame-src 'self' https://www.openstreetmap.org; object-src 'none'; base-uri 'self'; frame-ancestors ${allowSameOriginFrame ? "'self'" : "'none'"}; form-action 'self'`
  );
  headers.set("Content-Security-Policy-Report-Only",
    `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; frame-src 'self' https://www.openstreetmap.org; object-src 'none'; base-uri 'self'; frame-ancestors ${allowSameOriginFrame ? "'self'" : "'none'"}; form-action 'self'`
  );

  if (isHttps) headers.set("Strict-Transport-Security", "max-age=31536000");
  if (isApi) {
    headers.set("Cache-Control", "no-store, max-age=0");
    headers.set("Pragma", "no-cache");
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}
