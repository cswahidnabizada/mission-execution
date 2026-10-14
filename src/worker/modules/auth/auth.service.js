import { authorityUnavailable } from '../../core/canonical-db.js';
import * as authRepo from "../../repositories/auth.repository.js";
import { findActiveDriver } from "../../repositories/driver.repository.js";
import { hashPassword, verifyPassword } from "../../security/password.js";
import { consumeRateLimit, clearRateLimit, requestIp } from "../../security/rate-limit.js";
import * as executorRepo from "../../repositories/executor.repository.js";

const REGISTRATION_TTL = 15 * 60;

export async function authenticate(env, request, { login, password }) {
  const key = `login:${requestIp(request)}:${login}`;
  await consumeRateLimit(env, key, { limit: 10, windowSeconds: 900 });

  let identity = await authRepo.findIdentityByLogin(env, login);
  let identityType = "tenant";
  if (!identity) {
    identity = await executorRepo.findExecutorByLogin(env, login);
    identityType = "executor";
  }

  const valid = identity && await verifyPassword(
    password, identity.password_hash, identity.password_salt, identity.password_iterations
  );
  if (!valid) { const error=new Error("INVALID_CREDENTIALS");error.status=401;throw error; }

  if (identityType === "tenant" && identity.role === "driver") {
    const driver = await findActiveDriver(env, identity.company_id, identity.driver_id);
    if (!driver) { const error=new Error("ACCOUNT_DISABLED");error.status=403;throw error; }
  }

  await clearRateLimit(env, key);
  if (identityType === "executor") await executorRepo.touchExecutorLogin(env, identity.id);
  else await authRepo.touchLastLogin(env, identity.id);

  return identityToSession({ ...identity, identity_type: identityType });
}

export async function registerTenant(env, data) {
  if (await authRepo.findIdentityByLogin(env, data.email) || await executorRepo.findExecutorByEmail(env, data.email)) {
    const error = new Error("ACCOUNT_ALREADY_EXISTS");
    error.status = 409;
    throw error;
  }

  const password = await hashPassword(data.password);
  let companyId = null;
  try {
    companyId = await authRepo.createCompany(env, data.companyName);
    await authRepo.markCompanyPending(env, companyId, data.countryCode);
    await authRepo.setCompanyCountry(env, companyId, data.countryCode);
    const identityId = await authRepo.createIdentity(env, {
      companyId,
      role: "admin",
      login: data.email,
      email: data.email,
      displayName: data.adminName,
      passwordHash: password.hash,
      passwordSalt: password.salt,
      passwordIterations: password.iterations
    });
    return { identityId, companyId, companyName: data.companyName, companyVerified: false, countryCode:data.countryCode, verificationComplete:false, role: "admin", login: data.email, displayName: data.adminName };
  } catch (error) {
    if (companyId) await authRepo.deleteCompanyIfEmpty(env, companyId).catch(recoveryError=>{throw authorityUnavailable('organization_creation_rollback',recoveryError);});
    throw mapConstraintError(error);
  }
}

export async function setDriverIdentity(env, companyId, driverId, { username, password, name }) {
  const driver = await findActiveDriver(env, companyId, driverId);
  if (!driver) {
    const error = new Error("DRIVER_NOT_FOUND");
    error.status = 404;
    throw error;
  }
  const other = await authRepo.findIdentityByLogin(env, username);
  const existing = await authRepo.findDriverIdentity(env, companyId, driverId);
  if (other && (!existing || Number(other.id) !== Number(existing.id))) {
    const error = new Error("LOGIN_ALREADY_IN_USE");
    error.status = 409;
    throw error;
  }
  const hashed = await hashPassword(password);
  if (existing) {
    await authRepo.updateIdentityCredentials(env, existing.id, {
      login: username,
      displayName: name || driver.name,
      passwordHash: hashed.hash,
      passwordSalt: hashed.salt,
      passwordIterations: hashed.iterations,
      mustChangePassword: false
    });
    return Number(existing.id);
  }
  return authRepo.createIdentity(env, {
    companyId,
    role: "driver",
    driverId,
    login: username,
    displayName: name || driver.name,
    passwordHash: hashed.hash,
    passwordSalt: hashed.salt,
    passwordIterations: hashed.iterations
  });
}

export function identityToSession(identity) {
  if (identity.identity_type === "executor") {
    return {
      role: "executor",
      accessType: "public-executor",
      identityType: "executor",
      tenantId: null,
      identityId: Number(identity.id || identity.identityId),
      executorId: Number(identity.id || identity.executorId),
      countryCode: identity.country_code || identity.countryCode || null,
      login: identity.login || identity.email,
      displayName: identity.display_name || identity.displayName || null,
      authMethod: "password",
      sessionVersion: Number(identity.session_version || identity.sessionVersion || 1)
    };
  }
  return {
    role: identity.role,
    accessType: identity.role === "admin" ? "admin" : "company",
    identityType: "tenant",
    tenantId: Number(identity.company_id || identity.companyId),
    identityId: Number(identity.id || identity.identityId),
    login: identity.login,
    displayName: identity.display_name || identity.displayName || null,
    driverId: identity.driver_id ? Number(identity.driver_id) : null,
    driverName: identity.driver_name || identity.driverName || null,
    companyName: identity.company_name || identity.companyName || null,
    companyVerified: identity.companyVerified === true || identity.company_verification_status === "verified",
    countryCode: identity.country_code || identity.countryCode || null,
    authMethod: "password",
    sessionVersion: Number(identity.session_version || identity.sessionVersion || 1)
  };
}

function secureToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
}

function mapConstraintError(error) {
  if (/UNIQUE constraint failed/i.test(String(error?.message || ""))) {
    const mapped = new Error("ACCOUNT_ALREADY_EXISTS");
    mapped.status = 409;
    return mapped;
  }
  return error;
}
