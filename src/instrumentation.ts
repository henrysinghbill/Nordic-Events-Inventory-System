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
}
