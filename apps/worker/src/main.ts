import { config } from "dotenv";
import { rm, writeFile } from "node:fs/promises";
import { startWorkerRuntime } from "./runtime";

config({ path: new URL("../../../.env", import.meta.url), quiet: true });

const runtime = await startWorkerRuntime();
const healthFile = process.env.WORKER_HEALTH_FILE ?? "/tmp/substation-worker-ready";
await writeFile(healthFile, new Date().toISOString(), "utf8");
const heartbeat = setInterval(() => {
  void writeFile(healthFile, new Date().toISOString(), "utf8").catch(() => {
    console.error(JSON.stringify({ event: "worker_heartbeat_failed" }));
  });
}, 5_000);
console.log(JSON.stringify({ event: "worker_ready" }));

let shuttingDown = false;
async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  clearInterval(heartbeat);
  await rm(healthFile, { force: true });
  console.log(JSON.stringify({ event: "worker_shutdown", signal }));
  await runtime.close();
  process.exitCode = 0;
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
