import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { APIRequestContext, Locator, Page, Route } from "@playwright/test";
import Database from "better-sqlite3";
import { reviewDialog, reviewFocusLoop } from "./accessibility";

export const FIXED_TIME_ISO = "2026-10-22T12:00:00.000Z";
export const FIXED_MONTH = "2026-10";
export const OWNER_USERNAME = "luna_audit_owner";
export const OWNER_PASSWORD = "LunaAudit!Password2026";

export type ViewportKind = "desktop-1440" | "mobile-390";

export interface AuditRecord {
  index: number;
  group: string;
  slug: string;
  title: string;
  route: string;
  viewport: ViewportKind;
  width: number;
  height: number;
  fullPage: boolean;
  screenshotRelPath: string;
  status: "pass" | "warn" | "fail";
  checks: {
    noPageError: boolean;
    noConsoleError: boolean;
    noUnexpectedApiError: boolean;
    noViteOverlay: boolean;
    noHorizontalOverflow: boolean;
    landmarkVisible: boolean;
    expectedContentPresent: boolean;
    dialogAccessible: boolean;
  };
  metrics: {
    scrollWidth: number;
    innerWidth: number;
    chartCount: number;
    dialogOpen: boolean;
  };
  warnings: string[];
  failures: string[];
  timestamp: string;
}

export interface CaptureOptions {
  group: string;
  slug: string;
  title: string;
  viewport?: ViewportKind;
  fullPage?: boolean;
  expectText?: string | RegExp | Array<string | RegExp>;
  waitForCharts?: boolean;
  allowApiError?: boolean | ((url: string, status: number) => boolean);
  allowConsoleError?: boolean | RegExp;
  checkFocusLoop?: boolean;
  skipDialogReview?: boolean;
}

export interface PageMonitor {
  drain(): {
    pageErrors: string[];
    consoleErrors: string[];
    apiErrors: Array<{ url: string; status: number; method: string }>;
  };
  clear(): void;
}

export function attachMonitors(page: Page): PageMonitor {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const apiErrors: Array<{ url: string; status: number; method: string }> = [];

  page.on("pageerror", err => {
    pageErrors.push(err.stack || err.message || String(err));
  });

  page.on("console", msg => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
  });

  page.on("response", res => {
    const url = res.url();
    if (url.includes("/api/") && res.status() >= 400) {
      apiErrors.push({
        url,
        status: res.status(),
        method: res.request().method(),
      });
    }
  });

  return {
    drain() {
      const snapshot = {
        pageErrors: [...pageErrors],
        consoleErrors: [...consoleErrors],
        apiErrors: [...apiErrors],
      };
      pageErrors.length = 0;
      consoleErrors.length = 0;
      apiErrors.length = 0;
      return snapshot;
    },
    clear() {
      pageErrors.length = 0;
      consoleErrors.length = 0;
      apiErrors.length = 0;
    },
  };
}

export async function installDeterministicClock(page: Page, isoTime = FIXED_TIME_ISO) {
  await page.clock.install({ time: new Date(isoTime) });
  await page.clock.resume();
}

export async function flushQueryRetries(page: Page) {
  for (let i = 0; i < 4; i++) {
    await page.clock.fastForward(2500);
    await new Promise(r => setTimeout(r, 40));
  }
  await page.clock.resume();
}

export async function settlePage(
  page: Page,
  opts: { waitForCharts?: boolean; scrollTop?: boolean } = {},
) {
  await page.waitForLoadState("domcontentloaded");
  await page.evaluate(async () => {
    if (document.fonts?.ready) {
      try {
        await Promise.race([
          document.fonts.ready,
          new Promise(r => setTimeout(r, 2000)),
        ]);
      } catch {
        // ignore font timeout
      }
    }
    const imgs = Array.from(document.querySelectorAll("img"));
    await Promise.all(
      imgs.map(img =>
        img.complete
          ? Promise.resolve()
          : new Promise(res => {
              img.addEventListener("load", res, { once: true });
              img.addEventListener("error", res, { once: true });
              setTimeout(res, 1500);
            }),
      ),
    );
  });

  if (opts.waitForCharts) {
    await page
      .waitForFunction(
        () => {
          const surfaces = Array.from(document.querySelectorAll(".recharts-surface"));
          if (!surfaces.length) return false;
          return surfaces.every(el => {
            const rect = el.getBoundingClientRect();
            return rect.width > 50 && rect.height > 30;
          });
        },
        undefined,
        { timeout: 6000 },
      )
      .catch(() => {});
  }

  await page.evaluate(async shouldScrollTop => {
    const waitRaf = () => new Promise<void>(r => requestAnimationFrame(() => r()));
    await waitRaf();
    await waitRaf();
    const surfaces = Array.from(document.querySelectorAll(".recharts-surface"));
    if (surfaces.length > 0) {
      let prev = surfaces.map(s => s.innerHTML.length).join(",");
      for (let i = 0; i < 6; i++) {
        await waitRaf();
        const next = surfaces.map(s => s.innerHTML.length).join(",");
        if (next === prev && next !== "0") break;
        prev = next;
      }
    }
    if (shouldScrollTop) {
      window.scrollTo(0, 0);
      await waitRaf();
    }
  }, Boolean(opts.scrollTop));
}

export function createAuditCollector(outputDir: string) {
  const records: AuditRecord[] = [];

  async function captureState(
    page: Page,
    monitor: PageMonitor,
    opts: CaptureOptions,
  ): Promise<AuditRecord> {
    const vpSize = page.viewportSize() ?? { width: 1440, height: 900 };
    const viewport: ViewportKind =
      opts.viewport ?? (vpSize.width <= 480 ? "mobile-390" : "desktop-1440");

    const openOverlayCount = await page
      .locator(
        '[role="dialog"]:visible, [role="alertdialog"]:visible, [data-radix-popper-content-wrapper]:visible',
      )
      .count();
    const fullPage = opts.fullPage ?? openOverlayCount === 0;

    await settlePage(page, {
      waitForCharts: opts.waitForCharts,
      scrollTop: fullPage,
    });

    const warnings: string[] = [];
    const failures: string[] = [];

    const expectedList =
      opts.expectText === undefined
        ? []
        : Array.isArray(opts.expectText)
          ? opts.expectText
          : [opts.expectText];

    let expectedContentPresent = true;
    for (const item of expectedList) {
      try {
        await page
          .getByText(item)
          .first()
          .waitFor({ state: "visible", timeout: 4000 });
      } catch {
        const bodyText = await page.locator("body").innerText().catch(() => "");
        const matched =
          typeof item === "string" ? bodyText.includes(item) : item.test(bodyText);
        if (!matched) {
          expectedContentPresent = false;
          failures.push(`Expected content not found: ${String(item)}`);
        }
      }
    }

    const domMetrics = await page.evaluate(() => {
      const overlay = document.querySelector("vite-error-overlay");
      const mainVisible = Boolean(
        document.querySelector("main#main, main, #login-title, h1, [role='status'], [role='alert']"),
      );
      const scrollWidth = document.documentElement.scrollWidth;
      const innerWidth = window.innerWidth;
      const chartCount = document.querySelectorAll(".recharts-surface").length;
      return {
        hasViteOverlay: Boolean(overlay),
        mainVisible,
        scrollWidth,
        innerWidth,
        chartCount,
      };
    });

    if (domMetrics.hasViteOverlay) {
      failures.push("Vite error overlay is present on page.");
    }
    if (!domMetrics.mainVisible) {
      failures.push("Primary landmark (main#main or h1) is not present.");
    }
    const noHorizontalOverflow = domMetrics.scrollWidth <= domMetrics.innerWidth + 1;
    if (!noHorizontalOverflow) {
      warnings.push(
        `Horizontal overflow detected: scrollWidth=${domMetrics.scrollWidth} > innerWidth=${domMetrics.innerWidth}`,
      );
    }

    const visibleDialogs = page.locator(
      '[role="dialog"]:visible, [role="alertdialog"]:visible',
    );
    const dialogCount = await visibleDialogs.count();
    let dialogAccessible = true;

    if (dialogCount > 0 && !opts.skipDialogReview) {
      const topDialog: Locator = visibleDialogs.last();
      try {
        await reviewDialog(topDialog);
        if (opts.checkFocusLoop) {
          await reviewFocusLoop(page, topDialog);
        }
      } catch (err) {
        dialogAccessible = false;
        const msg = err instanceof Error ? err.message.replace(/\u001b\[[0-9;]*m/g, "").split("\n").slice(0, 30).join(" ").replace(/\s+/g, " ") : String(err);
        warnings.push(`Dialog a11y finding: ${msg}`);
      }
    }

    const drained = monitor.drain();
    const unexpectedApiErrors = drained.apiErrors.filter(entry => {
      if (opts.allowApiError === true) return false;
      if (typeof opts.allowApiError === "function") {
        return !opts.allowApiError(entry.url, entry.status);
      }
      return true;
    });

    const unexpectedConsoleErrors = drained.consoleErrors.filter(text => {
      if (opts.allowConsoleError === true) return false;
      if (opts.allowConsoleError instanceof RegExp && opts.allowConsoleError.test(text)) {
        return false;
      }
      if (
        text.includes("Failed to load resource: the server responded with a status of") &&
        unexpectedApiErrors.length === 0
      ) {
        return false;
      }
      return true;
    });

    if (drained.pageErrors.length > 0) {
      failures.push(`Page runtime errors: ${drained.pageErrors.join(" | ")}`);
    }
    if (unexpectedConsoleErrors.length > 0) {
      failures.push(`Console errors: ${unexpectedConsoleErrors.join(" | ")}`);
    }
    if (unexpectedApiErrors.length > 0) {
      failures.push(
        `Unexpected API errors: ${unexpectedApiErrors
          .map(e => `${e.method} ${e.url} -> ${e.status}`)
          .join(", ")}`,
      );
    }

    const groupDir = path.join(outputDir, "screenshots", opts.group);
    fs.mkdirSync(groupDir, { recursive: true });
    const fileName = `${opts.group}--${opts.slug}--${viewport}.png`;
    const absPath = path.join(groupDir, fileName);
    const relPath = `screenshots/${opts.group}/${fileName}`;

    await page.screenshot({
      path: absPath,
      fullPage,
      animations: "disabled",
    });

    const status: AuditRecord["status"] =
      failures.length > 0 ? "fail" : warnings.length > 0 ? "warn" : "pass";

    const currentUrl = new URL(page.url());
    const route = `${currentUrl.pathname}${currentUrl.search}`;

    const record: AuditRecord = {
      index: records.length + 1,
      group: opts.group,
      slug: opts.slug,
      title: opts.title,
      route,
      viewport,
      width: vpSize.width,
      height: vpSize.height,
      fullPage,
      screenshotRelPath: relPath,
      status,
      checks: {
        noPageError: drained.pageErrors.length === 0,
        noConsoleError: unexpectedConsoleErrors.length === 0,
        noUnexpectedApiError: unexpectedApiErrors.length === 0,
        noViteOverlay: !domMetrics.hasViteOverlay,
        noHorizontalOverflow,
        landmarkVisible: domMetrics.mainVisible,
        expectedContentPresent,
        dialogAccessible,
      },
      metrics: {
        scrollWidth: domMetrics.scrollWidth,
        innerWidth: domMetrics.innerWidth,
        chartCount: domMetrics.chartCount,
        dialogOpen: dialogCount > 0,
      },
      warnings,
      failures,
      timestamp: new Date().toISOString(),
    };

    records.push(record);
    return record;
  }

  function writeReports() {
    fs.mkdirSync(outputDir, { recursive: true });
    const totals = {
      totalStates: records.length,
      desktopStates: records.filter(r => r.viewport === "desktop-1440").length,
      mobileStates: records.filter(r => r.viewport === "mobile-390").length,
      passed: records.filter(r => r.status === "pass").length,
      warned: records.filter(r => r.status === "warn").length,
      failed: records.filter(r => r.status === "fail").length,
    };

    const groups = Array.from(new Set(records.map(r => r.group))).sort();
    const manifest = {
      generatedAt: new Date().toISOString(),
      fixedAuditClock: FIXED_TIME_ISO,
      totals,
      groups,
      records,
    };

    fs.writeFileSync(
      path.join(outputDir, "manifest.json"),
      JSON.stringify(manifest, null, 2),
      "utf8",
    );

    const mdLines: string[] = [
      "# Luna Page-State Audit & Screenshot Summary",
      "",
      `- **Generated**: ${manifest.generatedAt}`,
      `- **Pinned Browser Clock**: \`${FIXED_TIME_ISO}\` (\`${FIXED_MONTH}\`)`,
      `- **Total States Checked & Screenshotted**: **${totals.totalStates}** (${totals.desktopStates} desktop \`1440x900\`, ${totals.mobileStates} mobile \`390x844\`)`,
      `- **Passed**: **${totals.passed}** | **Warnings (A11y/Layout)**: **${totals.warned}** | **Failures**: **${totals.failed}**`,
      "",
      "## Coverage by Route Group",
      "",
      "| Group | Total | Desktop | Mobile | Pass | Warn | Fail |",
      "| :--- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ];

    for (const g of groups) {
      const items = records.filter(r => r.group === g);
      mdLines.push(
        `| \`${g}\` | ${items.length} | ${items.filter(i => i.viewport === "desktop-1440").length} | ${items.filter(i => i.viewport === "mobile-390").length} | ${items.filter(i => i.status === "pass").length} | ${items.filter(i => i.status === "warn").length} | ${items.filter(i => i.status === "fail").length} |`,
      );
    }

    const warnedOrFailed = records.filter(r => r.warnings.length > 0 || r.failures.length > 0);
    if (warnedOrFailed.length > 0) {
      mdLines.push("", "## Diagnostics & Accessibility Findings", "");
      for (const r of warnedOrFailed) {
        mdLines.push(`- **#${r.index} \`${r.group}/${r.slug}\` (${r.viewport})** — \`${r.route}\``);
        for (const f of r.failures) mdLines.push(`  - [FAIL] ${f}`);
        for (const w of r.warnings) mdLines.push(`  - [WARN] ${w}`);
      }
    }

    mdLines.push(
      "",
      "## Complete State Catalog",
      "",
      "| # | Group | State Slug | Title | Route | Viewport | Status | Screenshot |",
      "| ---: | :--- | :--- | :--- | :--- | :--- | :--- | :--- |",
    );
    for (const r of records) {
      mdLines.push(
        `| ${r.index} | \`${r.group}\` | \`${r.slug}\` | ${r.title} | \`${r.route}\` | \`${r.viewport}\` | **${r.status.toUpperCase()}** | [View PNG](${r.screenshotRelPath}) |`,
      );
    }

    fs.writeFileSync(path.join(outputDir, "SUMMARY.md"), mdLines.join("\n") + "\n", "utf8");

    const escapeHtml = (s: string) =>
      s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

    const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Luna Page-State Screenshot Gallery</title>
  <style>
    :root {
      color-scheme: light dark;
      --bg: #0f1419;
      --panel: #182028;
      --border: #2a3642;
      --text: #eef3f7;
      --muted: #97a6b5;
      --pass: #22c55e;
      --warn: #f59e0b;
      --fail: #ef4444;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Inter, system-ui, -apple-system, sans-serif;
      background: var(--bg);
      color: var(--text);
      padding: 24px;
    }
    header {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: baseline;
      gap: 16px;
      margin-bottom: 20px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--border);
    }
    h1 { margin: 0; font-size: 1.5rem; }
    .stats { display: flex; flex-wrap: wrap; gap: 12px; font-size: 0.9rem; }
    .badge {
      padding: 4px 10px;
      border-radius: 999px;
      background: var(--panel);
      border: 1px solid var(--border);
      font-weight: 600;
    }
    .badge.pass { color: var(--pass); }
    .badge.warn { color: var(--warn); }
    .badge.fail { color: var(--fail); }
    .controls {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-bottom: 20px;
    }
    select, input[type="search"] {
      background: var(--panel);
      color: var(--text);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 8px 12px;
      font-size: 0.9rem;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
      gap: 18px;
    }
    .card {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 12px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    .card-head {
      padding: 12px 14px;
      border-bottom: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 8px;
    }
    .card-title { font-weight: 600; font-size: 0.95rem; margin: 0 0 4px; }
    .card-meta { color: var(--muted); font-size: 0.78rem; word-break: break-all; }
    .thumb-wrap {
      background: #090d11;
      aspect-ratio: 16 / 10;
      overflow: hidden;
      display: flex;
      align-items: flex-start;
      justify-content: center;
      border-bottom: 1px solid var(--border);
    }
    .thumb-wrap img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      object-position: top center;
      display: block;
    }
    .notes {
      padding: 10px 14px;
      font-size: 0.78rem;
      color: var(--warn);
    }
    .notes.fail { color: var(--fail); }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>Luna Page-State Audit &amp; Screenshot Gallery</h1>
      <p style="color:var(--muted);margin:6px 0 0;font-size:0.88rem">Pinned clock: ${escapeHtml(FIXED_TIME_ISO)} · Isolated synthetic SQLite workspace</p>
    </div>
    <div class="stats">
      <span class="badge">Total: ${totals.totalStates}</span>
      <span class="badge">Desktop: ${totals.desktopStates}</span>
      <span class="badge">Mobile: ${totals.mobileStates}</span>
      <span class="badge pass">Pass: ${totals.passed}</span>
      <span class="badge warn">Warn: ${totals.warned}</span>
      <span class="badge fail">Fail: ${totals.failed}</span>
    </div>
  </header>
  <div class="controls">
    <select id="groupFilter">
      <option value="">All route groups (${groups.length})</option>
      ${groups.map(g => `<option value="${escapeHtml(g)}">${escapeHtml(g)}</option>`).join("")}
    </select>
    <select id="viewportFilter">
      <option value="">All viewports</option>
      <option value="desktop-1440">Desktop (1440x900)</option>
      <option value="mobile-390">Mobile (390x844)</option>
    </select>
    <select id="statusFilter">
      <option value="">All statuses</option>
      <option value="pass">Pass</option>
      <option value="warn">Warn</option>
      <option value="fail">Fail</option>
    </select>
    <input id="searchFilter" type="search" placeholder="Search slug, title, or route..." />
  </div>
  <div class="grid" id="gallery">
    ${records
      .map(
        r => `<article class="card" data-group="${escapeHtml(r.group)}" data-viewport="${escapeHtml(r.viewport)}" data-status="${escapeHtml(r.status)}" data-search="${escapeHtml(`${r.slug} ${r.title} ${r.route}`.toLowerCase())}">
      <div class="card-head">
        <div>
          <p class="card-title">#${r.index} · ${escapeHtml(r.title)}</p>
          <div class="card-meta">${escapeHtml(r.group)} / ${escapeHtml(r.slug)} · <code>${escapeHtml(r.route)}</code> · ${escapeHtml(r.viewport)}</div>
        </div>
        <span class="badge ${escapeHtml(r.status)}">${escapeHtml(r.status.toUpperCase())}</span>
      </div>
      <a class="thumb-wrap" href="${escapeHtml(r.screenshotRelPath)}" target="_blank" rel="noopener">
        <img loading="lazy" src="${escapeHtml(r.screenshotRelPath)}" alt="${escapeHtml(r.title)}" />
      </a>
      ${
        r.failures.length > 0
          ? `<div class="notes fail">${r.failures.map(escapeHtml).join("<br/>")}</div>`
          : r.warnings.length > 0
            ? `<div class="notes">${r.warnings.map(escapeHtml).join("<br/>")}</div>`
            : ""
      }
    </article>`,
      )
      .join("\n")}
  </div>
  <script>
    const groupEl = document.getElementById("groupFilter");
    const vpEl = document.getElementById("viewportFilter");
    const statusEl = document.getElementById("statusFilter");
    const searchEl = document.getElementById("searchFilter");
    const cards = Array.from(document.querySelectorAll(".card"));
    function apply() {
      const g = groupEl.value;
      const v = vpEl.value;
      const s = statusEl.value;
      const q = searchEl.value.trim().toLowerCase();
      for (const c of cards) {
        const show =
          (!g || c.dataset.group === g) &&
          (!v || c.dataset.viewport === v) &&
          (!s || c.dataset.status === s) &&
          (!q || c.dataset.search.includes(q));
        c.style.display = show ? "" : "none";
      }
    }
    groupEl.addEventListener("change", apply);
    vpEl.addEventListener("change", apply);
    statusEl.addEventListener("change", apply);
    searchEl.addEventListener("input", apply);
  </script>
</body>
</html>`;

    fs.writeFileSync(path.join(outputDir, "index.html"), html, "utf8");
    return manifest;
  }

  return { records, captureState, writeReports };
}

export async function withHeldRoutes(
  page: Page,
  patterns: Array<string | RegExp>,
  runWhileHeld: () => Promise<void>,
) {
  const releases: Array<() => void> = [];
  const handlers: Array<{ pattern: string | RegExp; handler: (route: Route) => Promise<void> }> = [];

  for (const pattern of patterns) {
    const handler = async (route: Route) => {
      await new Promise<void>(resolve => {
        releases.push(resolve);
      });
      await route.abort("failed").catch(() => {});
    };
    handlers.push({ pattern, handler });
    await page.route(pattern, handler);
  }

  try {
    await runWhileHeld();
  } finally {
    for (const { pattern, handler } of handlers) {
      await page.unroute(pattern, handler).catch(() => {});
    }
    while (releases.length > 0) {
      const release = releases.pop();
      release?.();
    }
  }
}

export async function withFaultRoutes(
  page: Page,
  patterns: Array<string | RegExp>,
  status: number,
  body: Record<string, unknown>,
  runWithFault: (controls: { clearFaults: () => Promise<void> }) => Promise<void>,
) {
  const handlers: Array<{ pattern: string | RegExp; handler: (route: Route) => Promise<void> }> = [];
  let cleared = false;

  for (const pattern of patterns) {
    const handler = async (route: Route) => {
      if (cleared) {
        await route.continue().catch(() => {});
        return;
      }
      await route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    };
    handlers.push({ pattern, handler });
    await page.route(pattern, handler);
  }

  const clearFaults = async () => {
    if (cleared) return;
    cleared = true;
    for (const { pattern, handler } of handlers) {
      await page.unroute(pattern, handler).catch(() => {});
    }
  };

  try {
    await runWithFault({ clearFaults });
  } finally {
    await clearFaults();
  }
}

export async function apiMutate<T = unknown>(
  request: APIRequestContext,
  baseURL: string,
  csrf: string,
  method: "POST" | "PATCH" | "DELETE",
  endpoint: string,
  data?: unknown,
): Promise<T> {
  const res = await request.fetch(`${baseURL}/api/${endpoint}`, {
    method,
    headers: {
      origin: baseURL,
      "x-luna-csrf": csrf,
      "content-type": "application/json",
    },
    data: data !== undefined ? JSON.stringify(data) : undefined,
  });
  if (!res.ok()) {
    const text = await res.text();
    throw new Error(`${method} /api/${endpoint} failed (${res.status()}): ${text}`);
  }
  return (await res.json()) as T;
}

export async function apiGet<T = unknown>(
  request: APIRequestContext,
  baseURL: string,
  endpoint: string,
): Promise<T> {
  const res = await request.get(`${baseURL}/api/${endpoint}`);
  if (!res.ok()) {
    const text = await res.text();
    throw new Error(`GET /api/${endpoint} failed (${res.status()}): ${text}`);
  }
  return (await res.json()) as T;
}

export async function setupAndLoginApi(
  request: APIRequestContext,
  baseURL: string,
  setupToken: string,
): Promise<{ csrf: string }> {
  const meRes = await request.get(`${baseURL}/api/auth/me`);
  const meJson = (await meRes.json()) as { user: { id: number; username: string } | null };

  if (!meJson.user) {
    await request.post(`${baseURL}/api/auth/setup`, {
      headers: { origin: baseURL },
      data: {
        username: OWNER_USERNAME,
        password: OWNER_PASSWORD,
        setupToken,
      },
    });
  }

  const loginRes = await request.post(`${baseURL}/api/auth/login`, {
    headers: { origin: baseURL },
    data: {
      username: OWNER_USERNAME,
      password: OWNER_PASSWORD,
    },
  });
  if (!loginRes.ok()) {
    throw new Error(`Login failed: ${loginRes.status()} ${await loginRes.text()}`);
  }

  const state = await request.storageState();
  const csrfCookie = state.cookies.find(c => c.name === "luna_csrf");
  if (!csrfCookie) {
    throw new Error("Missing luna_csrf cookie after login");
  }
  return { csrf: csrfCookie.value };
}

export interface SeededWorkspace {
  csrf: string;
  accounts: {
    unionBankCardId: number;
    bdoBankId: number;
    cashOnHandId: number;
    easyCashLoanId: number;
    gcashWalletId: number;
    bpiUsdCardId: number;
    metrobankCardId: number;
    rcbcEmptyCardId: number;
    archivedWalletId: number;
    bullionAssetId: number;
  };
  categories: {
    statementExpensesId: number;
    cashIncomeId: number;
    groceriesId: number;
    utilitiesId: number;
    softwareId: number;
    transportId: number;
    freelanceIncomeId: number;
  };
  ccStatements: {
    aprSupersededId: number;
    aprActiveId: number;
    octUnionBankId: number;
    octBpiUsdId: number;
    octMetrobankPreHistoryId: number;
  };
  legacyStatements: {
    needsAttentionBatchId: number;
    preHistoryBatchId: number;
    failedBatchId: number;
    csvImportBatchId: number;
    archiveId: number;
  };
  transactions: {
    fxExpenseId: number;
    openingTxId: number;
    paidBillTxId: number;
    csvImportedTxId: number;
  };
  bills: {
    overdueBillId: number;
    upcomingBillId: number;
    creditRepaymentBillId: number;
    paidBillId: number;
  };
  goals: {
    activeWithHistoryGoalId: number;
    activeZeroHistoryGoalId: number;
    achievedGoalId: number;
  };
  duplicateSamplePath: string;
}

export async function seedFullAuditWorkspace(
  request: APIRequestContext,
  baseURL: string,
  csrf: string,
  tempDbPath: string,
  tempStatementsPath: string,
): Promise<SeededWorkspace> {
  // 1. Run sample-workspace reset FIRST (seeds 2026-04..2026-09 history & legacy statement uploads)
  const preview = await apiGet<{ version: string }>(request, baseURL, "sample-workspace");
  await apiMutate(request, baseURL, csrf, "POST", "sample-workspace", {
    version: preview.version,
    confirmation: "RESET MY WORKSPACE",
    requestKey: randomUUID(),
  });

  const baseAccounts = await apiGet<Array<{ id: number; name: string; type: string }>>(
    request,
    baseURL,
    "accounts",
  );
  const unionBankCardId = baseAccounts.find(a => a.name === "UnionBank Credit Card")!.id;
  const bdoBankId = baseAccounts.find(a => a.name === "BDO Mastercard Debit account")!.id;
  const cashOnHandId = baseAccounts.find(a => a.name === "Cash on Hand")!.id;
  const easyCashLoanId = baseAccounts.find(a => a.name === "EasyCash Loan")!.id;

  const baseCategories = await apiGet<Array<{ id: number; name: string; kind: string }>>(
    request,
    baseURL,
    "categories",
  );
  const ensureCat = async (name: string, kind: "expense" | "income") => {
    const found = baseCategories.find(
      c => c.name.toLowerCase() === name.toLowerCase() && c.kind === kind,
    );
    if (found) return { id: found.id };
    return apiMutate<{ id: number }>(request, baseURL, csrf, "POST", "categories", {
      name,
      kind,
    });
  };
  const statementExpensesId = (await ensureCat("Statement expenses", "expense")).id;
  const cashIncomeId = (await ensureCat("Cash income", "income")).id;

  // 2. Create additional categories
  const groceries = await ensureCat("Groceries & Dining", "expense");
  const utilities = await ensureCat("Utilities & Connectivity", "expense");
  const software = await ensureCat("Software & Cloud", "expense");
  const transport = await ensureCat("Transport", "expense");
  const freelance = await ensureCat("Freelance & Consulting", "income");

  // 3. Create additional accounts
  const gcash = await apiMutate<{ id: number }>(request, baseURL, csrf, "POST", "accounts", {
    name: "GCash Digital Wallet",
    type: "wallet",
    issuer: "GCash",
    liquid: true,
    openingDate: "2026-04-01",
    openingBalance: "28500.00",
  });
  const bpiUsdCard = await apiMutate<{ id: number }>(request, baseURL, csrf, "POST", "accounts", {
    name: "BPI Blue Mastercard",
    type: "credit_card",
    issuer: "BPI",
    product: "Blue Rewards Card",
    network: "Mastercard",
    last4: "4821",
    creditLimit: "90000.00",
    openingDate: "2026-05-01",
    openingBalance: "0",
  });
  const metrobankCard = await apiMutate<{ id: number }>(
    request,
    baseURL,
    csrf,
    "POST",
    "accounts",
    {
      name: "Metrobank Travel Visa",
      type: "credit_card",
      issuer: "Metrobank",
      product: "Travel Platinum Visa",
      network: "Visa",
      last4: "9104",
      creditLimit: "120000.00",
      openingDate: "2026-10-01",
      openingBalance: "0",
    },
  );
  const rcbcEmptyCard = await apiMutate<{ id: number }>(
    request,
    baseURL,
    csrf,
    "POST",
    "accounts",
    {
      name: "RCBC Flex Visa",
      type: "credit_card",
      issuer: "RCBC",
      product: "Flex Gold Visa",
      network: "Visa",
      last4: "3319",
      creditLimit: "80000.00",
      openingDate: "2026-06-01",
      openingBalance: "0",
    },
  );
  const archivedWallet = await apiMutate<{ id: number }>(
    request,
    baseURL,
    csrf,
    "POST",
    "accounts",
    {
      name: "Maya Savings Archive",
      type: "wallet",
      issuer: "Maya",
      liquid: true,
      openingDate: "2026-04-01",
      openingBalance: "0",
    },
  );
  const bullionAsset = await apiMutate<{ id: number }>(request, baseURL, csrf, "POST", "accounts", {
    name: "Emergency Reserve Vault",
    type: "asset",
    liquid: false,
    openingDate: "2026-04-01",
    openingBalance: "75000.00",
  });

  const minor = (decimal: string) => Math.round(Number(decimal) * 100);

  // 4. Create October 2026 transactions (> 22 rows in 2026-10 so pagination has 2 pages)
  await apiMutate(request, baseURL, csrf, "POST", "transactions", {
    kind: "income",
    date: "2026-10-01",
    amount: minor("85000.00"),
    accountId: bdoBankId,
    categoryId: cashIncomeId,
    merchant: "Acme Labs Payroll",
    description: "October salary deposit",
    notes: "Direct deposit",
    idempotencyKey: randomUUID(),
  });
  await apiMutate(request, baseURL, csrf, "POST", "transactions", {
    kind: "income",
    date: "2026-10-08",
    amount: minor("24000.00"),
    accountId: gcash.id,
    categoryId: freelance.id,
    merchant: "Design Systems Advisory",
    description: "UI architecture retainer",
    idempotencyKey: randomUUID(),
  });

  const octExpenses: Array<{
    date: string;
    amount: string;
    accountId: number;
    categoryId: number;
    merchant: string;
    description: string;
    isInstallment?: boolean;
  }> = [
    { date: "2026-10-02", amount: "3450.00", accountId: bdoBankId, categoryId: groceries.id, merchant: "Landers Superstore", description: "Pantry bulk restock" },
    { date: "2026-10-03", amount: "1890.00", accountId: gcash.id, categoryId: groceries.id, merchant: "Robinsons Selections", description: "Fresh produce and dairy" },
    { date: "2026-10-04", amount: "620.00", accountId: gcash.id, categoryId: transport.id, merchant: "GrabTransport", description: "Airport ride" },
    { date: "2026-10-05", amount: "2450.00", accountId: bdoBankId, categoryId: groceries.id, merchant: "Wildflour Cafe", description: "Team brunch" },
    { date: "2026-10-06", amount: "1599.00", accountId: bdoBankId, categoryId: utilities.id, merchant: "Globe Postpaid", description: "Mobile data plan" },
    { date: "2026-10-07", amount: "480.00", accountId: cashOnHandId, categoryId: groceries.id, merchant: "Weekend Farmers Market", description: "Coffee beans & fruit" },
    { date: "2026-10-08", amount: "950.00", accountId: gcash.id, categoryId: transport.id, merchant: "Autosweep RFID", description: "Expressway toll reload" },
    { date: "2026-10-09", amount: "2980.00", accountId: bdoBankId, categoryId: groceries.id, merchant: "Marketplace Rustans", description: "Weekly household groceries" },
    { date: "2026-10-10", amount: "1200.00", accountId: gcash.id, categoryId: software.id, merchant: "JetBrains Suite", description: "IDE subscription" },
    { date: "2026-10-11", amount: "740.00", accountId: cashOnHandId, categoryId: groceries.id, merchant: "Tokyo Tokyo", description: "Lunch set" },
    { date: "2026-10-12", amount: "4200.00", accountId: unionBankCardId, categoryId: software.id, merchant: "(01/12) Keychron Workstation", description: "Installment keyboard & dock", isInstallment: true },
    { date: "2026-10-13", amount: "520.00", accountId: gcash.id, categoryId: transport.id, merchant: "Shell Mobility", description: "Fuel top-up" },
    { date: "2026-10-14", amount: "1450.00", accountId: bdoBankId, categoryId: utilities.id, merchant: "CleanWater Co", description: "Drinking water delivery" },
    { date: "2026-10-15", amount: "890.00", accountId: gcash.id, categoryId: groceries.id, merchant: "SaladStop", description: "Dinner bowls" },
    { date: "2026-10-16", amount: "670.00", accountId: cashOnHandId, categoryId: transport.id, merchant: "Beep Card Load", description: "Rail transit reload" },
    { date: "2026-10-17", amount: "1120.00", accountId: bdoBankId, categoryId: groceries.id, merchant: "MUJI Cafe", description: "Pastries & notebooks" },
    { date: "2026-10-18", amount: "540.00", accountId: gcash.id, categoryId: groceries.id, merchant: "Arabica Coffee", description: "Espresso beans" },
    { date: "2026-10-19", amount: "1350.00", accountId: bdoBankId, categoryId: transport.id, merchant: "Petron Service", description: "Highway fuel" },
  ];

  for (const exp of octExpenses) {
    await apiMutate(request, baseURL, csrf, "POST", "transactions", {
      kind: "expense",
      date: exp.date,
      amount: minor(exp.amount),
      accountId: exp.accountId,
      categoryId: exp.categoryId,
      merchant: exp.merchant,
      description: exp.description,
      isInstallment: exp.isInstallment,
      idempotencyKey: randomUUID(),
    });
  }

  // Foreign-currency expense with manual rate & included fee
  const fxTx = await apiMutate<{ id: number }>(request, baseURL, csrf, "POST", "transactions", {
    kind: "expense",
    date: "2026-10-20",
    amount: minor("1462.50"),
    originalCurrency: "USD",
    originalAmount: minor("25.00"),
    exchangeRate: "58.50",
    includedFee: minor("2.00"),
    feeEnabled: true,
    accountId: bdoBankId,
    categoryId: software.id,
    merchant: "Cloudflare Registrar",
    description: "Domain renewal with FX fee",
    notes: "Includes $2.00 cross-border fee",
    idempotencyKey: randomUUID(),
  });

  // Refund & transfers in 2026-10
  await apiMutate(request, baseURL, csrf, "POST", "transactions", {
    kind: "refund",
    date: "2026-10-20",
    amount: minor("450.00"),
    accountId: gcash.id,
    categoryId: groceries.id,
    merchant: "GrabFood Refund",
    description: "Missing item adjustment",
    idempotencyKey: randomUUID(),
  });

  await apiMutate(request, baseURL, csrf, "POST", "transactions", {
    kind: "transfer",
    date: "2026-10-12",
    amount: minor("3000.00"),
    accountId: gcash.id,
    counterAccountId: unionBankCardId,
    description: "UnionBank card partial transfer",
    idempotencyKey: randomUUID(),
  });

  await apiMutate(request, baseURL, csrf, "POST", "transactions", {
    kind: "transfer",
    date: "2026-10-14",
    amount: minor("5000.00"),
    accountId: bdoBankId,
    counterAccountId: gcash.id,
    description: "Wallet top-up from BDO",
    idempotencyKey: randomUUID(),
  });

  await apiMutate(request, baseURL, csrf, "POST", "transactions", {
    kind: "expense",
    date: "2026-10-16",
    amount: minor("2800.00"),
    accountId: bdoBankId,
    categoryId: software.id,
    merchant: "(02/06) Abenson Appliance Plan",
    description: "Debit installment plan",
    isInstallment: true,
    idempotencyKey: randomUUID(),
  });

  // 5. Import standalone Credit Card Statements (cc_statements)
  const sampleCsvText = fs.readFileSync(
    path.resolve(process.cwd(), "public/unionbank_april_2026_statement_sample.csv"),
    "utf8",
  );
  const aprV1Csv = sampleCsvText.replace(
    "Statement notes,",
    "Statement notes,v1 seed baseline",
  );
  const aprV1 = await apiMutate<{ existingId: number }>(
    request,
    baseURL,
    csrf,
    "POST",
    "credit-card-statements",
    {
      filename: "unionbank_april_2026_v1.csv",
      base64: Buffer.from(aprV1Csv, "utf8").toString("base64"),
      cardId: unionBankCardId,
      currency: "PHP",
      confirm: true,
      acknowledge: true,
      reviewNote: "Reviewed baseline April statement",
    },
  );

  const revisedAprCsv = sampleCsvText.replace(
    "Statement notes,",
    "Statement notes,Revised issue with corrected merchant note",
  );
  const duplicateSamplePath = path.join(tempStatementsPath, "unionbank_april_2026_seeded.csv");
  fs.writeFileSync(duplicateSamplePath, revisedAprCsv, "utf8");

  const aprV2 = await apiMutate<{ existingId: number }>(
    request,
    baseURL,
    csrf,
    "POST",
    "credit-card-statements",
    {
      filename: "unionbank_april_2026_seeded.csv",
      base64: Buffer.from(revisedAprCsv, "utf8").toString("base64"),
      cardId: unionBankCardId,
      currency: "PHP",
      supersedesId: aprV1.existingId,
      confirm: true,
      acknowledge: true,
      reviewNote: "Superseding April statement with corrected note",
    },
  );

  const octUnionBankCsv = [
    "Issuer,UnionBank",
    "Statement month/title,October 2026",
    'Statement date,"Oct 7, 2026"',
    'Due date,"Oct 25, 2026"',
    "Credit limit,164500.00",
    "Previous balance,4500.00",
    "New charges,18450.00",
    "Payments/credits,4500.00",
    "Outstanding balance,18450.00",
    "Minimum due,1200.00",
    "Statement notes,October 2026 cycle",
    "",
    "Sale date,Post date,Merchant,Amount,Type,Category,Transaction notes",
    '"Sep 28, 2026","Oct 1, 2026","APPLE.COM/BILL, SINGAPORE",6490.00,Charge,Software & Cloud,Annual cloud storage',
    '"Oct 2, 2026","Oct 3, 2026","S&R MEMBERSHIP SHOPPING, BGC",7760.00,Charge,Groceries & Dining,Monthly pantry haul',
    '"Oct 4, 2026","Oct 5, 2026","(01/12) KEYCHRON WORKSTATION",4200.00,Installment,Software & Cloud,Desk hardware installment',
    '"Oct 5, 2026","Oct 6, 2026","BDO ONLINE CARD PAYMENT",-4500.00,Payment,,Prior cycle payment',
    "",
  ].join("\n");

  const octUbStmt = await apiMutate<{ existingId: number }>(
    request,
    baseURL,
    csrf,
    "POST",
    "credit-card-statements",
    {
      filename: "unionbank_october_2026_statement.csv",
      base64: Buffer.from(octUnionBankCsv, "utf8").toString("base64"),
      cardId: unionBankCardId,
      currency: "PHP",
      confirm: true,
      acknowledge: true,
      reviewNote: "Reviewed October UnionBank statement",
    },
  );

  const octUbDetail = await apiGet<{
    lines: Array<{ id: number; amount: number; source: { rowNumber: number } }>;
  }>(request, baseURL, `credit-card-statements/${octUbStmt.existingId}`);

  // Annotate line 1
  if (octUbDetail.lines[0]) {
    await apiMutate(
      request,
      baseURL,
      csrf,
      "POST",
      `credit-card-statements/${octUbStmt.existingId}`,
      {
        action: "annotate",
        data: {
          lineId: octUbDetail.lines[0].id,
          type: "Charge",
          category: "Software & Cloud",
          notes: "Verified recurring Apple workspace plan",
        },
      },
    );
  }

  // Record 2 payments on UnionBank card: one allocated, one unallocated (so both allocation & correction UI show)
  await apiMutate(
    request,
    baseURL,
    csrf,
    "POST",
    `credit-card-statements/${octUbStmt.existingId}`,
    {
      action: "payment",
      data: {
        cardId: unionBankCardId,
        date: "2026-10-08",
        amount: "4500.00",
        currency: "PHP",
        sourceAccountId: bdoBankId,
        reference: "UB-OCT-PAY-001",
        notes: "Partial payment after statement issue",
        requestKey: randomUUID(),
      },
    },
  );

  await apiMutate(
    request,
    baseURL,
    csrf,
    "POST",
    `credit-card-statements/${octUbStmt.existingId}`,
    {
      action: "payment",
      data: {
        cardId: unionBankCardId,
        date: "2026-10-12",
        amount: "3000.00",
        currency: "PHP",
        sourceAccountId: gcash.id,
        reference: "UB-OCT-PAY-002",
        notes: "Unallocated payment matching Oct 12 transfer",
        requestKey: randomUUID(),
      },
    },
  );

  const octUbAfterPayments = await apiGet<{
    payments: Array<{ id: number; amount: number; reference: string }>;
  }>(request, baseURL, `credit-card-statements/${octUbStmt.existingId}`);
  const pay1 = octUbAfterPayments.payments.find(p => p.reference === "UB-OCT-PAY-001");
  if (pay1) {
    await apiMutate(
      request,
      baseURL,
      csrf,
      "POST",
      `credit-card-statements/${octUbStmt.existingId}`,
      {
        action: "allocate",
        data: {
          paymentId: pay1.id,
          statementId: octUbStmt.existingId,
          amount: "4500.00",
        },
      },
    );
  }

  // Import USD statement on BPI Blue Mastercard
  const octBpiUsdCsv = [
    "Issuer,BPI",
    "Statement month/title,October 2026 USD",
    'Statement date,"Oct 10, 2026"',
    'Due date,"Oct 27, 2026"',
    "Credit limit,2000.00",
    "Previous balance,0.00",
    "New charges,320.50",
    "Payments/credits,0.00",
    "Outstanding balance,320.50",
    "Minimum due,35.00",
    "Statement notes,USD travel billing",
    "",
    "Sale date,Post date,Merchant,Amount,Type,Category,Transaction notes",
    '"Oct 2, 2026","Oct 4, 2026","VERCEL INC, SAN FRANCISCO",20.00,Charge,Software & Cloud,Pro hosting',
    '"Oct 6, 2026","Oct 8, 2026","AWS CLOUD SERVICES, SEATTLE",300.50,Charge,Software & Cloud,October cluster compute',
    "",
  ].join("\n");

  const octBpiUsd = await apiMutate<{ existingId: number }>(
    request,
    baseURL,
    csrf,
    "POST",
    "credit-card-statements",
    {
      filename: "bpi_october_2026_usd_statement.csv",
      base64: Buffer.from(octBpiUsdCsv, "utf8").toString("base64"),
      cardId: bpiUsdCard.id,
      currency: "USD",
      confirm: true,
      acknowledge: true,
      reviewNote: "Reviewed October USD statement",
    },
  );

  // Import pre-history statement on Metrobank Travel Visa (opened 2026-10-01, row posted 2026-09-25)
  const metrobankPreHistoryCsv = [
    "Issuer,Metrobank",
    "Statement month/title,October 2026",
    'Statement date,"Oct 5, 2026"',
    'Due date,"Oct 26, 2026"',
    "Credit limit,120000.00",
    "Previous balance,0.00",
    "New charges,5400.00",
    "Payments/credits,0.00",
    "Outstanding balance,5400.00",
    "Minimum due,500.00",
    "Statement notes,Includes September pre-opening charge",
    "",
    "Sale date,Post date,Merchant,Amount,Type,Category,Transaction notes",
    '"Sep 24, 2026","Sep 25, 2026","PAGSS PREMIUM LOUNGE, NAIA",2200.00,Charge,Transport,Pre-history lounge visit',
    '"Oct 2, 2026","Oct 3, 2026","CEBU PACIFIC AIR, PASAY",3200.00,Charge,Transport,Domestic flight booking',
    "",
  ].join("\n");

  const octMetrobank = await apiMutate<{ existingId: number }>(
    request,
    baseURL,
    csrf,
    "POST",
    "credit-card-statements",
    {
      filename: "metrobank_october_2026_prehistory.csv",
      base64: Buffer.from(metrobankPreHistoryCsv, "utf8").toString("base64"),
      cardId: metrobankCard.id,
      currency: "PHP",
      confirm: true,
      acknowledge: true,
      reviewNote: "Reviewed Metrobank pre-history statement",
    },
  );

  // 6. Seed Legacy Archive, CSV Import Batch, Pre-history Legacy Upload, and Failed Legacy Upload
  const archiveCsv = sampleCsvText.replace(
    "Statement month/title,April 2026",
    "Statement month/title,April 2026 Reference Archive",
  );
  const savedArchive = await apiMutate<{ id: number }>(
    request,
    baseURL,
    csrf,
    "POST",
    "statement-archives",
    {
      filename: "unionbank_april_2026_reference_archive.csv",
      mime: "text/csv",
      base64: Buffer.from(archiveCsv, "utf8").toString("base64"),
      accountId: unionBankCardId,
    },
  );

  await apiMutate(request, baseURL, csrf, "POST", "csv-imports", {
    action: "commit",
    accountId: bdoBankId,
    csv: [
      "date,description,merchant,type,amount",
      "2026-10-04,Pharmacy essentials,Mercury Drug,expense,640.00",
      "2026-10-06,Advisory Milestone Payment,Client Milestone,income,12500.00",
    ].join("\n"),
    mappings: {},
  });

  const preHistoryTxCsv = [
    "date,description,merchant,type,amount,category,source_id,destination",
    "2026-09-20,Pre-history card annual fee,Metrobank Annual Fee,expense,2500.00,Utilities & Connectivity,MB-PRE-001,",
  ].join("\n");
  let preHistoryUpload = await apiMutate<{ id?: number; preview?: boolean; version?: string }>(
    request,
    baseURL,
    csrf,
    "POST",
    "statements",
    {
      accountId: metrobankCard.id,
      filename: "metrobank_prehistory_ledger_import.csv",
      mime: "text/csv",
      base64: Buffer.from(preHistoryTxCsv, "utf8").toString("base64"),
    },
  );
  if (preHistoryUpload.preview && preHistoryUpload.version) {
    preHistoryUpload = await apiMutate<{ id: number }>(
      request,
      baseURL,
      csrf,
      "POST",
      "statements",
      {
        accountId: metrobankCard.id,
        filename: "metrobank_prehistory_ledger_import.csv",
        mime: "text/csv",
        base64: Buffer.from(preHistoryTxCsv, "utf8").toString("base64"),
        confirmation: preHistoryUpload.version,
      },
    );
  }

  // Direct SQLite updates on tempDbPath for states without a direct creation endpoint:
  // - Archive Maya Savings Archive account
  // - Insert 1 failed upload in `statements` with backing file so RemoveStatementDialog (removable=true) & "Retry parsing file" both work
  const sqlite = new Database(tempDbPath);
  let failedBatchId = 0;
  let csvImportBatchId = 1;
  let openingTxId = 1;
  let csvImportedTxId = 1;
  try {
    sqlite
      .prepare("UPDATE accounts SET archived_at = '2026-10-01T00:00:00.000Z' WHERE id = ?")
      .run(archivedWallet.id);

    const ownerRow = sqlite.prepare("SELECT id FROM users ORDER BY id LIMIT 1").get() as {
      id: number;
    };
    const failedFileKey = `${randomUUID()}.csv`;
    const failedBytes = Buffer.from("corrupted,header\n1,2\n", "utf8");
    fs.writeFileSync(path.join(tempStatementsPath, failedFileKey), failedBytes, { mode: 0o600 });
    const failedHash = createHash("sha256").update(failedBytes).digest("hex");
    const info = sqlite
      .prepare(
        "INSERT INTO statements(owner_id,account_id,filename,file_key,file_hash,size,status,error) VALUES(?,?,?,?,?,?,'failed','CSV is missing required date, type, description and amount columns.')",
      )
      .run(
        ownerRow.id,
        bdoBankId,
        "broken_bank_export_october.csv",
        failedFileKey,
        failedHash,
        failedBytes.length,
      );
    failedBatchId = Number(info.lastInsertRowid);

    const csvBatchRow = sqlite
      .prepare("SELECT id FROM csv_import_batches ORDER BY id DESC LIMIT 1")
      .get() as { id: number } | undefined;
    if (csvBatchRow) csvImportBatchId = csvBatchRow.id;

    const openRow = sqlite
      .prepare(
        "SELECT t.id FROM transactions t JOIN accounts a ON a.id = t.account_id WHERE t.kind = 'opening' AND t.voided_at IS NULL AND a.type <> 'credit_card' ORDER BY t.id DESC LIMIT 1",
      )
      .get() as { id: number } | undefined;
    if (openRow) openingTxId = openRow.id;

    const csvTxRow = sqlite
      .prepare(
        "SELECT transaction_id FROM csv_import_rows WHERE account_id = ? AND transaction_id IS NOT NULL ORDER BY id DESC LIMIT 1",
      )
      .get(bdoBankId) as { transaction_id: number } | undefined;
    if (csvTxRow) csvImportedTxId = csvTxRow.transaction_id;
  } finally {
    sqlite.close();
  }

  const allStatements = await apiGet<Array<{ id: number; needs_review: number; status: string }>>(
    request,
    baseURL,
    "statements",
  );
  const needsAttentionBatch =
    allStatements.find(s => s.id !== preHistoryUpload.id && s.needs_review > 0) ?? allStatements[0];

  // 7. Seed Budgets for 2026-10 (1 over-limit expense, 1 under-limit expense, 1 income target)
  await apiMutate(request, baseURL, csrf, "POST", "budgets", {
    month: FIXED_MONTH,
    name: "Monthly Food & Groceries",
    categoryId: groceries.id,
    amount: "8000.00",
  });
  await apiMutate(request, baseURL, csrf, "POST", "budgets", {
    month: FIXED_MONTH,
    name: "Home Utilities & Fiber",
    categoryId: utilities.id,
    amount: "9500.00",
  });
  await apiMutate(request, baseURL, csrf, "POST", "budgets", {
    month: FIXED_MONTH,
    name: "Advisory Income Target",
    categoryId: freelance.id,
    amount: "40000.00",
  });

  // 8. Seed Bills for 2026-10 (overdue, upcoming, credit_repayment, paid)
  const overdueBill = await apiMutate<{ id: number }>(request, baseURL, csrf, "POST", "bills", {
    name: "PLDT Home Fiber",
    amount: "2099.00",
    dueDate: "2026-10-18",
    paymentKind: "expense",
    categoryId: utilities.id,
    cadence: "monthly",
    notes: "Account #884120",
  });
  const upcomingBill = await apiMutate<{ id: number }>(request, baseURL, csrf, "POST", "bills", {
    name: "Meralco Electric Line",
    amount: "4350.00",
    dueDate: "2026-10-28",
    paymentKind: "expense",
    categoryId: utilities.id,
    cadence: "monthly",
    notes: "October billing cycle",
  });
  const creditRepaymentBill = await apiMutate<{ id: number }>(
    request,
    baseURL,
    csrf,
    "POST",
    "bills",
    {
      name: "UnionBank Card Statement Due",
      amount: "18450.00",
      dueDate: "2026-10-25",
      paymentKind: "credit_repayment",
      cadence: "once",
      notes: "Full statement balance repayment reminder",
    },
  );
  const paidBill = await apiMutate<{ id: number }>(request, baseURL, csrf, "POST", "bills", {
    name: "Manila Water Supply",
    amount: "780.00",
    dueDate: "2026-10-10",
    paymentKind: "expense",
    categoryId: utilities.id,
    cadence: "once",
    notes: "Paid via BDO debit",
  });
  const paidBillPayment = await apiMutate<{ id: number }>(
    request,
    baseURL,
    csrf,
    "POST",
    "bill-payments",
    {
      billId: paidBill.id,
      date: "2026-10-10",
      accountId: bdoBankId,
    },
  );

  // 9. Seed Goals & Contributions
  const activeWithHistoryGoal = await apiMutate<{ id: number }>(
    request,
    baseURL,
    csrf,
    "POST",
    "goals",
    {
      name: "Emergency Liquidity Buffer",
      target: "150000.00",
      dueDate: "2026-12-31",
      notes: "Six months core household expenses",
    },
  );
  await apiMutate(request, baseURL, csrf, "POST", "goal-contributions", {
    goalId: activeWithHistoryGoal.id,
    amount: "25000.00",
    date: "2026-10-05",
    notes: "Initial October transfer",
    requestKey: randomUUID(),
  });
  await apiMutate(request, baseURL, csrf, "POST", "goal-contributions", {
    goalId: activeWithHistoryGoal.id,
    amount: "15000.00",
    date: "2026-10-15",
    notes: "Mid-month freelance allocation",
    requestKey: randomUUID(),
  });

  const activeZeroHistoryGoal = await apiMutate<{ id: number }>(
    request,
    baseURL,
    csrf,
    "POST",
    "goals",
    {
      name: "Autumn Kyoto Travel Fund",
      target: "50000.00",
      dueDate: "2026-10-30",
      notes: "Flights and rail pass",
    },
  );

  const achievedGoal = await apiMutate<{ id: number }>(request, baseURL, csrf, "POST", "goals", {
    name: "Home Studio Display Upgrade",
    target: "30000.00",
    dueDate: "2026-10-20",
    notes: "27-inch reference monitor",
  });
  await apiMutate(request, baseURL, csrf, "POST", "goal-contributions", {
    goalId: achievedGoal.id,
    amount: "30000.00",
    date: "2026-10-12",
    notes: "Full target allocation reached",
    requestKey: randomUUID(),
  });

  // 10. Seed Merchant Rules & Service Providers
  await apiMutate(request, baseURL, csrf, "POST", "merchant-rules", {
    phrase: "MERALCO",
    kind: "expense",
    categoryId: utilities.id,
    priority: 10,
    enabled: true,
  });
  await apiMutate(request, baseURL, csrf, "POST", "merchant-rules", {
    phrase: "GRAB",
    kind: "expense",
    categoryId: transport.id,
    priority: 20,
    enabled: true,
  });
  await apiMutate(request, baseURL, csrf, "POST", "providers", {
    name: "Meralco",
    categoryId: utilities.id,
  });
  await apiMutate(request, baseURL, csrf, "POST", "providers", {
    name: "PLDT Home",
    categoryId: utilities.id,
  });
  await apiMutate(request, baseURL, csrf, "POST", "providers", {
    name: "LBC Express",
    categoryId: null,
  });

  return {
    csrf,
    accounts: {
      unionBankCardId,
      bdoBankId,
      cashOnHandId,
      easyCashLoanId,
      gcashWalletId: gcash.id,
      bpiUsdCardId: bpiUsdCard.id,
      metrobankCardId: metrobankCard.id,
      rcbcEmptyCardId: rcbcEmptyCard.id,
      archivedWalletId: archivedWallet.id,
      bullionAssetId: bullionAsset.id,
    },
    categories: {
      statementExpensesId,
      cashIncomeId,
      groceriesId: groceries.id,
      utilitiesId: utilities.id,
      softwareId: software.id,
      transportId: transport.id,
      freelanceIncomeId: freelance.id,
    },
    ccStatements: {
      aprSupersededId: aprV1.existingId,
      aprActiveId: aprV2.existingId,
      octUnionBankId: octUbStmt.existingId,
      octBpiUsdId: octBpiUsd.existingId,
      octMetrobankPreHistoryId: octMetrobank.existingId,
    },
    legacyStatements: {
      needsAttentionBatchId: needsAttentionBatch.id,
      preHistoryBatchId: preHistoryUpload.id,
      failedBatchId,
      csvImportBatchId,
      archiveId: savedArchive.id,
    },
    transactions: {
      fxExpenseId: fxTx.id,
      openingTxId,
      paidBillTxId: paidBillPayment.id,
      csvImportedTxId,
    },
    bills: {
      overdueBillId: overdueBill.id,
      upcomingBillId: upcomingBill.id,
      creditRepaymentBillId: creditRepaymentBill.id,
      paidBillId: paidBill.id,
    },
    goals: {
      activeWithHistoryGoalId: activeWithHistoryGoal.id,
      activeZeroHistoryGoalId: activeZeroHistoryGoal.id,
      achievedGoalId: achievedGoal.id,
    },
    duplicateSamplePath,
  };
}
