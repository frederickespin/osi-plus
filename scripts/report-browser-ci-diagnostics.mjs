import { readFileSync, readdirSync, statfsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { freemem, totalmem } from "node:os";

const require = createRequire(import.meta.url);
const playwrightPackage = JSON.parse(readFileSync(require.resolve("@playwright/test/package.json"), "utf8"));
const playwrightCoreRoot = dirname(require.resolve("playwright-core"));
const browsers = JSON.parse(readFileSync(join(playwrightCoreRoot, "browsers.json"), "utf8"));
const webkit = browsers.browsers.find((browser) => browser.name === "webkit");
const disk = statfsSync(process.cwd());
const bytesToMiB = (bytes) => Math.round(bytes / 1024 / 1024);

function sanitizedProcessCounts() {
  const counts = {};
  try {
    for (const entry of readdirSync("/proc", { withFileTypes: true })) {
      if (!entry.isDirectory() || !/^\d+$/u.test(entry.name)) continue;
      try {
        const command = readFileSync(`/proc/${entry.name}/comm`, "utf8").trim().toLowerCase();
        const family = ["node", "webkit", "firefox", "chrome", "chromium", "vite"].find((name) => command.includes(name));
        if (family) counts[family] = (counts[family] ?? 0) + 1;
      } catch {
        // A process may disappear between listing /proc and reading its name.
      }
    }
  } catch {
    // /proc is not available on every local platform.
  }
  return counts;
}

const metrics = {
  phase: process.argv[2] ?? "unspecified",
  node: process.version,
  playwright: playwrightPackage.version,
  webkit: webkit ? { revision: webkit.revision, browserVersion: webkit.browserVersion } : null,
  memoryMiB: {
    hostTotal: bytesToMiB(totalmem()),
    hostFree: bytesToMiB(freemem()),
    processRss: bytesToMiB(process.memoryUsage().rss),
    processHeapUsed: bytesToMiB(process.memoryUsage().heapUsed),
  },
  diskMiB: {
    total: bytesToMiB(disk.blocks * disk.bsize),
    available: bytesToMiB(disk.bavail * disk.bsize),
  },
  processCounts: sanitizedProcessCounts(),
};

process.stdout.write(`[browser-ci-diagnostics] ${JSON.stringify(metrics)}\n`);
