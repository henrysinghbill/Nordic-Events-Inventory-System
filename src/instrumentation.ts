/** Next.js calls register() once when the server starts. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { bootstrap } = await import("./server/bootstrap");
  try {
    await bootstrap();
  } catch (err) {
    // Don't crash the server; log loudly so it's visible in the container logs.
    console.error("[bootstrap] Failed to prepare initial data:", err);
  }
  // Optional: DHL tracking checks, only when an API key is configured.
  try {
    const { config } = await import("./server/config");
    const { DHL_API_KEY, DHL_CHECK_MINUTES } = config();
    if (DHL_API_KEY) {
      const [{ db }, { startDhlTracking }] = await Promise.all([import("./server/db"), import("./server/dhl")]);
      startDhlTracking(db, DHL_API_KEY, DHL_CHECK_MINUTES);
    }
  } catch (err) {
    console.error("[dhl] Couldn't start tracking checks:", err);
  }
}
