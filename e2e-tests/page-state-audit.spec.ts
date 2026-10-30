import fs from "node:fs";
import path from "node:path";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import {
  attachMonitors,
  createAuditCollector,
  FIXED_MONTH,
  FIXED_TIME_ISO,
  flushQueryRetries,
  installDeterministicClock,
  OWNER_PASSWORD,
  OWNER_USERNAME,
  seedFullAuditWorkspace,
  settlePage,
  setupAndLoginApi,
  withFaultRoutes,
  withHeldRoutes,
  type PageMonitor,
  type SeededWorkspace,
} from "./fixtures/audit-harness";

test.describe.configure({ mode: "serial" });

test.describe("Luna Page-State Comprehensive Audit & Screenshot Suite", () => {
  let collector: ReturnType<typeof createAuditCollector>;
  let seeded: SeededWorkspace;
  let tempDbPath: string;
  let tempStatementsPath: string;
  let setupToken: string;
  let outputDir: string;
  let monitor: PageMonitor;

  test.beforeAll(async ({ request, baseURL }) => {
    tempDbPath = process.env.LUNA_AUDIT_DB_PATH ?? path.resolve(process.cwd(), "data/luna.sqlite");
    tempStatementsPath =
      process.env.LUNA_AUDIT_STATEMENTS_PATH ??
      path.resolve(process.cwd(), "private-statements");
    setupToken = process.env.LUNA_AUDIT_SETUP_TOKEN ?? "isolated-fixture-setup";
    outputDir =
      process.env.LUNA_AUDIT_OUTPUT_DIR ??
      path.resolve(process.cwd(), "test-results/page-screenshots");

    collector = createAuditCollector(outputDir);
  });

  test.afterAll(async () => {
    if (collector) {
      collector.writeReports();
    }
  });

  async function initAuditPage(
    page: Page,
    context: BrowserContext,
    viewport: { width: number; height: number } = { width: 1440, height: 900 },
  ) {
    await page.setViewportSize(viewport);
    await installDeterministicClock(page, FIXED_TIME_ISO);
    monitor = attachMonitors(page);
    return monitor;
  }

  // =========================================================================
  // PHASE 0: Public, Unauthenticated & Guard States
  // =========================================================================
  test("Phase 0: Public, unauthenticated, login, auth-guard, and 404 states", async ({
    page,
    context,
  }) => {
    test.setTimeout(240_000);
    const mon = await initAuditPage(page, context, { width: 1440, height: 900 });

    // 0.1 /does-not-exist -> 404 Page Not Found
    await page.goto("/does-not-exist");
    await collector.captureState(page, mon, {
      group: "00-auth-and-public",
      slug: "not-found-404",
      title: "Page Not Found (404 Error Screen)",
      expectText: "Page not found",
    });

    // 0.2 /login -> Sign-in Default view
    await page.goto("/login");
    await collector.captureState(page, mon, {
      group: "00-auth-and-public",
      slug: "login-signin-default",
      title: "Login Screen (Sign-in Default View)",
      expectText: ["Welcome back.", "Sign in"],
    });

    // 0.3 /login -> First-time Owner Setup view
    await page.getByRole("button", { name: "First time here? Set up owner account" }).click();
    await collector.captureState(page, mon, {
      group: "00-auth-and-public",
      slug: "login-setup-owner",
      title: "Login Screen (First-Time Owner Setup View)",
      expectText: ["Make it yours.", "Create account", "Setup token (if required)"],
    });

    // Switch back to sign-in
    await page.getByRole("button", { name: "I already have an account" }).click();

    // 0.4 /login -> Submitting Busy State (hold /api/auth/login)
    await withHeldRoutes(page, ["**/api/auth/login"], async () => {
      await page.fill('input[autocomplete="username"]', "temporary_user");
      await page.fill('input[autocomplete="current-password"]', "temporary_password");
      await page.locator("button.action").click();
      await page.getByText("Signing in to your workspace…").waitFor({ state: "visible", timeout: 4000 });
      await collector.captureState(page, mon, {
        group: "00-auth-and-public",
        slug: "login-submitting-busy",
        title: "Login Screen (Submitting Busy State)",
        expectText: "Signing in to your workspace…",
      });
    });

    // 0.5 /login -> Invalid Credentials Alert
    await withFaultRoutes(
      page,
      ["**/api/auth/login"],
      400,
      { statusCode: 400, message: "Invalid username or password" },
      async () => {
        await page.locator("button.action").click();
        await page.locator("#login-error").waitFor({ state: "visible", timeout: 4000 });
        await collector.captureState(page, mon, {
          group: "00-auth-and-public",
          slug: "login-invalid-credentials",
          title: "Login Screen (Invalid Credentials Error Alert)",
          expectText: "The username or password is incorrect. Check both and try again. Usernames are case-sensitive.",
          allowApiError: (url, status) => url.includes("/api/auth/login") && status === 400,
        });
      },
    );

    // 0.6 /login -> Rate Limited Alert (429)
    await withFaultRoutes(
      page,
      ["**/api/auth/login"],
      429,
      { statusCode: 429, message: "Too many sign-in attempts. Try again in 15 minutes." },
      async () => {
        await page.locator("button.action").click();
        await page.getByText("Too many sign-in attempts").waitFor({ state: "visible", timeout: 4000 });
        await collector.captureState(page, mon, {
          group: "00-auth-and-public",
          slug: "login-rate-limited",
          title: "Login Screen (Rate Limited 429 Alert)",
          expectText: "Too many sign-in attempts. Try again in 15 minutes.",
          allowApiError: (url, status) => url.includes("/api/auth/login") && status === 429,
        });
      },
    );

    // 0.7 Protected.tsx -> Checking Session Loading State
    await withHeldRoutes(page, ["**/api/auth/me"], async () => {
      void page.goto("/");
      await page.getByText("Checking your session…").waitFor({ state: "visible", timeout: 4000 });
      await collector.captureState(page, mon, {
        group: "00-auth-and-public",
        slug: "protected-checking-session",
        title: "Protected Route Guard (Checking Session Loading State)",
        expectText: "Checking your session…",
      });
    });

    // 0.8 Protected.tsx -> 500 Cannot open your workspace & Retry button
    await withFaultRoutes(
      page,
      ["**/api/auth/me"],
      500,
      { statusCode: 500, message: "Database connection failed unexpectedly" },
      async () => {
        await page.goto("/");
        await page.getByText("Cannot open your workspace").waitFor({ state: "visible", timeout: 4000 });
        await collector.captureState(page, mon, {
          group: "00-auth-and-public",
          slug: "protected-500-cannot-open",
          title: "Protected Route Guard (500 Error Screen with Retry Action)",
          expectText: ["Cannot open your workspace", "Check connection and retry"],
          allowApiError: (url, status) => url.includes("/api/auth/me") && status === 500,
        });
      },
    );

    // 0.9 Protected.tsx -> 401 Unauthorized redirects to /login
    await page.goto("/");
    await page.waitForURL("**/login", { timeout: 8000 });
    await collector.captureState(page, mon, {
      group: "00-auth-and-public",
      slug: "protected-unauthorized-redirect",
      title: "Protected Route Guard (Unauthorized Redirected to Login)",
      expectText: "Welcome back.",
    });

    // 0.10 Mobile Viewport /login
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/login");
    await collector.captureState(page, mon, {
      group: "00-auth-and-public",
      slug: "login-mobile-view",
      title: "Login Screen (Mobile Viewport 390x844)",
      viewport: "mobile-390",
      expectText: ["Welcome back.", "Sign in"],
    });
  });

  // =========================================================================
  // PHASE 1: Live Zero-State Empty Workspace
  // =========================================================================
  test("Phase 1: Live zero-state empty workspace verification across all routes", async ({
    page,
    context,
    request,
    baseURL,
  }) => {
    test.setTimeout(240_000);
    const mon = await initAuditPage(page, context, { width: 1440, height: 900 });

    // 1. Setup owner account & login via API to get session cookie into Playwright context
    const { csrf } = await setupAndLoginApi(request, baseURL!, setupToken);
    const storage = await request.storageState();
    await context.addCookies(storage.cookies);

    // 1.1 / (Dashboard Overview empty)
    await page.goto("/");
    await page.getByRole("heading", { name: "Overview", level: 1 }).waitFor({ state: "visible" });
    await collector.captureState(page, mon, {
      group: "02-overview",
      slug: "empty-workspace-dashboard",
      title: "Overview Dashboard (Empty Zero-State Workspace)",
      expectText: ["No posted activity this month.", "No accounts yet.", "No recorded spending in this period."],
      waitForCharts: true,
    });

    // 1.2 /analytics (Empty period)
    await page.goto("/analytics");
    await page.getByRole("heading", { name: "Analytics", level: 1 }).waitFor({ state: "visible" });
    await collector.captureState(page, mon, {
      group: "03-analytics",
      slug: "empty-period-analytics",
      title: "Analytics Page (Empty Zero-State Period)",
      expectText: ["No categorized spending recorded in this period.", "No account coverage recorded."],
      waitForCharts: true,
    });

    // 1.3 /accounts (Empty workspace)
    await page.goto("/accounts");
    await page.getByRole("heading", { name: "Accounts", level: 1 }).waitFor({ state: "visible" });
    await collector.captureState(page, mon, {
      group: "04-accounts",
      slug: "empty-workspace-accounts",
      title: "Accounts Page (Empty Zero-State Workspace)",
      expectText: ["No accounts in this group.", "Not provided"],
    });

    // 1.4 /transactions?period=all (Empty all-time)
    await page.goto("/transactions?period=all");
    await collector.captureState(page, mon, {
      group: "06-transactions",
      slug: "empty-all-time-transactions",
      title: "Transactions Page (Empty All-Time Zero State)",
      expectText: "No posted records yet. Set up an account and add a transaction.",
    });

    // 1.5 /transactions (Empty current-month)
    await page.goto("/transactions");
    await collector.captureState(page, mon, {
      group: "06-transactions",
      slug: "empty-month-transactions",
      title: "Transactions Page (Empty Month Filter Zero State)",
      expectText: "No transactions match these filters.",
    });

    // 1.6 App Shell -> Transaction Entry Dialog when no accounts exist (block gate)
    await page.goto("/transactions?new=1");
    await page.getByRole("dialog").waitFor({ state: "visible" });
    await collector.captureState(page, mon, {
      group: "01-app-shell",
      slug: "transaction-modal-no-accounts-gate",
      title: "App Shell (Add Transaction Dialog with No Accounts Gate)",
      expectText: "Set up accounts before saving.",
    });
    await page.keyboard.press("Escape");

    // 1.7 /statements?tab=transactions (Empty statement transactions)
    await page.goto("/statements?tab=transactions");
    await page.getByRole("heading", { name: "Statements", level: 1 }).waitFor({ state: "visible" });
    await collector.captureState(page, mon, {
      group: "07-statements",
      slug: "empty-statement-transactions",
      title: "Statements Page (Empty Statement Transactions Zero State)",
      expectText: "No lines match these activity filters. Clear filters to restore the selected statements’ imported activity.",
    });

    // 1.8 /statements?tab=statements (Empty statements catalog)
    await page.goto("/statements?tab=statements");
    await collector.captureState(page, mon, {
      group: "07-statements",
      slug: "empty-statements-catalog",
      title: "Statements Page (Empty Statements Catalog Zero State)",
      expectText: "No issued statements match this selection. Clear filters or visit Import & Export; missing balances are unknown, not zero.",
    });

    // 1.9 /import-export?tab=import (No cards available gate)
    await page.goto("/import-export?tab=import");
    await collector.captureState(page, mon, {
      group: "08-import-export",
      slug: "import-tab-no-cards-gate",
      title: "Import & Export (Import Tab with No Active Credit Cards Gate)",
      expectText: "No active credit cards. Create a credit card account first.",
    });

    // 1.10 /import-export?tab=history (No account selected)
    await page.goto("/import-export?tab=history");
    await collector.captureState(page, mon, {
      group: "08-import-export",
      slug: "history-tab-unselected-account",
      title: "Import & Export (History Tab with No Account Selected)",
      expectText: "Select an account to review earlier ledger imports.",
    });

    // 1.11 /import-export?tab=export (Export idle state)
    await page.goto("/import-export?tab=export");
    await collector.captureState(page, mon, {
      group: "08-import-export",
      slug: "export-tab-idle-state",
      title: "Import & Export (Export Tab Idle State)",
      expectText: ["Export all transactions", "Export workspace records"],
    });

    // 1.12 /budgets (Empty expenses & empty income)
    await page.goto("/budgets");
    await collector.captureState(page, mon, {
      group: "09-budgets",
      slug: "empty-expenses-budget",
      title: "Budgets Page (Empty Expenses Tab Zero State)",
      expectText: `No expense budgets in ${FIXED_MONTH}.`,
    });

    await page.getByRole("tab", { name: "Income" }).click();
    await collector.captureState(page, mon, {
      group: "09-budgets",
      slug: "empty-income-budget",
      title: "Budgets Page (Empty Income Tab Zero State)",
      expectText: `No income budgets in ${FIXED_MONTH}.`,
    });

    // 1.13 /bills (Empty bills)
    await page.goto("/bills");
    await collector.captureState(page, mon, {
      group: "10-bills",
      slug: "empty-bills-zero-state",
      title: "Bills Page (Empty Zero-State Reminders)",
      expectText: "No bill reminders yet. Add a planning record to begin.",
    });

    // 1.14 /goals (Empty goals)
    await page.goto("/goals");
    await collector.captureState(page, mon, {
      group: "11-goals",
      slug: "empty-goals-zero-state",
      title: "Goals Page (Empty Zero-State Targets)",
      expectText: "No goals yet. Create a target to begin.",
    });

    // 1.15 /settings?tab=mappings (Empty merchant rules)
    await page.goto("/settings");
    await page.getByRole("tab", { name: "mappings" }).click();
    await collector.captureState(page, mon, {
      group: "12-settings",
      slug: "mappings-tab-empty",
      title: "Settings Page (Merchant Mapping Rules Empty State)",
      expectText: "No merchant rules yet.",
    });

    // 1.16 /settings?tab=providers (Empty providers)
    await page.getByRole("tab", { name: "providers" }).click();
    await collector.captureState(page, mon, {
      group: "12-settings",
      slug: "providers-tab-empty",
      title: "Settings Page (Service Providers Empty State)",
      expectText: "No providers yet.",
    });

    // 1.17 App Shell -> Search with no results
    const searchInput = page.locator('header input[placeholder="Search your workspace…"]');
    await searchInput.fill("nonexistent-item-query");
    await page.getByText("No matching records in your workspace.").waitFor({ state: "visible", timeout: 4000 });
    await collector.captureState(page, mon, {
      group: "01-app-shell",
      slug: "search-combobox-empty-results",
      title: "App Shell (Global Search Combobox with Zero Results)",
      expectText: "No matching records in your workspace.",
    });
    await page.keyboard.press("Escape");
  });

  // =========================================================================
  // PHASE 2: Live Populated, Interactive, Dialog, Redirect & Mobile States
  // =========================================================================
  test("Phase 2: Comprehensive populated states across all routes, tabs, popovers, modals & viewports", async ({
    page,
    context,
    request,
    baseURL,
  }) => {
    test.setTimeout(480_000);
    const mon = await initAuditPage(page, context, { width: 1440, height: 900 });

    // Seed the comprehensive synthetic audit dataset
    const { csrf } = await setupAndLoginApi(request, baseURL!, setupToken);
    seeded = await seedFullAuditWorkspace(request, baseURL!, csrf, tempDbPath, tempStatementsPath);
    const storage = await request.storageState();
    await context.addCookies(storage.cookies);

    // -----------------------------------------------------------------------
    // GROUP 01: App Shell (Desktop & Mobile)
    // -----------------------------------------------------------------------
    await page.goto("/");
    await page.getByRole("heading", { name: "Overview", level: 1 }).waitFor({ state: "visible" });

    // Desktop search with populated results
    const desktopSearch = page.locator('header input[placeholder="Search your workspace…"]');
    await desktopSearch.fill("BDO");
    await page.locator("#search-results").waitFor({ state: "visible", timeout: 4000 });
    await collector.captureState(page, mon, {
      group: "01-app-shell",
      slug: "desktop-search-results-open",
      title: "App Shell (Desktop Search Combobox with Filtered Matches)",
      expectText: "results",
    });
    await page.keyboard.press("Escape");

    // Add Transaction Dialog from header
    await page.locator("header").getByRole("button", { name: "Add transaction" }).click();
    await page.getByRole("dialog").waitFor({ state: "visible" });
    await collector.captureState(page, mon, {
      group: "01-app-shell",
      slug: "add-transaction-dialog-open",
      title: "App Shell (Add Transaction Dialog Open)",
      expectText: ["Full amount includes fees.", "Save transaction"],
    });
    await page.keyboard.press("Escape");

    // -----------------------------------------------------------------------
    // GROUP 02: Overview Dashboard (Populated)
    // -----------------------------------------------------------------------
    await page.goto("/");
    await page.getByRole("heading", { name: "Overview", level: 1 }).waitFor({ state: "visible" });
    await collector.captureState(page, mon, {
      group: "02-overview",
      slug: "populated-dashboard-full",
      title: "Overview Dashboard (Populated Net Worth, Metrics, Radar & Activity)",
      expectText: ["On your radar", "Spending breakdown", "Daily spending", "Six-month comparison"],
      waitForCharts: true,
    });

    // Switch breakdown to Merchant
    await page.getByLabel("Breakdown grouping").selectOption("merchant");
    await collector.captureState(page, mon, {
      group: "02-overview",
      slug: "spending-breakdown-merchant-view",
      title: "Overview Dashboard (Spending Breakdown Grouped by Merchant)",
      expectText: "Spending breakdown",
    });

    // Expand Daily Spending Table
    await page.getByText("View daily spending table").click();
    await collector.captureState(page, mon, {
      group: "02-overview",
      slug: "daily-spending-table-expanded",
      title: "Overview Dashboard (Daily Spending Data Table Disclosed)",
      expectText: ["Date", "Spending"],
    });

    // Expand Six-Month Comparison Table
    await page.getByText("View comparison table").click();
    await collector.captureState(page, mon, {
      group: "02-overview",
      slug: "six-month-comparison-table-expanded",
      title: "Overview Dashboard (Six-Month Comparison Data Table Disclosed)",
      expectText: ["Month", "Income", "Spending"],
    });

    // Calendar: select day with bills & statements (Oct 18)
    const oct18Btn = page.locator('button[aria-label*="18 October 2026"]');
    if (await oct18Btn.count()) {
      await oct18Btn.click();
      await collector.captureState(page, mon, {
        group: "02-overview",
        slug: "dashboard-calendar-date-selected",
        title: "Overview Dashboard (Calendar Date Selected with Event Details)",
        expectText: "18 October 2026",
      });
    }

    // Expand History coverage disclosure
    const coverageDisclosure = page.getByText("History coverage");
    if (await coverageDisclosure.count()) {
      await coverageDisclosure.click();
      await collector.captureState(page, mon, {
        group: "02-overview",
        slug: "overview-coverage-disclosure-expanded",
        title: "Overview Dashboard (History Coverage Disclosure Disclosed)",
        expectText: ["History coverage", "since"],
      });
    }

    // -----------------------------------------------------------------------
    // GROUP 03: Analytics (Populated)
    // -----------------------------------------------------------------------
    await page.goto("/analytics");
    await page.getByRole("heading", { name: "Analytics", level: 1 }).waitFor({ state: "visible" });
    await collector.captureState(page, mon, {
      group: "03-analytics",
      slug: "populated-analytics-full",
      title: "Analytics Page (Monthly Comparison Bar Chart & Category Breakdown)",
      expectText: ["Monthly comparison", "Spending by category", "History coverage"],
      waitForCharts: true,
    });

    // Disclose Chart Data table
    await page.getByText("View chart data").click();
    await collector.captureState(page, mon, {
      group: "03-analytics",
      slug: "analytics-chart-table-expanded",
      title: "Analytics Page (Monthly Comparison Data Table Disclosed)",
      expectText: ["Month", "Income", "Expense"],
    });

    // Choose Month Popover
    await page.getByRole("button", { name: /Selected month:/ }).click();
    await page.getByRole("heading", { name: "Choose month" }).waitFor({ state: "visible" });
    await collector.captureState(page, mon, {
      group: "03-analytics",
      slug: "month-control-popover-open",
      title: "Analytics Page (MonthControl Picker Popover Open)",
      expectText: "Choose month",
    });
    await page.keyboard.press("Escape");

    // -----------------------------------------------------------------------
    // GROUP 04: Accounts Catalog (Populated)
    // -----------------------------------------------------------------------
    await page.goto("/accounts");
    await page.getByRole("heading", { name: "Accounts", level: 1 }).waitFor({ state: "visible" });
    await collector.captureState(page, mon, {
      group: "04-accounts",
      slug: "populated-accounts-catalog",
      title: "Accounts Page (Three Groups, Multi-Currency Statement Balances)",
      expectText: ["Cash, bank and wallet", "Credit cards", "Other accounts", "Statement Balance"],
    });

    // Open New Account Dialog (Credit Card)
    await page.getByRole("button", { name: "Add account" }).click();
    await page.getByRole("heading", { name: "New account" }).waitFor({ state: "visible" });
    await collector.captureState(page, mon, {
      group: "04-accounts",
      slug: "new-account-dialog-credit-card",
      title: "Accounts Page (New Account Modal - Credit Card Setup)",
      expectText: ["Credit limit · PHP", "Last 4 digits (optional)"],
    });

    // Switch Account Type to Debit Card / Bank
    await page.getByLabel("Account / card type").selectOption("bank");
    await collector.captureState(page, mon, {
      group: "04-accounts",
      slug: "account-dialog-debit-bank-variant",
      title: "Accounts Page (New Account Modal - Debit Card & Bank Setup)",
      expectText: ["Issuer / bank", "Card / product"],
    });

    // Switch Account Type to Wallet
    await page.getByLabel("Account / card type").selectOption("wallet");
    await collector.captureState(page, mon, {
      group: "04-accounts",
      slug: "new-account-dialog-wallet",
      title: "Accounts Page (New Account Modal - Digital Wallet Setup)",
      expectText: "Wallet provider",
    });
    await page.keyboard.press("Escape");
    await page.getByRole("heading", { name: "New account" }).waitFor({ state: "hidden" });

    // -----------------------------------------------------------------------
    // GROUP 05: Account Details (Bank, Credit Card, Loan & Archived)
    // -----------------------------------------------------------------------
    // 5.1 BDO Bank Account Details
    await page.goto(`/accounts/${seeded.accounts.bdoBankId}`);
    await page.getByRole("heading", { name: /BDO Mastercard Debit/ }).waitFor({ state: "visible" });
    await collector.captureState(page, mon, {
      group: "05-account-details",
      slug: "bank-account-details-view",
      title: "Account Details (Bank/Debit Account with Transfer Money Action)",
      expectText: ["BDO Mastercard Debit account", "Transfer money"],
    });

    // Open Transfer Money Dialog from BDO
    await page.getByRole("button", { name: "Transfer money" }).click();
    await page.getByRole("heading", { name: "Add transaction" }).waitFor({ state: "visible" });
    await collector.captureState(page, mon, {
      group: "05-account-details",
      slug: "transfer-money-modal-open",
      title: "Account Details (Transfer Money Dialog Pre-filled for Account)",
      expectText: "Transfer destination",
    });
    await page.keyboard.press("Escape");

    // Open Edit Account Details Dialog
    const editAccBtn = page.getByRole("button", { name: "Edit details" });
    if (await editAccBtn.count()) {
      await editAccBtn.click();
      await page.getByRole("heading", { name: "Edit account details" }).waitFor({ state: "visible" });
      await collector.captureState(page, mon, {
        group: "05-account-details",
        slug: "edit-account-dialog-open",
        title: "Account Details (Edit Account Details Dialog Open)",
        expectText: ["Edit account details", "Account type cannot be changed.", "Save changes"],
      });
      await page.keyboard.press("Escape");
    }

    // 5.2 UnionBank Credit Card Details (Statement-Month View)
    await page.goto(`/accounts/${seeded.accounts.unionBankCardId}`);
    await page.getByRole("heading", { name: /UnionBank Credit Card/ }).waitFor({ state: "visible" });
    await collector.captureState(page, mon, {
      group: "05-account-details",
      slug: "credit-card-statement-month-view",
      title: "Account Details (Credit Card Statement-Month Source Activity)",
      expectText: ["UnionBank Credit Card", "Import statements"],
    });

    // Credit Card Calendar Ledger View
    await page.goto(`/accounts/${seeded.accounts.unionBankCardId}?dateMode=calendar`);
    await collector.captureState(page, mon, {
      group: "05-account-details",
      slug: "credit-card-calendar-ledger-view",
      title: "Account Details (Credit Card Calendar Ledger Posted Records View)",
      expectText: ["Posted transactions", "PHP", "View"],
    });

    // Credit Card Per-Statement View
    await page.goto(`/accounts/${seeded.accounts.unionBankCardId}?dateMode=statement&issuedStatement=${seeded.ccStatements.octUnionBankId}`);
    await collector.captureState(page, mon, {
      group: "05-account-details",
      slug: "credit-card-per-statement-view",
      title: "Account Details (Credit Card Per-Statement Source Lines View)",
      expectText: ["Sale date", "Post date", "PHP"],
    });

    // Credit Card Statements Tab
    await page.goto(`/accounts/${seeded.accounts.unionBankCardId}`);
    await page.getByRole("tab", { name: "Statements" }).click();
    await collector.captureState(page, mon, {
      group: "05-account-details",
      slug: "credit-card-statements-tab",
      title: "Account Details (Credit Card Statements Tab with Compact Cards)",
      expectText: "All statements for this card",
    });

    // Inline Statement Details Overlay inside Account Details (?document=)
    await page.goto(`/accounts/${seeded.accounts.unionBankCardId}?document=${seeded.ccStatements.octUnionBankId}`);
    await page.getByRole("button", { name: "Close statement" }).waitFor({ state: "visible" });
    await collector.captureState(page, mon, {
      group: "05-account-details",
      slug: "inline-statement-detail-overlay",
      title: "Account Details (Inline Statement Details Overlay Disclosed)",
      expectText: ["Close statement", "Download immutable original CSV"],
    });

    // 5.3 EasyCash Loan Details
    await page.goto(`/accounts/${seeded.accounts.easyCashLoanId}`);
    await collector.captureState(page, mon, {
      group: "05-account-details",
      slug: "loan-account-details-view",
      title: "Account Details (Loan Liability Account View)",
      expectText: "EasyCash Loan",
    });

    // 5.4 Archived Account Details
    await page.goto(`/accounts/${seeded.accounts.archivedWalletId}`);
    await collector.captureState(page, mon, {
      group: "05-account-details",
      slug: "archived-account-details-view",
      title: "Account Details (Archived Account View with Disabled Controls)",
      expectText: "Maya Savings Archive",
    });

    // 5.5 Account Deletion Dialog with Cascade Preview
    await page.getByRole("button", { name: "Delete account" }).click();
    await page.getByRole("alertdialog").waitFor({ state: "visible" });
    await collector.captureState(page, mon, {
      group: "05-account-details",
      slug: "account-deletion-dialog-cascade",
      title: "Account Details (Account Deletion Dialog with Cascade Audit Counts)",
      expectText: ["Type account name to confirm", "Delete account and history permanently"],
    });
    await page.getByRole("button", { name: "Cancel deletion" }).click();
    await page.getByRole("alertdialog").waitFor({ state: "hidden" });

    // 5.6 Non-existent Account ID (404)
    await page.goto("/accounts/999999");
    await page.getByRole("heading", { name: "Account unavailable" }).waitFor({ state: "visible", timeout: 10000 });
    await collector.captureState(page, mon, {
      group: "05-account-details",
      slug: "account-unavailable-error-state",
      title: "Account Details (Unavailable Account ID Error State with Retry)",
      expectText: ["Account unavailable", "Retry account"],
      allowApiError: (url, status) => url.includes("/api/accounts/999999") && status === 404,
    });

    // -----------------------------------------------------------------------
    // GROUP 06: Transactions (Populated Table, Filters, Pagination, Modals)
    // -----------------------------------------------------------------------
    // 6.1 Desktop Table View (Page 1)
    await page.goto("/transactions");
    await page.getByRole("heading", { name: "Transactions", level: 1 }).waitFor({ state: "visible" });
    await collector.captureState(page, mon, {
      group: "06-transactions",
      slug: "transactions-table-page-1",
      title: "Transactions Page (Desktop Records Table - Page 1)",
      expectText: ["Posted transactions", "Next", "page 1 of"],
    });

    // Page 2 via pagination
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await collector.captureState(page, mon, {
      group: "06-transactions",
      slug: "transactions-table-page-2",
      title: "Transactions Page (Desktop Records Table - Page 2)",
      expectText: "page 2 of",
    });

    // Date Navigation Popover
    await page.getByRole("button", { name: /Date filter:/ }).click();
    await page.getByRole("heading", { name: "Date filter" }).waitFor({ state: "visible" });
    await collector.captureState(page, mon, {
      group: "06-transactions",
      slug: "date-filter-popover-open",
      title: "Transactions Page (Date Navigation Filter Popover Open)",
      expectText: ["Date mode", "Apply"],
    });
    await page.keyboard.press("Escape");

    // Filter Modal Dialog
    await page.getByRole("button", { name: /^Filter/ }).click();
    await page.getByRole("heading", { name: "Filter transactions" }).waitFor({ state: "visible" });
    await collector.captureState(page, mon, {
      group: "06-transactions",
      slug: "filter-transactions-modal-open",
      title: "Transactions Page (Filter Transactions Multi-Criterion Modal Open)",
      expectText: ["Account", "Category", "Clear all", "Apply"],
    });
    await page.keyboard.press("Escape");

    // Filtered Empty State
    await page.goto("/transactions?search=no_such_transaction_xyz");
    await collector.captureState(page, mon, {
      group: "06-transactions",
      slug: "transactions-filtered-empty-state",
      title: "Transactions Page (Filtered Empty Zero State)",
      expectText: "No transactions match these filters.",
    });

    // Add Transaction: Transfer Type Variant
    await page.goto("/transactions");
    await page.locator("header").getByRole("button", { name: "Add transaction" }).click();
    await page.getByRole("dialog").waitFor({ state: "visible" });
    await page.getByLabel("Type").selectOption("transfer");
    await collector.captureState(page, mon, {
      group: "06-transactions",
      slug: "transaction-dialog-transfer-type",
      title: "Transactions Page (Add Transaction Dialog - Transfer Type Selected)",
      expectText: ["Transfer destination", "Save transaction"],
    });
    await page.keyboard.press("Escape");

    // Transaction Details Dialog: FX Expense with Fee Breakdown
    await page.goto(`/transactions?id=${seeded.transactions.fxExpenseId}`);
    await page.getByRole("dialog").waitFor({ state: "visible" });
    await collector.captureState(page, mon, {
      group: "06-transactions",
      slug: "transaction-details-fx-fee-breakdown",
      title: "Transactions Page (Transaction Details Dialog - Foreign Currency & Fee Breakdown)",
      expectText: ["Cloudflare Registrar", "Original total · USD", "Included fee"],
    });

    // Edit Transaction Dialog
    await page.getByRole("button", { name: "Edit transaction" }).click();
    await page.getByRole("heading", { name: "Edit transaction" }).waitFor({ state: "visible" });
    await collector.captureState(page, mon, {
      group: "06-transactions",
      slug: "edit-transaction-modal-open",
      title: "Transactions Page (Edit Transaction Modal with Converted Amount Preview)",
      expectText: ["Converted amount · PHP", "Save transaction"],
    });
    await page.keyboard.press("Escape");

    // Protected Opening Balance Edit Notice
    await page.goto(`/transactions?period=all&id=${seeded.transactions.openingTxId}`);
    await page.getByRole("dialog").waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Edit transaction" }).click();
    await page.getByRole("heading", { name: "Edit transaction" }).waitFor({ state: "visible" });
    await collector.captureState(page, mon, {
      group: "06-transactions",
      slug: "transaction-dialog-protected-opening-balance",
      title: "Transactions Page (Edit Transaction Modal - Protected Opening Balance)",
      expectText: ["Opening balance", "Type and account are protected."],
    });
    await page.keyboard.press("Escape");

    // Void / Delete Transaction AlertDialog on Opening Balance
    await page.goto(`/transactions?period=all&id=${seeded.transactions.openingTxId}`);
    await page.getByRole("dialog").waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Delete transaction" }).click();
    await page.getByRole("alertdialog").waitFor({ state: "visible" });
    await collector.captureState(page, mon, {
      group: "06-transactions",
      slug: "delete-opening-transaction-alertdialog",
      title: "Transactions Page (Delete Transaction Alert Dialog on Opening Balance)",
      expectText: ["This removes an opening balance from active history", "Delete transaction"],
    });
    await page.keyboard.press("Escape");

    // Void / Delete Transaction AlertDialog on Linked Bill Payment
    await page.goto(`/transactions?period=all&id=${seeded.transactions.paidBillTxId}`);
    await page.getByRole("dialog").waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Delete transaction" }).click();
    await page.getByRole("alertdialog").waitFor({ state: "visible" });
    await collector.captureState(page, mon, {
      group: "06-transactions",
      slug: "delete-bill-linked-transaction-alertdialog",
      title: "Transactions Page (Delete Transaction Alert Dialog on Linked Bill Payment)",
      expectText: ["This payment is linked to a bill. The reminder becomes unpaid", "Delete transaction"],
    });
    await page.getByRole("button", { name: "Cancel deletion" }).click();
    await page.getByRole("alertdialog").waitFor({ state: "hidden" });

    // -----------------------------------------------------------------------
    // GROUP 07: Statements (Tabs, Popovers, Details & History Extension)
    // -----------------------------------------------------------------------
    // 7.1 Statement Transactions Tab
    await page.goto("/statements?tab=transactions");
    await page.getByRole("heading", { name: "Statement transactions" }).waitFor({ state: "visible" });
    await collector.captureState(page, mon, {
      group: "07-statements",
      slug: "statement-transactions-tab-full",
      title: "Statements Page (Statement Transactions Activity View)",
      expectText: ["Statement transactions", "Filters"],
    });

    // More activity filters popover
    await page.getByRole("button", { name: "More activity filters" }).click();
    await collector.captureState(page, mon, {
      group: "07-statements",
      slug: "statement-activity-filters-popover-open",
      title: "Statements Page (More Statement Activity Filters Popover Open)",
      expectText: ["Line type", "Category", "Post date from", "Post date to"],
    });
    await page.keyboard.press("Escape");

    // 7.2 Statements Tab
    await page.goto("/statements?tab=statements");
    await collector.captureState(page, mon, {
      group: "07-statements",
      slug: "statements-catalog-tab-full",
      title: "Statements Page (Statements Catalog Tab with Metadata Filters)",
      expectText: ["Statements", "Filters", "October 2026"],
    });

    // Statement Filters popover
    await page.getByRole("button", { name: "Filters" }).click();
    await collector.captureState(page, mon, {
      group: "07-statements",
      slug: "statements-catalog-filter-popover-open",
      title: "Statements Page (Statements Catalog Filters Popover Open)",
      expectText: ["Issuer", "Due date from", "Due date to", "Status", "Reset"],
    });
    await page.keyboard.press("Escape");

    // More statement filters popover
    await page.getByRole("button", { name: "More statement filters" }).click();
    await collector.captureState(page, mon, {
      group: "07-statements",
      slug: "statements-metadata-filters-popover-open",
      title: "Statements Page (More Statement Metadata Filters Popover Open)",
      expectText: ["Issue month", "Payment status", "Due date from"],
    });
    await page.keyboard.press("Escape");

    // 7.3 Active Statement Details: UnionBank October 2026
    await page.goto(`/statements?document=${seeded.ccStatements.octUnionBankId}`);
    await page.getByText("Card history · latest 100 issues").waitFor({ state: "visible" });
    await collector.captureState(page, mon, {
      group: "07-statements",
      slug: "active-statement-detail-full",
      title: "Statements Page (Active Statement Details - Reconciled Lines & Payments)",
      expectText: ["October 2026", "Source reconciliation", "Card history · latest 100 issues"],
    });

    // Expand Source Reconciliation / Import Audit details
    await page.getByText("Source reconciliation / original metadata / import audit").click();
    await collector.captureState(page, mon, {
      group: "07-statements",
      slug: "statement-reconciliation-audit-disclosed",
      title: "Statements Page (Source Reconciliation & Import Audit Disclosed)",
      expectText: "sha256",
    });

    // Expand Row Inspect / Annotate details
    const rowInspect = page.getByText(/Inspect \/ annotate row \d+/).first();
    if (await rowInspect.count()) {
      await rowInspect.click();
      await collector.captureState(page, mon, {
        group: "07-statements",
        slug: "statement-line-inspect-annotate-disclosed",
        title: "Statements Page (Statement Line Inspect & Annotate Form Disclosed)",
        expectText: ["Type override", "Category override"],
      });
    }

    // Expand Ledger Review (Payment with link to existing transfer)
    const ledgerReview = page.getByText(/Ledger review · row \d+/).first();
    if (await ledgerReview.count()) {
      await ledgerReview.click();
      await collector.captureState(page, mon, {
        group: "07-statements",
        slug: "statement-ledger-review-disclosed",
        title: "Statements Page (Ledger Review & Payment Linking Disclosed)",
        expectText: "Link existing transfer",
      });
    }

    // Expand Payment Correction summary
    const payCorrectSummary = page.locator("summary", { hasText: /Correct payment #/ }).first();
    if (await payCorrectSummary.count()) {
      await payCorrectSummary.click();
      await collector.captureState(page, mon, {
        group: "07-statements",
        slug: "statement-detail-payment-correction-disclosure",
        title: "Statements Page (Statement Payment Correction Form Disclosed)",
        expectText: ["Corrected payment date", "Corrected amount"],
      });
    }

    // 7.4 Pre-History Statement Details: Metrobank Travel Visa (History Extension Banner)
    await page.goto(`/statements?document=${seeded.ccStatements.octMetrobankPreHistoryId}`);
    await page.getByRole("heading", { name: "Extend issued-source history" }).waitFor({ state: "visible" });
    await collector.captureState(page, mon, {
      group: "07-statements",
      slug: "pre-history-statement-extension-banner",
      title: "Statements Page (Pre-History Statement with Extend Account History Banner)",
      expectText: ["Extend issued-source history", "Confirm issued-source history extension"],
    });

    // 7.5 Superseded Statement Details: April 2026 v1
    await page.goto(`/statements?document=${seeded.ccStatements.aprSupersededId}`);
    await page.getByText(/View replacement #/).waitFor({ state: "visible" });
    await collector.captureState(page, mon, {
      group: "07-statements",
      slug: "superseded-statement-details-view",
      title: "Statements Page (Superseded Statement View with Replacement Link)",
      expectText: ["Superseded.", "View replacement"],
    });

    // 7.6 Legacy Statement Archive View: ?archive=
    await page.goto(`/statements?archive=${seeded.legacyStatements.archiveId}`);
    await page.getByText("Legacy reference · original fields retained; excluded from dashboard totals.").waitFor({ state: "visible" });
    await collector.captureState(page, mon, {
      group: "07-statements",
      slug: "legacy-statement-archive-details",
      title: "Statements Page (Legacy Reference Statement Archive Viewer)",
      expectText: "Legacy reference · original fields retained; excluded from dashboard totals.",
    });

    // -----------------------------------------------------------------------
    // GROUP 08: Import & Export (Import Preview, History & Export)
    // -----------------------------------------------------------------------
    // 8.1 Import tab populated
    await page.goto("/import-export?tab=import");
    await page.getByRole("heading", { name: "Import & Export", level: 1 }).waitFor({ state: "visible" });
    await collector.captureState(page, mon, {
      group: "08-import-export",
      slug: "import-tab-populated-cards",
      title: "Import & Export (Statement Importer with Populated Active Cards)",
      expectText: ["Bank / issuer", "Exact credit card", "Preview and Import Statement"],
    });

    // CSV Import Preview with warnings on empty card (RCBC Flex Visa)
    const previewFile = path.resolve(process.cwd(), "public/unionbank_april_2026_statement_sample.csv");
    await page.setInputFiles('input[type="file"]', previewFile);
    await page.locator('select:has-text("Choose bank / issuer")').selectOption("RCBC");
    await page.locator('select:has-text("Choose nickname and last four")').selectOption(String(seeded.accounts.rcbcEmptyCardId));
    await page.locator('select:has-text("Choose printed currency")').selectOption("PHP");
    await page.getByRole("button", { name: "Preview and Import Statement" }).click();
    await page.getByRole("heading", { name: /Review April 2026/ }).waitFor({ state: "visible", timeout: 8000 });
    await collector.captureState(page, mon, {
      group: "08-import-export",
      slug: "statement-importer-csv-preview",
      title: "Import & Export (Statement Importer CSV Preview & Warning Checklist)",
      expectText: ["Review April 2026", "Source issuer differs from selected card issuer", "Confirm statement import"],
    });

    // Duplicate upload warning (uploading seeded CSV to UnionBank card which already has it seeded)
    await page.goto("/import-export?tab=import");
    await page.setInputFiles('input[type="file"]', seeded.duplicateSamplePath);
    await page.locator('select:has-text("Choose bank / issuer")').selectOption("UnionBank");
    await page.locator('select:has-text("Choose nickname and last four")').selectOption(String(seeded.accounts.unionBankCardId));
    await page.locator('select:has-text("Choose printed currency")').selectOption("PHP");
    await page.getByRole("button", { name: "Preview and Import Statement" }).click();
    await page.getByText("Already imported.").waitFor({ state: "visible", timeout: 8000 });
    await collector.captureState(page, mon, {
      group: "08-import-export",
      slug: "statement-importer-duplicate-detected",
      title: "Import & Export (Statement Importer Duplicate Detected Alert)",
      expectText: ["Already imported.", "View statement"],
    });

    // 8.2 History tab: Needs-Attention Upload
    await page.goto(`/import-export?tab=history&account=${seeded.accounts.metrobankCardId}&batch=${seeded.legacyStatements.preHistoryBatchId}`);
    await page.getByText("Before account history").waitFor({ state: "visible", timeout: 6000 });
    await collector.captureState(page, mon, {
      group: "08-import-export",
      slug: "history-needs-attention-upload",
      title: "Import & Export (History Tab - Needs Attention Pre-History Upload)",
      expectText: ["Before account history", "Resolve uncertain rows"],
    });

    // Extend Account History Confirmation Dialog
    await page.getByRole("button", { name: "Extend account history" }).click();
    await page.getByRole("heading", { name: "Extend account history?" }).waitFor({ state: "visible" });
    await collector.captureState(page, mon, {
      group: "08-import-export",
      slug: "extend-account-history-modal-open",
      title: "Import & Export (Extend Account History Confirmation Dialog)",
      expectText: ["Extend account history?", "Current account opening date"],
    });
    await page.keyboard.press("Escape");

    // History tab: Failed upload with Removable Dialog
    await page.goto(`/import-export?tab=history&account=${seeded.accounts.bdoBankId}&batch=${seeded.legacyStatements.failedBatchId}`);
    await page.getByRole("heading", { name: "broken_bank_export_october.csv" }).waitFor({ state: "visible", timeout: 6000 });
    await collector.captureState(page, mon, {
      group: "08-import-export",
      slug: "history-failed-upload-view",
      title: "Import & Export (History Tab - Failed Upload with Retry Action)",
      expectText: ["Retry parsing file", "broken_bank_export_october.csv"],
    });

    // Remove Statement Dialog
    await page.getByRole("button", { name: /Remove broken_bank_export_october\.csv/ }).click();
    await page.getByRole("heading", { name: "Remove uploaded statement?" }).waitFor({ state: "visible" });
    await collector.captureState(page, mon, {
      group: "08-import-export",
      slug: "remove-statement-dialog-allowed",
      title: "Import & Export (Remove Statement Dialog - Allowed Permanent Deletion)",
      expectText: ["Remove uploaded statement?", "Remove statement permanently"],
    });
    await page.keyboard.press("Escape");

    // 8.3 Export Ready Success State
    await page.goto("/import-export?tab=export");
    await page.getByRole("button", { name: "Export all transactions" }).click();
    await page.getByText("Export ready.").waitFor({ state: "visible", timeout: 6000 });
    await collector.captureState(page, mon, {
      group: "08-import-export",
      slug: "export-success-alert",
      title: "Import & Export (Export Success Ready Notification)",
      expectText: "Export ready.",
    });

    // -----------------------------------------------------------------------
    // GROUP 09: Budgets (Expenses, Income, Create/Edit/Delete Dialogs)
    // -----------------------------------------------------------------------
    // 9.1 Expenses Tab (Over-limit destructive & under-limit budgets)
    await page.goto("/budgets");
    await page.getByRole("heading", { name: "Budgets", level: 1 }).waitFor({ state: "visible" });
    await collector.captureState(page, mon, {
      group: "09-budgets",
      slug: "budgets-expenses-tab-full",
      title: "Budgets Page (Expenses Tab with Over-Limit and Under-Limit Categories)",
      expectText: ["Monthly Food & Groceries", "Home Utilities & Fiber", "Utilization"],
    });

    // 9.2 Income Tab
    await page.getByRole("tab", { name: "Income" }).click();
    await collector.captureState(page, mon, {
      group: "09-budgets",
      slug: "budgets-income-tab-full",
      title: "Budgets Page (Income Tab with Targets and Actual Receipts)",
      expectText: ["Advisory Income Target", "to reach target"],
    });

    // 9.3 Create Category Budget Dialog
    await page.getByRole("button", { name: "Create category budget" }).click();
    await page.getByRole("heading", { name: "Create category budget" }).waitFor({ state: "visible" });
    await collector.captureState(page, mon, {
      group: "09-budgets",
      slug: "create-budget-dialog-open",
      title: "Budgets Page (Create Category Budget Dialog Open)",
      expectText: ["One budget per category/month.", "Save category budget"],
    });
    await page.keyboard.press("Escape");

    // 9.4 Edit Budget Dialog
    await page.getByRole("tab", { name: "Expenses" }).click();
    const moreBudgetBtn = page.getByRole("button", { name: /More actions for Monthly Food/ });
    if (await moreBudgetBtn.count()) {
      await moreBudgetBtn.click();
      await page.getByRole("menuitem", { name: "Edit budget" }).click();
      await page.getByRole("heading", { name: "Edit category budget" }).waitFor({ state: "visible" });
      await collector.captureState(page, mon, {
        group: "09-budgets",
        slug: "edit-budget-dialog-open",
        title: "Budgets Page (Edit Category Budget Dialog Open)",
        expectText: ["Edit category budget", "Save category budget"],
      });
      await page.keyboard.press("Escape");
    }

    // 9.5 Delete Budget AlertDialog
    if (await moreBudgetBtn.count()) {
      await moreBudgetBtn.click();
      await page.getByRole("menuitem", { name: "Delete budget" }).click();
      await page.getByRole("alertdialog").waitFor({ state: "visible" });
      await collector.captureState(page, mon, {
        group: "09-budgets",
        slug: "delete-budget-alertdialog-open",
        title: "Budgets Page (Delete Category Budget Permanent AlertDialog)",
        expectText: ["Delete budget Monthly Food & Groceries", "Delete budget permanently"],
      });
      await page.getByRole("button", { name: "Cancel deletion" }).click();
      await page.getByRole("alertdialog").waitFor({ state: "hidden" });
    }

    // -----------------------------------------------------------------------
    // GROUP 10: Bills (Upcoming, Overdue, Recurring, Paid, Modals)
    // -----------------------------------------------------------------------
    // 10.1 Upcoming Tab
    await page.goto("/bills");
    await page.getByRole("heading", { name: "Bills", level: 1 }).waitFor({ state: "visible" });
    await collector.captureState(page, mon, {
      group: "10-bills",
      slug: "bills-upcoming-tab-full",
      title: "Bills Page (Upcoming Reminders Tab with Category Icons)",
      expectText: ["Meralco Electric Line", "UnionBank Card Statement Due"],
    });

    // 10.2 Overdue Tab
    await page.getByRole("tab", { name: "overdue" }).click();
    await collector.captureState(page, mon, {
      group: "10-bills",
      slug: "bills-overdue-tab-full",
      title: "Bills Page (Overdue Reminders Tab)",
      expectText: "PLDT Home Fiber",
    });

    // 10.3 Paid Tab
    await page.getByRole("tab", { name: "paid" }).click();
    await collector.captureState(page, mon, {
      group: "10-bills",
      slug: "bills-paid-tab-full",
      title: "Bills Page (Paid Reminders Tab with Linked Payment Badge)",
      expectText: ["Manila Water Supply", "Paid"],
    });

    // 10.4 Add Bill: Expense Variant
    await page.getByRole("button", { name: "Add bill reminder" }).click();
    await page.getByRole("heading", { name: "Add bill reminder" }).waitFor({ state: "visible" });
    await collector.captureState(page, mon, {
      group: "10-bills",
      slug: "add-bill-dialog-expense",
      title: "Bills Page (Add Bill Reminder Modal - Single Account Expense)",
      expectText: ["Payment type", "Save reminder"],
    });

    // Add Bill: Credit Repayment Variant
    await page.getByLabel("Payment type").selectOption("credit_repayment");
    await collector.captureState(page, mon, {
      group: "10-bills",
      slug: "add-bill-dialog-credit-repayment",
      title: "Bills Page (Add Bill Reminder Modal - Credit Card Repayment)",
      expectText: ["Payment type", "Save reminder"],
    });
    await page.keyboard.press("Escape");

    // 10.5 Bill Details Dialog (Unpaid)
    await page.goto(`/bills?id=${seeded.bills.upcomingBillId}`);
    await page.getByRole("dialog").waitFor({ state: "visible" });
    await collector.captureState(page, mon, {
      group: "10-bills",
      slug: "bill-details-dialog-unpaid",
      title: "Bills Page (Bill Details Dialog for Unpaid Reminder)",
      expectText: ["Bill reminder details", "Meralco Electric Line", "Mark as paid"],
    });
    await page.keyboard.press("Escape");

    // Bill Details Dialog (Paid)
    await page.goto(`/bills?id=${seeded.bills.paidBillId}`);
    await page.getByRole("dialog").waitFor({ state: "visible" });
    await collector.captureState(page, mon, {
      group: "10-bills",
      slug: "bill-details-paid-dialog",
      title: "Bills Page (Bill Details Dialog for Paid Reminder)",
      expectText: ["Bill reminder details", "Manila Water Supply", "Paid"],
    });
    await page.keyboard.press("Escape");

    // Bill Details Dialog (Unavailable / Deleted Record)
    await page.goto("/bills?id=999999");
    await collector.captureState(page, mon, {
      group: "10-bills",
      slug: "bill-details-unavailable-record",
      title: "Bills Page (Bill Details Unavailable Record State)",
      expectText: "Record deleted or unavailable",
    });

    // 10.6 Mark as Paid Dialog (Ordinary expense)
    await page.goto("/bills");
    const meralcoPayBtn = page.getByRole("button", { name: "Mark Meralco Electric Line as paid" });
    if (await meralcoPayBtn.count()) {
      await meralcoPayBtn.click();
      await page.getByRole("heading", { name: "Mark bill as paid" }).waitFor({ state: "visible" });
      await collector.captureState(page, mon, {
        group: "10-bills",
        slug: "mark-bill-paid-expense-dialog",
        title: "Bills Page (Mark Bill as Paid Modal - Single Account Expense)",
        expectText: ["Record the full payment in your ledger.", "Posted payment date"],
      });
      await page.keyboard.press("Escape");
    }

    // 10.7 Mark as Paid Dialog (Credit card repayment transfer)
    await page.getByRole("tab", { name: "upcoming" }).click();
    const ubBillPayBtn = page.getByRole("button", { name: "Mark UnionBank Card Statement Due as paid" });
    if (await ubBillPayBtn.count()) {
      await ubBillPayBtn.click();
      await page.getByRole("heading", { name: "Mark bill as paid" }).waitFor({ state: "visible" });
      await collector.captureState(page, mon, {
        group: "10-bills",
        slug: "mark-bill-paid-credit-repayment-dialog",
        title: "Bills Page (Mark Bill as Paid Modal - Credit Card Repayment Transfer)",
        expectText: ["Credit card account", "Funding account"],
      });
      await page.keyboard.press("Escape");
    }

    // -----------------------------------------------------------------------
    // GROUP 11: Goals (Active, Achieved, History, Allocate, Confetti)
    // -----------------------------------------------------------------------
    // 11.1 Active Goals Tab
    await page.goto("/goals");
    await page.getByRole("heading", { name: "Goals", level: 1 }).waitFor({ state: "visible" });
    await collector.captureState(page, mon, {
      group: "11-goals",
      slug: "goals-active-tab-full",
      title: "Goals Page (Active Targets Tab with Progress Bars)",
      expectText: ["Emergency Liquidity Buffer", "Autumn Kyoto Travel Fund"],
    });

    // 11.2 Achieved Goals Tab
    await page.getByRole("tab", { name: "Achieved" }).click();
    await collector.captureState(page, mon, {
      group: "11-goals",
      slug: "goals-achieved-tab-full",
      title: "Goals Page (Achieved Targets Tab)",
      expectText: "Home Studio Display Upgrade",
    });

    // 11.3 Create Goal Dialog
    await page.getByRole("button", { name: "Create goal" }).click();
    await page.getByRole("heading", { name: "Create goal" }).waitFor({ state: "visible" });
    await collector.captureState(page, mon, {
      group: "11-goals",
      slug: "create-goal-dialog-open",
      title: "Goals Page (Create Savings Goal Dialog Open)",
      expectText: ["Create goal", "Target · PHP", "Save goal"],
    });
    await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
    await page.getByRole("heading", { name: "Create goal" }).waitFor({ state: "hidden" });

    // 11.4 Edit Goal Dialog
    await page.getByRole("tab", { name: "Active" }).click();
    const moreGoalBtn = page.getByRole("button", { name: /More actions for Emergency Liquidity/ });
    if (await moreGoalBtn.count()) {
      await moreGoalBtn.click();
      await page.getByRole("menuitem", { name: "Edit goal" }).click();
      await page.getByRole("heading", { name: "Edit goal" }).waitFor({ state: "visible" });
      await collector.captureState(page, mon, {
        group: "11-goals",
        slug: "edit-goal-dialog-open",
        title: "Goals Page (Edit Savings Goal Dialog Open)",
        expectText: ["Edit goal", "Save goal"],
      });
      await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
      await page.getByRole("heading", { name: "Edit goal" }).waitFor({ state: "hidden" });
    }

    // 11.5 Delete Goal AlertDialog
    if (await moreGoalBtn.count()) {
      await moreGoalBtn.click();
      await page.getByRole("menuitem", { name: "Delete goal" }).click();
      await page.getByRole("alertdialog").waitFor({ state: "visible" });
      await collector.captureState(page, mon, {
        group: "11-goals",
        slug: "delete-goal-alert-dialog",
        title: "Goals Page (Delete Savings Goal Confirmation AlertDialog)",
        expectText: ["Delete goal Emergency Liquidity Buffer", "Delete goal and allocations permanently"],
      });
      await page.getByRole("button", { name: "Cancel deletion" }).click();
      await page.getByRole("alertdialog").waitFor({ state: "hidden" });
    }

    // 11.6 Goal Contribution History Dialog (Populated: 2)
    await page.getByRole("button", { name: "Contribution history (2)" }).click();
    await page.getByRole("heading", { name: "Contribution history" }).waitFor({ state: "visible" });
    await collector.captureState(page, mon, {
      group: "11-goals",
      slug: "goal-contribution-history-dialog",
      title: "Goals Page (Goal Contribution History Dialog with Populated History)",
      expectText: ["Emergency Liquidity Buffer", "Initial October transfer"],
    });

    // Edit Contribution Dialog
    const editContribBtn = page.locator('button[aria-label^="Edit contribution"]').first();
    if (await editContribBtn.count()) {
      await editContribBtn.click();
      await page.getByRole("heading", { name: "Edit contribution" }).waitFor({ state: "visible" });
      await collector.captureState(page, mon, {
        group: "11-goals",
        slug: "goal-contribution-edit-dialog",
        title: "Goals Page (Edit Contribution Dialog Open)",
        expectText: ["Edit contribution", "Contribution · PHP", "Save contribution"],
      });
      await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
      await page.getByRole("heading", { name: "Edit contribution" }).waitFor({ state: "hidden" });
    }

    // Reopen history dialog to test delete contribution
    await page.getByRole("button", { name: "Contribution history (2)" }).click();
    await page.getByRole("heading", { name: "Contribution history" }).waitFor({ state: "visible" });

    // Delete Contribution AlertDialog
    const deleteContribBtn = page.locator('button[aria-label^="Delete contribution"]').first();
    if (await deleteContribBtn.count()) {
      await deleteContribBtn.click();
      await page.getByRole("alertdialog").waitFor({ state: "visible" });
      await collector.captureState(page, mon, {
        group: "11-goals",
        slug: "goal-contribution-delete-alert-dialog",
        title: "Goals Page (Delete Contribution Confirmation AlertDialog)",
        expectText: ["Delete this contribution?", "Delete contribution"],
      });
      await page.getByRole("alertdialog").getByRole("button", { name: "Cancel" }).click();
      await page.getByRole("alertdialog").waitFor({ state: "hidden" });
    }
    await page.keyboard.press("Escape");
    await page.getByRole("heading", { name: "Contribution history" }).waitFor({ state: "hidden" });

    // 11.7 Goal Contribution History Dialog (Empty: 0)
    await page.getByRole("button", { name: "Contribution history (0)" }).click();
    await page.getByRole("heading", { name: "Contribution history" }).waitFor({ state: "visible" });
    await collector.captureState(page, mon, {
      group: "11-goals",
      slug: "goal-contribution-history-empty",
      title: "Goals Page (Goal Contribution History Dialog with Zero Contributions)",
      expectText: ["Autumn Kyoto Travel Fund", "No contributions recorded for this goal yet."],
    });
    await page.keyboard.press("Escape");
    await page.getByRole("heading", { name: "Contribution history" }).waitFor({ state: "hidden" });

    // 11.8 Allocate to Goal Dialog
    await page.getByRole("button", { name: "Add allocation" }).first().click();
    await page.getByRole("heading", { name: /Allocate to/ }).waitFor({ state: "visible" });
    await collector.captureState(page, mon, {
      group: "11-goals",
      slug: "allocate-to-goal-dialog-open",
      title: "Goals Page (Allocate to Goal Planning Dialog Open)",
      expectText: ["No money is moved. Account balances and net worth stay unchanged.", "Record allocation"],
    });
    await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
    await page.getByRole("heading", { name: /Allocate to/ }).waitFor({ state: "hidden" });

    // -----------------------------------------------------------------------
    // GROUP 12: Settings (All 7 Tabs)
    // -----------------------------------------------------------------------
    await page.goto("/settings");
    await page.getByRole("heading", { name: "Settings", level: 1 }).waitFor({ state: "visible" });

    // 12.1 Profile Tab
    await collector.captureState(page, mon, {
      group: "12-settings",
      slug: "settings-profile-tab",
      title: "Settings Page (Profile Tab with Owner Credentials Notice)",
      expectText: [`Signed in as ${OWNER_USERNAME}`, "Owner credentials are managed through secure operator recovery."],
    });

    // 12.2 Preferences Tab
    await page.getByRole("tab", { name: "preferences" }).click();
    await collector.captureState(page, mon, {
      group: "12-settings",
      slug: "settings-preferences-tab",
      title: "Settings Page (Preferences Tab - Keyboard & In-App Alert Toggles)",
      expectText: ["Default transaction currency", "Enable N and / keyboard shortcuts"],
    });

    // 12.3 Categories Tab
    await page.getByRole("tab", { name: "categories" }).click();
    await collector.captureState(page, mon, {
      group: "12-settings",
      slug: "settings-categories-tab",
      title: "Settings Page (Categories Tab with Category Directory)",
      expectText: ["Groceries & Dining", "Utilities & Connectivity", "Software & Cloud"],
    });

    // 12.4 Mappings Tab (Populated)
    await page.getByRole("tab", { name: "mappings" }).click();
    await collector.captureState(page, mon, {
      group: "12-settings",
      slug: "settings-mappings-tab-populated",
      title: "Settings Page (Merchant Mapping Rules Populated Directory)",
      expectText: ["MERALCO", "GRAB", "Edit rule"],
    });

    // Edit Rule Active Form
    await page.getByRole("button", { name: "Edit rule" }).first().click();
    await collector.captureState(page, mon, {
      group: "12-settings",
      slug: "settings-mappings-edit-rule-active",
      title: "Settings Page (Merchant Mapping Form Active in Edit Mode)",
      expectText: ["Edit rule", "Cancel editing"],
    });
    await page.getByRole("button", { name: "Cancel editing" }).click();

    // 12.5 Providers Tab (Populated)
    await page.getByRole("tab", { name: "providers" }).click();
    await collector.captureState(page, mon, {
      group: "12-settings",
      slug: "settings-providers-tab-populated",
      title: "Settings Page (Service Providers Populated Directory)",
      expectText: ["Meralco", "PLDT Home", "Edit provider"],
    });

    // Edit Provider Active Form
    await page.getByRole("button", { name: "Edit provider" }).first().click();
    await collector.captureState(page, mon, {
      group: "12-settings",
      slug: "settings-providers-edit-provider-active",
      title: "Settings Page (Service Provider Form Active in Edit Mode)",
      expectText: ["Edit provider", "Cancel editing"],
    });
    await page.getByRole("button", { name: "Cancel editing" }).click();

    // 12.6 Privacy Tab
    await page.getByRole("tab", { name: "privacy" }).click();
    await collector.captureState(page, mon, {
      group: "12-settings",
      slug: "settings-privacy-tab",
      title: "Settings Page (Data Export & Server Privacy Guarantees)",
      expectText: ["Data export", "Server storage and recovery"],
    });

    // 12.7 Session Tab
    await page.getByRole("tab", { name: "session" }).click();
    await collector.captureState(page, mon, {
      group: "12-settings",
      slug: "settings-session-tab",
      title: "Settings Page (Session Controls & Sign Out Action)",
      expectText: ["Sign out revokes this browser session.", "Sign out of this browser"],
    });

    // -----------------------------------------------------------------------
    // GROUP 13: Help & Legacy Redirects
    // -----------------------------------------------------------------------
    await page.goto("/help");
    await page.getByRole("heading", { name: "Help & support", level: 1 }).waitFor({ state: "visible" });

    // Open first 3 FAQ disclosures
    await page.getByText("Do records survive reload?").click();
    await page.getByText("Where is my data stored?").click();
    await page.getByText("Do mappings alter history?").click();
    await collector.captureState(page, mon, {
      group: "13-help-and-redirects",
      slug: "help-page-faq-expanded",
      title: "Help & Support Page (FAQ Disclosures Expanded)",
      expectText: ["Real accounting behavior", "Do records survive reload?", "Yes. Records are saved to the server SQLite database."],
    });

    // Legacy Redirects
    await page.goto("/imports?tab=history");
    await page.waitForURL("**/import-export?tab=history", { timeout: 6000 });
    await collector.captureState(page, mon, {
      group: "13-help-and-redirects",
      slug: "legacy-redirect-imports-history",
      title: "Legacy Redirect (/imports?tab=history -> /import-export?tab=history)",
      expectText: "Import & Export",
    });

    await page.goto("/imports?statement=1");
    await page.waitForURL("**/import-export?batch=1&tab=history", { timeout: 6000 });
    await collector.captureState(page, mon, {
      group: "13-help-and-redirects",
      slug: "legacy-redirect-imports-statement",
      title: "Legacy Redirect (/imports?statement=1 -> /import-export?batch=1&tab=history)",
      expectText: "Import & Export",
    });

    await page.goto("/statements?batch=1");
    await page.waitForURL("**/import-export?batch=1&tab=history", { timeout: 6000 });
    await collector.captureState(page, mon, {
      group: "13-help-and-redirects",
      slug: "legacy-redirect-statements-batch",
      title: "Legacy Redirect (/statements?batch=1 -> /import-export?batch=1&tab=history)",
      expectText: "Import & Export",
    });

    await page.goto(`/accounts?id=${seeded.accounts.bdoBankId}`);
    await page.waitForURL(`**/accounts/${seeded.accounts.bdoBankId}`, { timeout: 6000 });
    await collector.captureState(page, mon, {
      group: "13-help-and-redirects",
      slug: "legacy-redirect-account-param",
      title: "Legacy Redirect (/accounts?id=N -> /accounts/N)",
      expectText: "BDO Mastercard Debit account",
    });

    await page.goto("/transactions?upload=1");
    await page.waitForURL("**/import-export?tab=import", { timeout: 6000 });
    await collector.captureState(page, mon, {
      group: "13-help-and-redirects",
      slug: "legacy-redirect-transaction-upload",
      title: "Legacy Redirect (/transactions?upload=1 -> /import-export?tab=import)",
      expectText: "Import & Export",
    });

    // -----------------------------------------------------------------------
    // MOBILE VIEWPORT SWEEP (390x844)
    // -----------------------------------------------------------------------
    await page.setViewportSize({ width: 390, height: 844 });

    // Mobile Navigation Drawer
    await page.goto("/");
    await page.getByRole("button", { name: "Open navigation" }).click();
    await page.getByRole("dialog").waitFor({ state: "visible" });
    await collector.captureState(page, mon, {
      group: "01-app-shell",
      slug: "mobile-navigation-drawer-open",
      title: "App Shell (Mobile Sheet Navigation Drawer Open)",
      viewport: "mobile-390",
      expectText: ["Workspace", "Manage", "Sign out"],
    });
    await page.keyboard.press("Escape");

    // Mobile Search Modal
    await page.getByRole("button", { name: "Search workspace" }).click();
    await page.getByRole("heading", { name: "Search workspace" }).waitFor({ state: "visible" });
    await collector.captureState(page, mon, {
      group: "01-app-shell",
      slug: "mobile-search-dialog-open",
      title: "App Shell (Mobile Search Workspace Modal Dialog Open)",
      viewport: "mobile-390",
      expectText: "Find transactions, accounts, and bills.",
    });
    await page.keyboard.press("Escape");

    // Route Primary Views at Mobile (390x844)
    const mobileRoutes: Array<{ group: string; slug: string; title: string; path: string; expectText: string; waitForCharts?: boolean }> = [
      { group: "02-overview", slug: "overview-mobile-view", title: "Overview Dashboard (Mobile Viewport)", path: "/", expectText: "Total net worth", waitForCharts: true },
      { group: "03-analytics", slug: "analytics-mobile-view", title: "Analytics Page (Mobile Viewport)", path: "/analytics", expectText: "Analytics", waitForCharts: true },
      { group: "04-accounts", slug: "accounts-mobile-view", title: "Accounts Page (Mobile Viewport)", path: "/accounts", expectText: "Cash, bank and wallet" },
      { group: "05-account-details", slug: "account-details-mobile-view", title: "Account Details (Mobile Viewport)", path: `/accounts/${seeded.accounts.bdoBankId}`, expectText: "BDO Mastercard Debit account" },
      { group: "06-transactions", slug: "transactions-mobile-view", title: "Transactions Page (Mobile Record List Viewport)", path: "/transactions", expectText: "Transactions" },
      { group: "07-statements", slug: "statements-mobile-view", title: "Statements Page (Mobile Viewport)", path: "/statements?tab=transactions", expectText: "Statement transactions" },
      { group: "08-import-export", slug: "import-export-mobile-view", title: "Import & Export (Mobile Viewport)", path: "/import-export?tab=import", expectText: "Import & Export" },
      { group: "09-budgets", slug: "budgets-mobile-view", title: "Budgets Page (Mobile Viewport)", path: "/budgets", expectText: "Monthly Food & Groceries" },
      { group: "10-bills", slug: "bills-mobile-view", title: "Bills Page (Mobile Viewport)", path: "/bills", expectText: "Bills" },
      { group: "11-goals", slug: "goals-mobile-view", title: "Goals Page (Mobile Viewport)", path: "/goals", expectText: "Goals" },
      { group: "12-settings", slug: "settings-mobile-view", title: "Settings Page (Mobile Viewport)", path: "/settings", expectText: "Settings" },
      { group: "13-help-and-redirects", slug: "help-mobile-view", title: "Help & Support (Mobile Viewport)", path: "/help", expectText: "Help & support" },
    ];

    for (const item of mobileRoutes) {
      await page.goto(item.path);
      await collector.captureState(page, mon, {
        group: item.group,
        slug: item.slug,
        title: item.title,
        viewport: "mobile-390",
        expectText: item.expectText,
        waitForCharts: item.waitForCharts,
      });
    }

    // Restore desktop viewport
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  // =========================================================================
  // PHASE 3: Deterministic Loading & Fault-Injected Error / Retry States
  // =========================================================================
  test("Phase 3: Held-request loading states and fault-injected error recovery flows", async ({
    page,
    context,
    request,
    baseURL,
  }) => {
    test.setTimeout(360_000);
    const mon = await initAuditPage(page, context, { width: 1440, height: 900 });

    // Authenticate session in Phase 3 context
    const { csrf } = await setupAndLoginApi(request, baseURL!, setupToken);
    if (!seeded) {
      seeded = await seedFullAuditWorkspace(request, baseURL!, csrf, tempDbPath, tempStatementsPath);
    }
    const storage = await request.storageState();
    await context.addCookies(storage.cookies);

    // -----------------------------------------------------------------------
    // 3.1 Held-Request Loading States
    // -----------------------------------------------------------------------
    // Overview Loading
    await withHeldRoutes(page, ["**/api/reports*"], async () => {
      void page.goto("/");
      await page.getByText("Loading breakdown…").waitFor({ state: "visible", timeout: 4000 });
      await collector.captureState(page, mon, {
        group: "02-overview",
        slug: "overview-loading-state",
        title: "Overview Dashboard (Loading Reports & Breakdown State)",
        expectText: "Loading breakdown…",
      });
    });

    // Analytics Loading
    await withHeldRoutes(page, ["**/api/reports*"], async () => {
      void page.goto("/analytics");
      await page.getByText("Loading report…").waitFor({ state: "visible", timeout: 4000 });
      await collector.captureState(page, mon, {
        group: "03-analytics",
        slug: "analytics-loading-state",
        title: "Analytics Page (Loading Report State)",
        expectText: "Loading report…",
      });
    });

    // Accounts Loading
    await withHeldRoutes(page, ["**/api/accounts*"], async () => {
      void page.goto("/accounts");
      await page.getByText("Loading accounts…").waitFor({ state: "visible", timeout: 4000 });
      await collector.captureState(page, mon, {
        group: "04-accounts",
        slug: "accounts-loading-state",
        title: "Accounts Page (Loading Accounts State)",
        expectText: "Loading accounts…",
      });
    });

    // Account Details Loading
    await withHeldRoutes(page, [`**/api/accounts/${seeded.accounts.bdoBankId}*`], async () => {
      void page.goto(`/accounts/${seeded.accounts.bdoBankId}`);
      await page.getByText("Loading account…").waitFor({ state: "visible", timeout: 4000 });
      await collector.captureState(page, mon, {
        group: "05-account-details",
        slug: "account-details-loading-state",
        title: "Account Details (Loading Account State)",
        expectText: "Loading account…",
      });
    });

    // Transactions Loading
    await withHeldRoutes(page, ["**/api/transactions*"], async () => {
      void page.goto("/transactions");
      await page.getByText("Loading transactions…").waitFor({ state: "visible", timeout: 4000 });
      await collector.captureState(page, mon, {
        group: "06-transactions",
        slug: "transactions-loading-state",
        title: "Transactions Page (Loading Transactions State)",
        expectText: "Loading transactions…",
      });
    });

    // Statements Tab Loading
    await withHeldRoutes(page, ["**/api/credit-card-dashboard*"], async () => {
      void page.goto("/statements?tab=statements");
      await page.getByText("Loading statements…").waitFor({ state: "visible", timeout: 4000 });
      await collector.captureState(page, mon, {
        group: "07-statements",
        slug: "statements-loading-state",
        title: "Statements Page (Loading Statements State)",
        expectText: "Loading statements…",
      });
    });

    // Budgets Loading
    await withHeldRoutes(page, ["**/api/budgets*"], async () => {
      void page.goto("/budgets");
      await page.getByText("Loading budgets…").waitFor({ state: "visible", timeout: 4000 });
      await collector.captureState(page, mon, {
        group: "09-budgets",
        slug: "budgets-loading-state",
        title: "Budgets Page (Loading Budgets State)",
        expectText: "Loading budgets…",
      });
    });

    // Bills Loading
    await withHeldRoutes(page, ["**/api/bills*"], async () => {
      void page.goto("/bills");
      await page.getByText("Loading bills…").waitFor({ state: "visible", timeout: 4000 });
      await collector.captureState(page, mon, {
        group: "10-bills",
        slug: "bills-loading-state",
        title: "Bills Page (Loading Bills State)",
        expectText: "Loading bills…",
      });
    });

    // Goals Loading
    await withHeldRoutes(page, ["**/api/goals*"], async () => {
      void page.goto("/goals");
      await page.getByText("Loading goals…").waitFor({ state: "visible", timeout: 4000 });
      await collector.captureState(page, mon, {
        group: "11-goals",
        slug: "goals-loading-state",
        title: "Goals Page (Loading Goals State)",
        expectText: "Loading goals…",
      });
    });

    // App Shell -> Transaction Entry Dialog Loading Accounts
    await withHeldRoutes(page, ["**/api/accounts*"], async () => {
      void page.goto("/transactions?new=1");
      await page.getByText("Loading accounts, categories and currency preference…").waitFor({ state: "visible", timeout: 4000 });
      await collector.captureState(page, mon, {
        group: "01-app-shell",
        slug: "transaction-entry-dialog-loading",
        title: "App Shell (Add Transaction Dialog Loading Dependencies)",
        expectText: "Loading accounts, categories and currency preference…",
      });
    });

    // -----------------------------------------------------------------------
    // 3.2 Fault-Injected 500 Error Alerts & Retry Recoveries
    // -----------------------------------------------------------------------
    // Overview: Calendar Bills Error & Retry Recovery
    await withFaultRoutes(
      page,
      ["**/api/bills*"],
      500,
      { statusCode: 500, message: "Bills reminder service unreachable" },
      async ({ clearFaults }) => {
        await page.goto("/");
        await flushQueryRetries(page);
        await page.locator(".calendar-error").filter({ hasText: "Bills unavailable:" }).waitFor({ state: "visible", timeout: 6000 });
        await collector.captureState(page, mon, {
          group: "02-overview",
          slug: "calendar-bills-error-alert",
          title: "Overview Dashboard (Calendar Bills Query Failure with Retry Button)",
          expectText: ["Bills unavailable:", "Retry Bills"],
          allowApiError: (url, status) => url.includes("/api/bills") && status === 500,
        });

        // Clear fault and click Retry Bills to recover
        await clearFaults();
        await page.getByRole("button", { name: "Retry Bills" }).click();
        await page.locator(".calendar-error").filter({ hasText: "Bills unavailable:" }).waitFor({ state: "hidden", timeout: 6000 });
        await collector.captureState(page, mon, {
          group: "02-overview",
          slug: "calendar-bills-retry-recovered",
          title: "Overview Dashboard (Calendar Bills Recovered via Retry Action)",
          expectText: "Overview",
        });
      },
    );

    // Overview: Calendar Statement Dues Error & Retry Recovery
    await withFaultRoutes(
      page,
      ["**/api/credit-card-statements*"],
      500,
      { statusCode: 500, message: "Statement dues service unreachable" },
      async ({ clearFaults }) => {
        await page.goto("/");
        await flushQueryRetries(page);
        await page.locator(".calendar-error").filter({ hasText: "Statement dues unavailable:" }).waitFor({ state: "visible", timeout: 6000 });
        await collector.captureState(page, mon, {
          group: "02-overview",
          slug: "calendar-statements-error-alert",
          title: "Overview Dashboard (Calendar Statement Dues Failure with Retry Button)",
          expectText: ["Statement dues unavailable:", "Retry Statement dues"],
          allowApiError: (url, status) => url.includes("/api/credit-card-statements") && status === 500,
        });

        await clearFaults();
        await page.getByRole("button", { name: "Retry Statement dues" }).click();
        await page.locator(".calendar-error").filter({ hasText: "Statement dues unavailable:" }).waitFor({ state: "hidden", timeout: 6000 });
      },
    );

    // Overview: Calendar Goals Error & Retry Recovery
    await withFaultRoutes(
      page,
      ["**/api/goals*"],
      500,
      { statusCode: 500, message: "Goals service unreachable" },
      async ({ clearFaults }) => {
        await page.goto("/");
        await flushQueryRetries(page);
        await page.locator(".calendar-error").filter({ hasText: "Goals unavailable:" }).waitFor({ state: "visible", timeout: 6000 });
        await collector.captureState(page, mon, {
          group: "02-overview",
          slug: "calendar-goals-error-alert",
          title: "Overview Dashboard (Calendar Goals Query Failure with Retry Button)",
          expectText: ["Goals unavailable:", "Retry Goals"],
          allowApiError: (url, status) => url.includes("/api/goals") && status === 500,
        });

        await clearFaults();
        await page.getByRole("button", { name: "Retry Goals" }).click();
        await page.locator(".calendar-error").filter({ hasText: "Goals unavailable:" }).waitFor({ state: "hidden", timeout: 6000 });
      },
    );

    // Analytics: 500 Error Panel with Retry Action
    await withFaultRoutes(
      page,
      ["**/api/reports*"],
      500,
      { statusCode: 500, message: "Reports calculation engine error" },
      async ({ clearFaults }) => {
        await page.goto("/analytics");
        await flushQueryRetries(page);
        await page.getByText("Luna could not load financial reports because the server encountered a problem").waitFor({ state: "visible", timeout: 6000 });
        await collector.captureState(page, mon, {
          group: "03-analytics",
          slug: "analytics-error-retry-recovery",
          title: "Analytics Page (500 Financial Reports Error Alert)",
          expectText: "Luna could not load financial reports because the server encountered a problem",
          allowApiError: (url, status) => url.includes("/api/reports") && status === 500,
        });

        await clearFaults();
        await page.goto("/analytics");
        await page.getByRole("heading", { name: "Analytics", level: 1 }).waitFor({ state: "visible", timeout: 6000 });
      },
    );

    // Accounts: 500 Error Alert
    await withFaultRoutes(
      page,
      ["**/api/accounts*"],
      500,
      { statusCode: 500, message: "Account directory ledger connection failed" },
      async () => {
        await page.goto("/accounts");
        await flushQueryRetries(page);
        await page.getByText("Luna could not load accounts because the server encountered a problem").waitFor({ state: "visible", timeout: 6000 });
        await collector.captureState(page, mon, {
          group: "04-accounts",
          slug: "accounts-api-error-alert",
          title: "Accounts Page (API 500 Ledger Failure Alert Banner)",
          expectText: "Luna could not load accounts because the server encountered a problem",
          allowApiError: (url, status) => url.includes("/api/accounts") && status === 500,
        });
      },
    );

    // Account Details: 500 Error Alert & Retry Action
    await withFaultRoutes(
      page,
      [`**/api/accounts/${seeded.accounts.bdoBankId}*`],
      500,
      { statusCode: 500, message: "Ledger partition currently unavailable" },
      async ({ clearFaults }) => {
        await page.goto(`/accounts/${seeded.accounts.bdoBankId}`);
        await flushQueryRetries(page);
        await page.getByText("Account unavailable").waitFor({ state: "visible", timeout: 6000 });
        await collector.captureState(page, mon, {
          group: "05-account-details",
          slug: "account-details-500-error-alert",
          title: "Account Details (500 Error Panel with Retry Account Action)",
          expectText: ["Account unavailable", "Retry account"],
          allowApiError: (url, status) => url.includes(`/api/accounts/${seeded.accounts.bdoBankId}`) && status === 500,
        });

        await clearFaults();
        await page.getByRole("button", { name: "Retry account" }).click();
        await page.getByRole("heading", { name: /BDO Mastercard Debit/ }).waitFor({ state: "visible", timeout: 6000 });
        await collector.captureState(page, mon, {
          group: "05-account-details",
          slug: "account-details-retry-recovered",
          title: "Account Details (Account Details Recovered via Retry Action)",
          expectText: "BDO Mastercard Debit account",
        });
      },
    );

    // Transactions: 500 Error Alert
    await withFaultRoutes(
      page,
      ["**/api/transactions*"],
      500,
      { statusCode: 500, message: "Transaction storage temporary failure" },
      async () => {
        await page.goto("/transactions");
        await flushQueryRetries(page);
        await page.getByText("Luna could not load transactions because the server encountered a problem").waitFor({ state: "visible", timeout: 6000 });
        await collector.captureState(page, mon, {
          group: "06-transactions",
          slug: "transactions-api-error-alert",
          title: "Transactions Page (500 Error Panel Alert)",
          expectText: "Luna could not load transactions because the server encountered a problem",
          allowApiError: (url, status) => url.includes("/api/transactions") && status === 500,
        });
      },
    );

    // Statements Catalog: 500 Error Alert & Retry Action
    await withFaultRoutes(
      page,
      ["**/api/credit-card-dashboard*"],
      500,
      { statusCode: 500, message: "Statement dashboard service temporary failure" },
      async ({ clearFaults }) => {
        await page.goto("/statements?tab=statements");
        await flushQueryRetries(page);
        await page.getByText("Luna could not load statement activity because the server encountered a problem").waitFor({ state: "visible", timeout: 6000 });
        await collector.captureState(page, mon, {
          group: "07-statements",
          slug: "statements-catalog-500-error-alert",
          title: "Statements Page (Catalog 500 Error Panel with Retry Action)",
          expectText: ["Luna could not load statement activity because the server encountered a problem", "Retry statements"],
          allowApiError: (url, status) => url.includes("/api/credit-card-dashboard") && status === 500,
        });

        await clearFaults();
        await page.getByRole("button", { name: "Retry statements" }).click();
        await page.getByRole("heading", { name: "Statements", level: 1 }).waitFor({ state: "visible", timeout: 6000 });
        await collector.captureState(page, mon, {
          group: "07-statements",
          slug: "statements-catalog-retry-recovered",
          title: "Statements Page (Catalog Recovered via Retry Statements Action)",
          expectText: "Statements",
        });
      },
    );

    // Import-Export: 500 Export Error Alert
    await withFaultRoutes(
      page,
      ["**/api/export*"],
      500,
      { statusCode: 500, message: "Export file creation failure" },
      async () => {
        await page.goto("/import-export?tab=export");
        await page.getByRole("button", { name: "Export workspace records" }).click();
        await page.getByText("Luna could not load export file because the server encountered a problem").waitFor({ state: "visible", timeout: 6000 });
        await collector.captureState(page, mon, {
          group: "08-import-export",
          slug: "export-error-alert",
          title: "Import & Export (Export Workspace Records 500 Error Alert)",
          expectText: "Luna could not load export file because the server encountered a problem",
          allowApiError: (url, status) => url.includes("/api/export") && status === 500,
        });
      },
    );

    // App Shell: Global Search 500 Error Alert
    await withFaultRoutes(
      page,
      ["**/api/search*"],
      500,
      { statusCode: 500, message: "Search indexing daemon unreachable" },
      async () => {
        await page.goto("/");
        const searchInput = page.locator('header input[placeholder="Search your workspace…"]');
        await searchInput.focus();
        await searchInput.fill("search-error-test");
        await page.clock.fastForward(300);
        await flushQueryRetries(page);
        await page.getByText("Luna could not load search results because the server encountered a problem").waitFor({ state: "visible", timeout: 6000 });
        await collector.captureState(page, mon, {
          group: "01-app-shell",
          slug: "search-combobox-api-error-alert",
          title: "App Shell (Global Search Combobox with In-Flight 500 Alert)",
          expectText: "Luna could not load search results because the server encountered a problem",
          allowApiError: (url, status) => url.includes("/api/search") && status === 500,
        });
        await page.keyboard.press("Escape");
      },
    );

    // App Shell: Sign Out 500 Error Alert
    await withFaultRoutes(
      page,
      ["**/api/auth/logout*"],
      500,
      { statusCode: 500, message: "Session revocation service offline" },
      async () => {
        await page.goto("/");
        await page.locator('aside button:has-text("Sign out")').click();
        await page.getByText("Luna could not process sign-out because the server encountered a problem").waitFor({ state: "visible", timeout: 6000 });
        await collector.captureState(page, mon, {
          group: "01-app-shell",
          slug: "signout-api-error-alert",
          title: "App Shell (Sidebar Sign Out Action with 500 Error Alert)",
          expectText: "Luna could not process sign-out because the server encountered a problem",
          allowApiError: (url, status) => url.includes("/api/auth/logout") && status === 500,
        });
      },
    );

    // Assert that no state in collector had status === "fail"
    const failedRecords = collector.records.filter(r => r.status === "fail");
    if (failedRecords.length > 0) {
      const summary = failedRecords.map(r => `#${r.index} ${r.group}/${r.slug}: ${r.failures.join("; ")}`).join("\n");
      throw new Error(`Audit found ${failedRecords.length} failing page state(s):\n${summary}`);
    }
  });
});
