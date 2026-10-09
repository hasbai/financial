import { createRequire } from "node:module";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

// Boot the exact production Worker locally. Node/Vite preview cannot detect
// module initialization failures in workerd, including Node-only dependencies.
const directory = await mkdtemp(join(tmpdir(), "blog-worker-startup-"));
const runtime = createRequire(import.meta.url)("workerd");
const reservation = createServer();
await new Promise((resolve, reject) => { reservation.once("error", reject); reservation.listen(0, "127.0.0.1", resolve); });
const port = reservation.address().port;
await new Promise((resolve, reject) => reservation.close(error => error ? reject(error) : resolve()));
const child = spawn("pnpm", ["exec", "wrangler", "dev", "--local", "--ip", "127.0.0.1", "--port", String(port), "--inspector-port", "0", "--persist-to", directory, "--log-level", "error", "--show-interactive-dev-session=false"], {
  detached: process.platform !== "win32",
  stdio: ["ignore", "ignore", "pipe"],
  env: { ...process.env, WRANGLER_SEND_METRICS: "false", MINIFLARE_WORKERD_PATH: runtime.default },
});
let stderr = "";
child.stderr.on("data", data => { stderr = (stderr + data).slice(-16000); });
let exited = false;
child.on("exit", () => { exited = true; });
child.on("error", () => { exited = true; });
try {
  let ready = false;
  for (let attempt = 0; attempt < 80 && !exited; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/version`, { signal: AbortSignal.timeout(1000) });
      const version = await response.json();
      if (response.ok && typeof version.id === "string") { ready = true; break; }
    } catch { /* The local Worker is still starting. */ }
    await delay(250);
  }
  if (!ready) {
    // Emit only known startup diagnostics; never dump Wrangler configuration or credentials.
    const error = stderr.split("\n").filter(line => /Uncaught|createRequire|file URL|ERROR|failed to start/i.test(line)).slice(0,8).join("\n");
    throw new Error("Production Worker failed to initialize in workerd" + (error ? "\n" + error : ""));
  }
  console.log("Production Worker initialized in workerd; /api/version returned 200.");
} finally {
  if (child.pid) {
    if (process.platform === "win32") child.kill("SIGTERM");
    else { try { process.kill(-child.pid, "SIGTERM"); } catch {} }
    await delay(250);
    if (process.platform === "win32") child.kill("SIGKILL");
    else { try { process.kill(-child.pid, "SIGKILL"); } catch {} }
  }
  await rm(directory, { recursive: true, force: true });
}
