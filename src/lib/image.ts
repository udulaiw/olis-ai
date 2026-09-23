// Downsizes photos in the browser before they're sent to OLIS Cloud.
// A phone photo of a question paper (4–12 MB) becomes a ~200–400 kB JPEG that
// is still sharp enough to read, which keeps requests fast and under limits.

export interface PreparedImage {
  name: string;
  mimeType: "image/jpeg";
  /** base64 (no data: prefix) */
  data: string;
  /** tiny preview for the chat bubble / history */
  thumb: string;
}

export const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp";
export const isImageFile = (f: File) => /^image\/(jpeg|png|webp)$/i.test(f.type) || /\.(jpe?g|png|webp)$/i.test(f.name);

async function decode(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if ("createImageBitmap" in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
    } catch {
      /* fall through (older Safari) */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

function draw(src: ImageBitmap | HTMLImageElement, maxSide: number, quality: number): string {
  const w = "naturalWidth" in src ? src.naturalWidth : src.width;
  const h = "naturalHeight" in src ? src.naturalHeight : src.height;
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");
  ctx.fillStyle = "#fff"; // transparent PNGs → white paper, not black
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
}

export async function prepareImage(file: File, name = file.name || "image"): Promise<PreparedImage> {
  const src = await decode(file);
  let url = draw(src, 1600, 0.85);
  // Keep the payload comfortably under the server's ~1 MB per-image limit
  if (url.length > 1_300_000) url = draw(src, 1280, 0.78);
  if (url.length > 1_300_000) url = draw(src, 1024, 0.7);
  const thumb = draw(src, 160, 0.7);
  if ("close" in src) src.close();
  return { name, mimeType: "image/jpeg", data: url.slice(url.indexOf(",") + 1), thumb };
}
