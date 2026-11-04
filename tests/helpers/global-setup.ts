import { execSync } from "node:child_process";

/** Bring the test database's schema up to date before any test runs. */
export default function setup() {
  const url =
    process.env.TEST_DATABASE_URL ?? "postgresql://inventory:inventory@localhost:5432/inventory_test";
  try {
    execSync("npx prisma migrate deploy", {
      stdio: "pipe",
      env: { ...process.env, DATABASE_URL: url },
    });
  } catch (err) {
    const output = String((err as { stderr?: Buffer }).stderr ?? err);
    throw new Error(
      `Couldn't prepare the test database.\n` +
        `Is the development database running?  docker compose -f docker-compose.dev.yml up -d\n\n${output}`,
    );
  }
}
