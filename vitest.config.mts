import path from "node:path";
import { defineConfig } from "vitest/config";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://inventory:inventory@localhost:5432/inventory_test";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      // `server-only` throws outside Next.js; in tests it's a no-op.
      "server-only": path.resolve(import.meta.dirname, "tests/helpers/empty.ts"),
    },
  },
  test: {
    environment: "node",
    globalSetup: ["tests/helpers/global-setup.ts"],
    // Database tests share one test database, so run files one after another.
    fileParallelism: false,
    env: {
      DATABASE_URL: TEST_DATABASE_URL,
      APP_BASE_URL: "http://localhost:3000",
      SESSION_SECRET: "test-secret-test-secret-test-secret",
      UPLOAD_DIR: "./data/test-uploads",
    },
  },
});
