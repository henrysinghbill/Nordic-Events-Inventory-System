import "server-only";
import path from "node:path";
import { z } from "zod";

/**
 * All configuration comes from environment variables (documented in .env.example).
 * Read lazily so that `next build` doesn't need a full environment.
 */
const schema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  APP_BASE_URL: z
    .string()
    .url()
    .transform((s) => s.replace(/\/+$/, "")),
  UPLOAD_DIR: z.string().min(1).default("./data/uploads"),
  SESSION_SECRET: z.string().min(16, "SESSION_SECRET must be at least 16 characters"),
  AUTH_PROVIDER: z.enum(["local", "vms"]).default("local"),
  INITIAL_ADMIN_USERNAME: z.string().optional(),
  INITIAL_ADMIN_PASSWORD: z.string().optional(),
  APP_TIMEZONE: z.string().default("Europe/Copenhagen"),
  DHL_TRACKING_URL_TEMPLATE: z
    .string()
    .default(
      "https://www.dhl.com/global-en/home/tracking/tracking-express.html?submit=1&tracking-id={waybill}",
    ),
  DHL_API_KEY: z.string().optional(),
});

export type AppConfig = z.infer<typeof schema> & { uploadDirAbsolute: string };

let cached: AppConfig | null = null;

export function config(): AppConfig {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid configuration (check your environment variables):\n${problems}`);
  }
  cached = {
    ...parsed.data,
    uploadDirAbsolute: path.resolve(parsed.data.UPLOAD_DIR),
  };
  return cached;
}
