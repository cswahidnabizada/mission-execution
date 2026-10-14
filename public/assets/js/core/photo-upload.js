const DIRECT_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_DIMENSION = 2400;

export async function preparePhotoForUpload(file) {
  const nameLooksLikeImage = /\.(jpe?g|png|webp|heic|heif)$/i.test(String(file?.name || ""));
  const typeLooksLikeImage = String(file?.type || "").startsWith("image/");
  if (!file || (!typeLooksLikeImage && !nameLooksLikeImage)) {
    throw new Error("Choose a valid photo.");
  }

  // Snapshot ordinary supported files into memory before the mobile file input
  // is cleared. This avoids losing temporary camera/library files on iOS.
  if (DIRECT_TYPES.has(file.type) && file.size <= MAX_BYTES) {
    const bytes = await file.arrayBuffer();
    return new File([bytes], safeName(file.name, file.type), {
      type: file.type,
      lastModified: Date.now()
    });
  }

  // Mobile libraries can return HEIC/HEIF or very large photos. If the browser
  // can decode the selected image, normalize it to a reasonably sized JPEG.
  return convertToJpeg(file);
}

async function convertToJpeg(file) {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await waitForImage(image);

    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;
    if (!sourceWidth || !sourceHeight) throw new Error("Photo could not be decoded.");

    const scale = Math.min(1, MAX_DIMENSION / Math.max(sourceWidth, sourceHeight));
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Photo conversion is unavailable.");
    context.drawImage(image, 0, 0, width, height);

    const blob = await canvasToBlob(canvas, "image/jpeg", 0.86);
    if (!blob || !blob.size) throw new Error("Photo conversion failed.");
    if (blob.size > MAX_BYTES) throw new Error("Photo is still larger than 8 MB after optimization.");

    return new File([blob], jpegName(file.name), {
      type: "image/jpeg",
      lastModified: Date.now()
    });
  } catch (error) {
    throw new Error(error?.message || "This mobile photo format could not be prepared for upload.");
  } finally {
    URL.revokeObjectURL(url);
  }
}

function waitForImage(image) {
  if (image.decode) return image.decode();
  return new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = () => reject(new Error("Photo could not be decoded."));
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise(resolve => canvas.toBlob(resolve, type, quality));
}

function safeName(name, type) {
  const base = String(name || "mission-photo").replace(/[^a-zA-Z0-9._-]+/g, "-");
  if (/\.[a-z0-9]{2,5}$/i.test(base)) return base;
  const ext = type === "image/png" ? ".png" : type === "image/webp" ? ".webp" : ".jpg";
  return `${base}${ext}`;
}

function jpegName(name) {
  const base = String(name || "mission-photo").replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9._-]+/g, "-");
  return `${base || "mission-photo"}.jpg`;
}
