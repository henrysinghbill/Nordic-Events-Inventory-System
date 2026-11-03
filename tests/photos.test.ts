import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { processImage } from "@/server/photos";

async function jpegWithGps(width: number, height: number) {
  return sharp({ create: { width, height, channels: 3, background: "#4a7" } })
    .jpeg()
    .withExif({
      IFD0: { Make: "TestPhone", Model: "X" },
      IFD3: { GPSLatitudeRef: "N", GPSLatitude: "55/1 40/1 0/1" },
    })
    .toBuffer();
}

describe("processImage", () => {
  it("strips EXIF/GPS metadata", async () => {
    const input = await jpegWithGps(800, 600);
    expect((await sharp(input).metadata()).exif).toBeDefined(); // sanity check

    const out = await processImage(input);
    expect((await sharp(out.full).metadata()).exif).toBeUndefined();
    expect((await sharp(out.thumb).metadata()).exif).toBeUndefined();
  });

  it("resizes to max 1600px and makes a 400px thumbnail", async () => {
    const out = await processImage(await jpegWithGps(4000, 3000));
    expect([out.width, out.height]).toEqual([1600, 1200]);
    const thumb = await sharp(out.thumb).metadata();
    expect([thumb.width, thumb.height]).toEqual([400, 300]);
    expect(thumb.format).toBe("webp");
  });

  it("does not enlarge small photos", async () => {
    const out = await processImage(await jpegWithGps(300, 200));
    expect([out.width, out.height]).toEqual([300, 200]);
  });

  it("rejects files that aren't images", async () => {
    await expect(processImage(Buffer.from("definitely not a photo"))).rejects.toThrow(/isn't a photo/);
    await expect(processImage(Buffer.alloc(0))).rejects.toThrow(/empty/);
  });
});
