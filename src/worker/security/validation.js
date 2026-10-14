import {MISSION_STATUS_FLOW} from "../domains/logistics/logistics-lifecycle.contract.js";
// Legacy logistics statuses remain the compatibility vocabulary for older callers.
// The canonical lifecycle service validates the actual mission transition, so new sector
// products may use lifecycle-owned states such as InProgress without being rejected here.
export const ALLOWED_STATUSES = new Set([...MISSION_STATUS_FLOW,"InProgress"]);
export const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
export const MAX_IMAGE_SIZE = 8 * 1024 * 1024;

export function assertStatus(status) {
  if (!ALLOWED_STATUSES.has(status)) throw badRequest("Invalid status");
}

export function assertPhoto(file) {
  if (!file || typeof file.stream !== "function") throw badRequest("Photo is required");
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) throw badRequest("Only JPEG, PNG and WebP photos are allowed");
  if (!file.size || file.size > MAX_IMAGE_SIZE) throw badRequest("Photo must be between 1 byte and 8 MB");
}

export function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}


export function assertImageBytes(bytes,mimeType){
  const b=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes||[]);
  const ok=
    (mimeType==="image/jpeg" && b.length>=3 && b[0]===0xff && b[1]===0xd8 && b[2]===0xff) ||
    (mimeType==="image/png" && b.length>=8 && b[0]===0x89 && b[1]===0x50 && b[2]===0x4e && b[3]===0x47 && b[4]===0x0d && b[5]===0x0a && b[6]===0x1a && b[7]===0x0a) ||
    (mimeType==="image/webp" && b.length>=12 &&
      String.fromCharCode(...b.slice(0,4))==="RIFF" &&
      String.fromCharCode(...b.slice(8,12))==="WEBP");
  if(!ok)throw badRequest("Uploaded file content does not match its image type");
}
