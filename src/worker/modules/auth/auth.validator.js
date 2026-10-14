import { cleanText } from "../../core/http.js";
import { validatePasswordPolicy } from "../../security/password.js";

export function normalizeLogin(value) {
  return cleanText(value, 190).toLocaleLowerCase("de-DE");
}

export function validateLogin(body = {}) {
  const login = normalizeLogin(body.login);
  const password = String(body.password || "");
  if (!login || !password) return { valid: false, error: "Login and password are required" };
  return { valid: true, value: { login, password } };
}

/** Legacy BALM validator retained for backward-compatible tooling only.
 * Registration no longer depends on BALM or this validator.
 */
export function validateBalmRegistration(body = {}) {
  const companyName = cleanText(body.companyName, 180);
  const zipCode = cleanText(body.zipCode, 12);
  const licenseNumber = cleanText(body.licenseNumber, 80);
  if (!companyName) return { valid: false, error: "Company name is required" };
  if (!/^\d{5}$/.test(zipCode)) return { valid: false, error: "German ZIP code must contain exactly 5 digits" };
  return { valid: true, value: { companyName, zipCode, licenseNumber } };
}

export function validateTenantRegistration(body = {}) {
  const companyName = cleanText(body.companyName, 180);
  const adminName = cleanText(body.adminName, 120);
  const email = normalizeLogin(body.email);
  const password = String(body.password || "");
  const countryCode = cleanText(body.countryCode, 2).toUpperCase();
  if (!/^[A-Z]{2}$/.test(countryCode)) return { valid: false, error: "Select your country" };
  if (!companyName || !adminName || !email) return { valid: false, error: "Registration details are incomplete" };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { valid: false, error: "Enter a valid email address" };
  const policy = validatePasswordPolicy(password);
  if (!policy.valid) return policy;
  return { valid: true, value: { companyName, adminName, email, password, countryCode } };
}

export function validateDriverCredentials(body = {}) {
  const name = cleanText(body.name, 120);
  const username = normalizeLogin(body.username);
  const password = String(body.password || "");
  if (!name || !username) return { valid: false, error: "Driver name and username are required" };
  if (!/^[a-z0-9][a-z0-9._-]{2,63}$/i.test(username)) return { valid: false, error: "Username must be 3-64 letters, numbers, dots, dashes or underscores" };
  const policy = validatePasswordPolicy(password);
  if (!policy.valid) return policy;
  return { valid: true, value: { name, username, password } };
}
