/**
 * Runs once when the server boots.
 *
 * This file is compiled for every runtime Next.js targets, so it must stay free
 * of Node-only imports. The cache warm-up needs `node:fs` and the libSQL native
 * bindings, so the actual work lives in `instrumentation.node.ts` and is pulled
 * in only on the Node.js runtime. Keeping the split here - rather than guarding
 * a dynamic import inside the warm-up itself - is what lets the bundler drop the
 * Node-only module from the Edge build entirely.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.DISABLE_CACHE_WARMUP === "1") return;

  const { scheduleWarmup } = await import("./instrumentation.node");
  scheduleWarmup();
}
