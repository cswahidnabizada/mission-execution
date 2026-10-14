const DEFAULT_ITERATIONS = 100000;
const SALT_BYTES = 16;
const HASH_BYTES = 32;

export async function hashPassword(password, iterations = DEFAULT_ITERATIONS) {
  validatePasswordForHash(password);
  const salt = new Uint8Array(SALT_BYTES);
  crypto.getRandomValues(salt);
  const hash = await derive(password, salt, iterations);
  return {
    hash: bytesToBase64(hash),
    salt: bytesToBase64(salt),
    iterations
  };
}

export async function verifyPassword(password, storedHash, storedSalt, iterations = DEFAULT_ITERATIONS) {
  if (!password || !storedHash || !storedSalt) return false;
  try {
    const salt = base64ToBytes(storedSalt);
    const expected = base64ToBytes(storedHash);
    const actual = await derive(password, salt, Number(iterations) || DEFAULT_ITERATIONS);
    return timingSafeBytesEqual(actual, expected);
  } catch {
    return false;
  }
}

export function validatePasswordPolicy(password) {
  const value = String(password || "");
  if (value.length < 12) return { valid: false, error: "Password must be at least 12 characters" };
  if (value.length > 128) return { valid: false, error: "Password must be 128 characters or fewer" };
  return { valid: true };
}

async function derive(password, salt, iterations) {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(String(password)),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    keyMaterial,
    HASH_BYTES * 8
  );
  return new Uint8Array(bits);
}

function validatePasswordForHash(password) {
  const policy = validatePasswordPolicy(password);
  if (!policy.valid) {
    const error = new Error(policy.error);
    error.status = 400;
    throw error;
  }
}

function timingSafeBytesEqual(a, b) {
  if (!(a instanceof Uint8Array) || !(b instanceof Uint8Array) || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function bytesToBase64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
