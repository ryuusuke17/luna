import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

const rootDir = process.cwd();
const prodDbPath = path.resolve(rootDir, "data/luna.sqlite");
const outputDir = path.resolve(rootDir, "test-results/page-screenshots");
const playwrightRunDir = path.resolve(rootDir, "test-results/.playwright-audit-run");

function snapshotFile(targetPath) {
  if (!fs.existsSync(targetPath)) return { exists: false, size: 0, mtimeMs: 0 };
  const st = fs.statSync(targetPath);
  return { exists: true, size: st.size, mtimeMs: st.mtimeMs };
}

function assertFileUnchanged(label, before, after) {
  if (before.exists !== after.exists || before.size !== after.size || before.mtimeMs !== after.mtimeMs) {
    throw new Error(
      `Data-safety violation: ${label} changed during audit (before=${JSON.stringify(before)}, after=${JSON.stringify(after)})`,
    );
  }
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const address = srv.address();
      const port = typeof address === "object" && address ? address.port : 0;
      srv.close(err => (err ? reject(err) : resolve(port)));
    });
  });
}

async function waitForServer(baseUrl, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const [meRes, loginRes] = await Promise.all([
        fetch(`${baseUrl}/api/auth/me`),
        fetch(`${baseUrl}/login`),
      ]);
      if (meRes.ok && loginRes.ok) return;
      lastError = new Error(`Status /api/auth/me=${meRes.status}, /login=${loginRes.status}`);
    } catch (err) {
      lastError = err;
    }
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error(`Timed out waiting for isolated Vite+Nitro server at ${baseUrl}: ${lastError?.message ?? lastError}`);
}

async function main() {
  const dbBefore = snapshotFile(prodDbPath);
  const walBefore = snapshotFile(`${prodDbPath}-wal`);
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "luna-audit-"));
  const tempDbPath = path.join(tempRoot, "luna-audit.sqlite");
  const tempStatementsPath = path.join(tempRoot, "private-statements");
  const setupToken = "isolated-fixture-setup";
  fs.mkdirSync(tempStatementsPath, { recursive: true });

  fs.rmSync(outputDir, { recursive: true, force: true });
  fs.mkdirSync(path.join(outputDir, "screenshots"), { recursive: true });

  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const viteBin = path.resolve(rootDir, "node_modules/vite/bin/vite.js");
  const playwrightCli = path.resolve(rootDir, "node_modules/@playwright/test/cli.js");

  const sharedEnv = {
    ...process.env,
    NODE_ENV: "development",
    LUNA_DB_PATH: tempDbPath,
    LUNA_STATEMENTS_PATH: tempStatementsPath,
    LUNA_SETUP_TOKEN: setupToken,
    DYAD_TEST_BASE_URL: baseUrl,
    LUNA_AUDIT_DB_PATH: tempDbPath,
    LUNA_AUDIT_STATEMENTS_PATH: tempStatementsPath,
    LUNA_AUDIT_SETUP_TOKEN: setupToken,
    LUNA_AUDIT_OUTPUT_DIR: outputDir,
  };
  delete sharedEnv.DYAD_PREVIEW_CDP_ENDPOINT;
  delete sharedEnv.DYAD_TEST_SLOW_MO;

  console.log(`[audit:pages] Starting isolated Vite+Nitro server at ${baseUrl}`);
  console.log(`[audit:pages] Disposable SQLite DB: ${tempDbPath}`);
  console.log(`[audit:pages] Output folder: ${outputDir}`);

  const serverProc = spawn(
    process.execPath,
    [viteBin, "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
    {
      cwd: rootDir,
      env: sharedEnv,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  let serverLogs = "";
  serverProc.stdout.on("data", chunk => {
    serverLogs += chunk.toString();
  });
  serverProc.stderr.on("data", chunk => {
    serverLogs += chunk.toString();
  });

  try {
    await waitForServer(baseUrl);
    console.log("[audit:pages] Server ready. Running Playwright page-state audit...");

    const exitCode = await new Promise((resolve, reject) => {
      const pw = spawn(
        process.execPath,
        [
          playwrightCli,
          "test",
          "e2e-tests/page-state-audit.spec.ts",
          "--config=playwright-dyad.config.ts",
          `--output=${playwrightRunDir}`,
          "--trace=off",
          "--reporter=list",
        ],
        {
          cwd: rootDir,
          env: sharedEnv,
          stdio: "inherit",
        },
      );
      pw.on("error", reject);
      pw.on("close", code => resolve(code ?? 1));
    });

    if (exitCode !== 0) {
      console.error("[audit:pages] Server logs tail:\n" + serverLogs.slice(-3000));
      process.exitCode = exitCode;
      return;
    }

    const manifestPath = path.join(outputDir, "manifest.json");
    if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      console.log(
        `[audit:pages] Completed: ${manifest.totals.totalStates} states captured (${manifest.totals.desktopStates} desktop, ${manifest.totals.mobileStates} mobile) | pass=${manifest.totals.passed} warn=${manifest.totals.warned} fail=${manifest.totals.failed}`,
      );
      console.log(`[audit:pages] Gallery: ${path.join(outputDir, "index.html")}`);
      console.log(`[audit:pages] Summary: ${path.join(outputDir, "SUMMARY.md")}`);
    }
  } finally {
    if (!serverProc.killed) {
      serverProc.kill();
      await new Promise(r => setTimeout(r, 300));
    }
    try {
      fs.rmSync(tempRoot, { recursive: true, force: true });
      if (process.exitCode === 0) {
        fs.rmSync(playwrightRunDir, { recursive: true, force: true });
      }
    } catch {
      // ignore temp cleanup lock on Windows
    }
    const dbAfter = snapshotFile(prodDbPath);
    const walAfter = snapshotFile(`${prodDbPath}-wal`);
    assertFileUnchanged("data/luna.sqlite", dbBefore, dbAfter);
    assertFileUnchanged("data/luna.sqlite-wal", walBefore, walAfter);
    console.log("[audit:pages] Verified data/luna.sqlite was untouched.");
  }
}

main().catch(err => {
  console.error("[audit:pages] Fatal error:", err);
  process.exit(1);
});
