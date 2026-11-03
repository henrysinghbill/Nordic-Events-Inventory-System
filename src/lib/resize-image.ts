/**
 * Shrink a photo in the browser before uploading (a 4 MB phone photo becomes
 * roughly 300 KB), which matters on weak signal. The server still re-encodes
 * it and strips metadata, so this is purely about upload speed.
 * If anything goes wrong, the original file is returned and the server copes.
 */
export async function resizeImage(file: File, maxSize = 1600, quality = 0.85): Promise<Blob> {
  try {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.decoding = "async";
      img.src = url;
      await img.decode(); // browsers apply the photo's rotation (EXIF) here
      const scale = Math.min(1, maxSize / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.round(img.naturalWidth * scale);
      const h = Math.round(img.naturalHeight * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return file;
      ctx.drawImage(img, 0, 0, w, h);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      return blob && blob.size < file.size ? blob : file;
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    return file;
  }
}
