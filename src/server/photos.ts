import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { config } from "./config";
import { UserError } from "./errors";

/**
 * Photos are stored on disk in UPLOAD_DIR as WebP:
 *   {key}.webp        max 1600px on the long side
 *   {key}_thumb.webp  max 400px
 * Every upload is decoded and re-encoded by sharp, which also strips all
 * metadata (EXIF, GPS location, camera details). They are served only through
 * the authenticated route /api/photos/[key].
 */
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const FULL_SIZE = 1600;
const THUMB_SIZE = 400;
const ALLOWED_FORMATS = new Set(["jpeg", "png", "webp", "gif", "tiff", "heif", "avif"]);

export type ProcessedImage = { full: Buffer; thumb: Buffer; width: number; height: number };

export async function processImage(input: Buffer): Promise<ProcessedImage> {
  if (input.length === 0) throw new UserError("The photo is empty. Please take it again.");
  if (input.length > MAX_UPLOAD_BYTES) throw new UserError("That photo is too large (max 15 MB).");

  let format: string | undefined;
  try {
    format = (await sharp(input).metadata()).format;
  } catch {
    throw new UserError("That file isn't a photo we can read. Use a JPEG, PNG or WebP image.");
  }
  if (!format || !ALLOWED_FORMATS.has(format)) {
    throw new UserError("That file isn't a supported photo. Use a JPEG, PNG or WebP image.");
  }

  try {
    // .rotate() applies the EXIF orientation before the metadata is dropped.
    const base = sharp(input, { failOn: "error" }).rotate();
    const { data: full, info } = await base
      .clone()
      .resize(FULL_SIZE, FULL_SIZE, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
    const thumb = await base
      .clone()
      .resize(THUMB_SIZE, THUMB_SIZE, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 75 })
      .toBuffer();
    return { full, thumb, width: info.width, height: info.height };
  } catch {
    throw new UserError(
      "That photo couldn't be processed. If it's an iPhone HEIC photo, try taking it again from the app.",
    );
  }
}

function fileFor(key: string, variant: "full" | "thumb") {
  if (!/^[a-f0-9-]{36}$/.test(key)) throw new Error("Invalid photo key");
  const name = variant === "thumb" ? `${key}_thumb.webp` : `${key}.webp`;
  return path.join(config().uploadDirAbsolute, name);
}

export function photoFilePath(key: string, variant: "full" | "thumb") {
  return fileFor(key, variant);
}

/** Process and save an upload; returns the new key and size. */
export async function storePhoto(input: Buffer): Promise<{ key: string; width: number; height: number }> {
  const img = await processImage(input);
  const key = randomUUID();
  await mkdir(config().uploadDirAbsolute, { recursive: true });
  for (const [variant, data] of [
    ["full", img.full],
    ["thumb", img.thumb],
  ] as const) {
    const target = fileFor(key, variant);
    const temp = `${target}.tmp`;
    await writeFile(temp, data);
    await rename(temp, target); // never leave half-written files
  }
  return { key, width: img.width, height: img.height };
}

export async function deletePhotoFiles(key: string) {
  await Promise.all([
    rm(fileFor(key, "full"), { force: true }),
    rm(fileFor(key, "thumb"), { force: true }),
  ]);
}

/** Read an uploaded File from a FormData entry; returns null if none was sent. */
export async function readUpload(entry: FormDataEntryValue | null | undefined): Promise<Buffer | null> {
  if (!entry || typeof entry === "string" || entry.size === 0) return null;
  if (entry.size > MAX_UPLOAD_BYTES) throw new UserError("That photo is too large (max 15 MB).");
  return Buffer.from(await entry.arrayBuffer());
}
