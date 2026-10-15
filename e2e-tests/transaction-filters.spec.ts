import {test, expect, type Page} from "@playwright/test";
import {importWorkspace} from "./fixtures/transaction-imports";

test.use({timezoneId: "America/Los_Angeles"});
test.beforeEach(async ({page}) => {
  await page.clock.setFixedTime(new Date("2026-10-15T12:00:00Z"));
});

async function filterWorkspace(page: Page) {
  const workspace = await importWorkspace(page, true);
  const requests: URLSearchParams[] = [];
  const base = {version: "1", notes: "", bill_linked: false, balance_impacts: [], imports: [], account_name: "Daily bank", counter_account_name: null};
  const records = [
    {...base, id: 11, posted_date: "2026-10-01", merchant: "Cafe", description: "Lunch", kind: "expense", is_installment: false, category_id: 1, category_name: "Food", account_id: 1, amount: 1000, source: "manual"},
    {...base, id: 12, posted_date: "2026-04-07", merchant: "Silicon Valley", description: "Monthly laptop", kind: "expense", is_installment: true, category_id: null, category_name: null, account_id: 2, account_name: "Everyday card", amount: 179125, source: "import"},
    {...base, id: 13, posted_date: "2026-04-30", merchant: "Grocer", description: "Weekly groceries", kind: "expense", is_installment: false, category_id: 1, category_name: "Food", account_id: 1, amount: 2500, source: "import"},
    {...base, id: 14, posted_date: "2024-02-29", merchant: "Leap purchase", description: "Older transaction", kind: "expense", is_installment: false, category_id: null, category_name: null, account_id: 1, amount: 500, source: "manual"},
    {...base, id: 15, posted_date: "2026-10-15", merchant: "Paycheck", description: "Salary", kind: "income", is_installment: false, category_id: null, category_name: null, account_id: 1, amount: 500000, source: "manual"},
  ];
  await page.route(/\/api\/categories(?:\?|$)/, route => route.fulfill({json: [{id: 1, name: "Food", kind: "expense"}]}));
  await page.route(/\/api\/transactions(?:\?|$)/, async route => {
    const query = new URL(route.request().url()).searchParams;
    requests.push(new URLSearchParams(query));
    if (query.has("id")) {
      await route.fulfill({json: records.filter(record => record.id === Number(query.get("id"))).map(record => ({...record, original_currency: "PHP", original_amount: record.amount, included_fee: 0, exchange_rate: "1"}))});
      return;
    }
    const items = records.filter(record => {
      const kind = record.is_installment ? "installment" : record.kind;
      return (!query.get("month") || record.posted_date.startsWith(query.get("month")!))
        && (!query.get("start") || record.posted_date >= query.get("start")!)
        && (!query.get("end") || record.posted_date <= query.get("end")!)
        && (!query.get("account") || record.account_id === Number(query.get("account")))
        && (!query.get("kind") || kind === query.get("kind"))
        && (!query.get("source") || record.source === query.get("source"))
        && (!query.get("category") || (query.get("category") === "uncategorized" ? record.category_id === null : record.category_id === Number(query.get("category"))))
        && (!(query.get("batch") || query.get("legacy")) || record.source === "import")
        && (!query.get("search") || `${record.description} ${record.merchant}`.toLowerCase().includes(query.get("search")!.toLowerCase()));
    }).sort((first, second) => query.get("sort") === "oldest" ? first.posted_date.localeCompare(second.posted_date)
      : query.get("sort") === "highest" ? second.amount - first.amount
      : query.get("sort") === "lowest" ? first.amount - second.amount
      : second.posted_date.localeCompare(first.posted_date));
    const pageNumber = Number(query.get("page") || 1);
    await route.fulfill({json: {items: items.slice(pageNumber - 1, pageNumber).map(record => ({...record, original_currency: "PHP", original_amount: record.amount, included_fee: 0, exchange_rate: "1"})), total: items.length, pageSize: 1}});
  });
  return {requests, workspace};
}

const filterButton = (page: Page) => page.getByRole("button", {name: /^Filter(?:,|$)/});
const dateButton = (page: Page) => page.getByRole("button", {name: /^Date filter:/});
const searchInput = (page: Page) => page.getByRole("searchbox", {name: "Search description, merchant or reference"});

test("date chooser uses local months, cancellable drafts, valid ranges and All time (mocked API)", async ({page}) => {
  const state = await filterWorkspace(page);
  await page.clock.setFixedTime(new Date("2027-01-01T00:30:00Z"));
  await page.goto("/transactions");
  await expect(page).toHaveURL(/month=2026-12/);
  await expect(dateButton(page)).toHaveText("December 2026");
  expect(state.requests.every(query => query.get("month") === "2026-12")).toBe(true);
  await page.clock.setFixedTime(new Date("2027-01-01T08:30:00Z"));
  await page.goto("/transactions");
  await expect(page).toHaveURL(/month=2027-01/);
  await expect(dateButton(page)).toHaveText("January 2027");
  await expect(searchInput(page)).toHaveAttribute("maxlength", "100");
  await expect(page.getByRole("combobox", {name: "Account", exact: true})).toHaveCount(0);

  await dateButton(page).click();
  let chooser = page.getByRole("dialog", {name: "Date filter", exact: true});
  await chooser.getByLabel("Month", {exact: true}).fill("2026-04");
  await expect(page).toHaveURL(/month=2027-01/);
  await chooser.getByRole("button", {name: "Cancel", exact: true}).click();
  await expect(dateButton(page)).toBeFocused();
  await dateButton(page).click();
  await page.getByLabel("Month", {exact: true}).fill("2026-03");
  await page.getByRole("heading", {name: "Transactions", exact: true}).click();
  await expect(page.getByRole("dialog", {name: "Date filter", exact: true})).toHaveCount(0);
  await expect(page).toHaveURL(/month=2027-01/);
  await dateButton(page).click();
  chooser = page.getByRole("dialog", {name: "Date filter", exact: true});
  await expect(chooser.getByLabel("Month", {exact: true})).toHaveValue("2027-01");
  await chooser.getByLabel("Month", {exact: true}).fill("2026-04");
  await chooser.getByRole("button", {name: "Apply", exact: true}).click();
  await expect(page).toHaveURL(/month=2026-04/);
  await expect(page.getByRole("button", {name: /^View Grocer on /})).toBeVisible();

  await dateButton(page).click();
  chooser = page.getByRole("dialog", {name: "Date filter", exact: true});
  await chooser.getByRole("combobox", {name: "Date mode", exact: true}).selectOption("range");
  await chooser.getByLabel("Start date", {exact: true}).fill("2026-04-30");
  await chooser.getByLabel("End date", {exact: true}).fill("2026-04-07");
  await chooser.getByRole("button", {name: "Apply", exact: true}).click();
  await expect(chooser.getByRole("alert")).toHaveText("End date must be on or after start date.");
  await expect(page).toHaveURL(/month=2026-04/);
  await chooser.getByLabel("Start date", {exact: true}).fill("2026-04-07");
  await chooser.getByRole("button", {name: "Apply", exact: true}).click();
  await expect(page).toHaveURL(/start=2026-04-07&end=2026-04-07/);
  expect(new URL(page.url()).searchParams.has("month")).toBe(false);
  await expect(page.getByRole("row").filter({hasText: "Silicon Valley"})).toBeVisible();
  await dateButton(page).click();
  await page.getByRole("combobox", {name: "Date mode", exact: true}).selectOption("all");
  await page.keyboard.press("Escape");
  await expect(dateButton(page)).toBeFocused();
  await expect(page).toHaveURL(/start=2026-04-07/);
  await dateButton(page).click();
  await expect(page.getByRole("combobox", {name: "Date mode", exact: true})).toHaveValue("range");
  await page.getByRole("combobox", {name: "Date mode", exact: true}).selectOption("all");
  await page.getByRole("dialog", {name: "Date filter", exact: true}).getByRole("button", {name: "Apply", exact: true}).click();
  await expect(page).toHaveURL(/\?period=all$/);
  await page.reload();
  await expect(dateButton(page)).toHaveText("All time");
  await dateButton(page).click();
  await page.getByRole("combobox", {name: "Date mode", exact: true}).selectOption("range");
  await page.getByLabel("Start date", {exact: true}).fill("");
  await page.getByLabel("End date", {exact: true}).fill("2024-02-29");
  await page.getByRole("dialog", {name: "Date filter", exact: true}).getByRole("button", {name: "Apply", exact: true}).click();
  await expect(dateButton(page)).toHaveText(/Through Feb/);
  await expect(page.getByRole("row").filter({hasText: "Leap purchase"})).toBeVisible();
  expect(state.requests.every(query => !query.has("period"))).toBe(true);
  expect(state.workspace.requests.every(request => request.method === "GET")).toBe(true);
});

test("advanced filters apply together; cancellation, counts, account scope and Clear all work (mocked API)", async ({page}) => {
  const state = await filterWorkspace(page);
  await page.goto("/transactions?month=2026-04&account=2&batch=6&search=Silicon");
  await expect(filterButton(page)).toHaveAccessibleName("Filter, 2 active filters");
  const unchanged = page.url();
  await filterButton(page).click();
  let dialog = page.getByRole("dialog", {name: "Filter transactions"});
  for (const [name, value] of [["Type", "installment"], ["Category", "uncategorized"], ["Source", "import"], ["Sort", "highest"]]) {
    await dialog.getByRole("combobox", {name, exact: true}).selectOption(value);
  }
  await expect(page).toHaveURL(unchanged);
  await dialog.getByRole("button", {name: "Cancel", exact: true}).click();
  await expect(filterButton(page)).toBeFocused();
  await filterButton(page).click();
  await page.getByRole("combobox", {name: "Source", exact: true}).selectOption("manual");
  await page.mouse.click(4, 4);
  await expect(page.getByRole("dialog", {name: "Filter transactions"})).toHaveCount(0);
  await expect(filterButton(page)).toBeFocused();
  await expect(page).toHaveURL(unchanged);
  await filterButton(page).click();
  dialog = page.getByRole("dialog", {name: "Filter transactions"});
  await expect(dialog.getByRole("combobox", {name: "Type", exact: true})).toHaveValue("");
  for (const [name, value] of [["Type", "installment"], ["Category", "uncategorized"], ["Source", "import"], ["Sort", "highest"]]) {
    await dialog.getByRole("combobox", {name, exact: true}).selectOption(value);
  }
  await dialog.getByRole("button", {name: "Apply", exact: true}).click();
  await expect(filterButton(page)).toHaveAccessibleName("Filter, 6 active filters");
  expect(new URL(page.url()).searchParams.get("batch")).toBe("6");
  await expect(page.getByRole("row").filter({hasText: "Silicon Valley"})).toBeVisible();
  await filterButton(page).click();
  await page.getByRole("combobox", {name: "Account", exact: true}).selectOption("1");
  await expect(page.getByText("Changing the account clears the upload restriction when applied.")).toBeVisible();
  await page.keyboard.press("Escape");
  expect(new URL(page.url()).searchParams.get("account")).toBe("2");
  await filterButton(page).click();
  await page.getByRole("combobox", {name: "Account", exact: true}).selectOption("1");
  await page.getByRole("dialog", {name: "Filter transactions"}).getByRole("button", {name: "Apply", exact: true}).click();
  await expect(page).toHaveURL(/account=1/);
  expect(new URL(page.url()).searchParams.has("batch")).toBe(false);
  expect(new URL(page.url()).searchParams.get("month")).toBe("2026-04");
  await expect(searchInput(page)).toHaveValue("Silicon");
  const filtered = page.url();
  await filterButton(page).click();
  await page.getByRole("button", {name: "Clear all", exact: true}).click();
  await expect(page).toHaveURL(filtered);
  await expect(page.getByRole("dialog").getByRole("status")).toHaveText("All time, no search, no additional filters.");
  await page.getByRole("button", {name: "Cancel", exact: true}).click();
  await expect(page).toHaveURL(filtered);
  await filterButton(page).click();
  await page.getByRole("button", {name: "Clear all", exact: true}).click();
  await page.getByRole("dialog").getByRole("button", {name: "Apply", exact: true}).click();
  await expect(page).toHaveURL(/\?period=all$/);
  await expect(dateButton(page)).toHaveText("All time");
  await expect(searchInput(page)).toHaveValue("");
  await expect(filterButton(page)).toHaveAccessibleName("Filter");
  await expect(page.getByRole("row").filter({hasText: "Paycheck"})).toBeVisible();
  expect(state.workspace.requests.every(request => request.method === "GET")).toBe(true);
});

test("legacy links, pagination, search, refresh and browser history preserve date scope (mocked API)", async ({page}) => {
  const state = await filterWorkspace(page);
  await page.goto("/transactions?month=2026-04&start=2024-02-29&end=2024-02-29");
  await expect(page).not.toHaveURL(/month=/);
  await expect(page.getByRole("row").filter({hasText: "Leap purchase"})).toBeVisible();
  await page.goto("/transactions?account=2&batch=6");
  await expect(dateButton(page)).toHaveText("All time");
  await expect(page.getByRole("row").filter({hasText: "Silicon Valley"})).toBeVisible();
  await searchInput(page).fill("Silicon");
  expect(new URL(page.url()).searchParams.get("batch")).toBe("6");
  await dateButton(page).click();
  await page.getByRole("combobox", {name: "Date mode", exact: true}).selectOption("month");
  await page.getByLabel("Month", {exact: true}).fill("2026-04");
  await page.getByRole("dialog").getByRole("button", {name: "Apply", exact: true}).click();
  expect(new URL(page.url()).searchParams.get("batch")).toBe("6");
  await page.goto("/transactions?legacy=csv&importId=3");
  await expect(filterButton(page)).toHaveAccessibleName("Filter, 1 active filter");
  await expect(dateButton(page)).toHaveText("All time");
  await filterButton(page).click();
  await page.getByRole("button", {name: "Remove upload filter"}).click();
  await page.getByRole("dialog").getByRole("button", {name: "Apply", exact: true}).click();
  await expect(page).toHaveURL(/\?period=all$/);
  await page.getByRole("button", {name: "Next", exact: true}).click();
  await expect(page).toHaveURL(/page=2/);
  await searchInput(page).fill("Silicon");
  await expect(page).not.toHaveURL(/page=/);
  await expect(page.getByRole("row").filter({hasText: "Silicon Valley"})).toBeVisible();
  await page.goto("/transactions?period=all");
  await dateButton(page).click();
  await page.getByRole("combobox", {name: "Date mode", exact: true}).selectOption("month");
  await page.getByLabel("Month", {exact: true}).fill("2026-04");
  await page.getByRole("dialog").getByRole("button", {name: "Apply", exact: true}).click();
  await filterButton(page).click();
  await page.getByRole("combobox", {name: "Type", exact: true}).selectOption("installment");
  await page.getByRole("dialog").getByRole("button", {name: "Apply", exact: true}).click();
  await page.reload();
  await expect(page).toHaveURL(/month=2026-04&kind=installment/);
  await page.goBack();
  await expect(page).toHaveURL(/\?month=2026-04$/);
  await page.goBack();
  await expect(page).toHaveURL(/\?period=all$/);
  await page.goto("/transactions?id=12");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dateButton(page)).toHaveText("All time");
  expect(new URL(page.url()).searchParams.has("month")).toBe(false);
  expect(state.requests.every(query => !query.has("period"))).toBe(true);
});

test("month arrows apply immediately, preserve filters and leave the chooser on the date label (mocked API)", async ({page}) => {
  const state = await filterWorkspace(page);
  await page.goto("/transactions?month=2026-12&account=1&batch=6&search=grocer&sort=oldest");
  const previous = page.getByRole("button", {name: "Previous month", exact: true});
  const next = page.getByRole("button", {name: "Next month", exact: true});
  await next.focus();
  await page.keyboard.press("Enter");
  await expect(dateButton(page)).toHaveText("January 2027");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  for (const [key, value] of [["account", "1"], ["batch", "6"], ["search", "grocer"], ["sort", "oldest"]]) {
    expect(new URL(page.url()).searchParams.get(key)).toBe(value);
  }
  await previous.click();
  await expect(dateButton(page)).toHaveText("December 2026");
  await page.goBack();
  await expect(dateButton(page)).toHaveText("January 2027");
  await page.reload();
  await expect(dateButton(page)).toHaveText("January 2027");
  await dateButton(page).click();
  const chooser = page.getByRole("dialog", {name: "Date filter", exact: true});
  await chooser.getByRole("combobox", {name: "Date mode", exact: true}).selectOption("range");
  await chooser.getByLabel("Start date", {exact: true}).fill("2026-04-01");
  await chooser.getByRole("button", {name: "Apply", exact: true}).click();
  await expect(previous).toBeDisabled();
  await expect(next).toBeDisabled();
  await dateButton(page).click();
  await chooser.getByRole("combobox", {name: "Date mode", exact: true}).selectOption("all");
  await chooser.getByRole("button", {name: "Apply", exact: true}).click();
  await expect(dateButton(page)).toHaveText("All time");
  await expect(previous).toBeDisabled();
  await expect(next).toBeDisabled();
  await page.goto("/transactions?month=2026-10&page=2");
  await expect(page.getByText("2 records · page 2 of 2", {exact: true})).toBeVisible();
  await previous.click();
  await expect(dateButton(page)).toHaveText("September 2026");
  expect(new URL(page.url()).searchParams.has("page")).toBe(false);
  expect(state.workspace.requests.every(request => request.method === "GET")).toBe(true);
});

test("toolbar, date chooser and Filter dialog stay usable on desktop, tablet and mobile (mocked API)", async ({page}, testInfo) => {
  await filterWorkspace(page);
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({width, height: 960});
    await page.goto("/transactions?month=2026-04");
    await expect(page.getByRole("button", {name: /^View Grocer on /})).toBeVisible();
    await expect(page.getByRole("button", {name: "Previous month", exact: true})).toBeVisible();
    await expect(page.getByRole("button", {name: "Next month", exact: true})).toBeVisible();
    await expect(page.getByRole("combobox", {name: "Type", exact: true})).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({path: testInfo.outputPath(`toolbar-${width}.png`), fullPage: true});
    await dateButton(page).focus();
    await page.keyboard.press("Enter");
    const chooser = page.getByRole("dialog", {name: "Date filter", exact: true});
    await chooser.getByRole("combobox", {name: "Date mode", exact: true}).selectOption("range");
    await chooser.getByLabel("Start date", {exact: true}).fill("2026-04-01");
    await chooser.getByLabel("End date", {exact: true}).fill("2026-04-30");
    expect(await chooser.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    await page.screenshot({path: testInfo.outputPath(`date-${width}.png`), fullPage: true});
    await page.keyboard.press("Escape");
    await expect(dateButton(page)).toBeFocused();
    await filterButton(page).focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", {name: "Filter transactions"});
    await expect(dialog.getByRole("combobox", {name: "Account", exact: true})).toBeVisible();
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    await dialog.getByRole("button", {name: "Apply", exact: true}).focus();
    for (let index = 0; index < 12; index++) {
      await page.keyboard.press("Tab");
      expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
    }
    await page.screenshot({path: testInfo.outputPath(`filter-${width}.png`), fullPage: true});
    await page.keyboard.press("Escape");
    await expect(filterButton(page)).toBeFocused();
    await expect(page).toHaveURL(/\?month=2026-04$/);
  }
});

test("posted-date filters, installment/category combinations and Clear all leave finances unchanged (authenticated isolated real API)", async ({page, baseURL}) => {
  test.skip(!process.env.LUNA_E2E_ISOLATED_URL, "Requires an explicitly designated disposable server");
  expect(baseURL).toBe(process.env.LUNA_E2E_ISOLATED_URL);
  test.setTimeout(60000);
  const request = page.request, username = "import_fixture", password = "fixture-password-only-2026";
  const setup = await request.post("/api/auth/setup", {data: {username, password, setupToken: "isolated-fixture-setup"}});
  if (!setup.ok()) expect(await setup.text()).toContain("Owner");
  expect((await request.post("/api/auth/login", {data: {username, password}})).ok()).toBe(true);
  const csrf = (await page.context().cookies()).find(cookie => cookie.name === "luna_csrf")!.value;
  const headers = {"x-luna-csrf": csrf, origin: baseURL!};
  async function post(path: string, data: unknown) {
    const response = await request.post("/api/" + path, {headers, data});
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  }
  const stamp = Date.now(), account = await post("accounts", {name: "Date filter fixture " + stamp, type: "credit_card", creditLimit: "50000", openingDate: "2024-01-01", openingBalance: "0"});
  const csv = "Sale date,Post date,Merchant,Amount,Type,Category,Transaction notes\n"
    + `2026-03-31,2026-04-01,April first ${stamp},10,Expense,,\n`
    + `2026-04-30,2026-05-01,May posting ${stamp},20,Expense,,\n`
    + `2026-04-29,2026-04-30,(04/12) Laptop ${stamp},30,,,\n`
    + `2024-02-28,2024-02-29,Leap purchase ${stamp},5,Expense,,\n`
    + `2026-10-01,2026-10-01,Current month ${stamp},7,Expense,,\n`;
  const upload = await post("statements", {accountId: account.id, filename: `date-filter-${stamp}.csv`, mime: "text/csv", base64: Buffer.from(csv).toString("base64")});
  expect(upload.imported).toBe(5);
  expect(upload.needsAttention).toBe(0);
  const before = await (await request.get("/api/export")).json();
  const beforeReports = await (await request.get("/api/reports?month=2026-04")).json();
  delete before.exported_at;
  const mutations: string[] = [];
  page.on("request", request => {
    if (request.url().includes("/api/") && request.method() !== "GET") mutations.push(request.url());
  });
  await page.goto(`/transactions?account=${account.id}&batch=${upload.id}`);
  await expect(dateButton(page)).toHaveText("All time");
  await expect(page.getByRole("row").filter({hasText: `Leap purchase ${stamp}`})).toBeVisible();
  await dateButton(page).click();
  await page.getByRole("combobox", {name: "Date mode", exact: true}).selectOption("month");
  await page.getByLabel("Month", {exact: true}).fill("2026-04");
  await page.getByRole("dialog").getByRole("button", {name: "Apply", exact: true}).click();
  await expect(page.getByRole("row").filter({hasText: `April first ${stamp}`})).toBeVisible();
  await expect(page.getByRole("row").filter({hasText: `Laptop ${stamp}`})).toBeVisible();
  await expect(page.getByRole("row").filter({hasText: `May posting ${stamp}`})).toHaveCount(0);
  const april = await (await request.get(`/api/transactions?page=1&account=${account.id}&month=2026-04`)).json();
  expect(april.total).toBe(2);
  expect(april.items.map((item: {posted_date: string}) => item.posted_date).sort()).toEqual(["2026-04-01", "2026-04-30"]);
  await dateButton(page).click();
  await page.getByRole("combobox", {name: "Date mode", exact: true}).selectOption("range");
  await page.getByLabel("Start date", {exact: true}).fill("2026-05-01");
  await page.getByLabel("End date", {exact: true}).fill("2026-05-01");
  await page.getByRole("dialog").getByRole("button", {name: "Apply", exact: true}).click();
  await expect(page.getByRole("row").filter({hasText: `May posting ${stamp}`})).toBeVisible();
  await expect(page.getByRole("row").filter({hasText: `April first ${stamp}`})).toHaveCount(0);
  await dateButton(page).click();
  await page.getByRole("combobox", {name: "Date mode", exact: true}).selectOption("month");
  await page.getByLabel("Month", {exact: true}).fill("2026-04");
  await page.getByRole("dialog").getByRole("button", {name: "Apply", exact: true}).click();
  await filterButton(page).click();
  await page.getByRole("combobox", {name: "Type", exact: true}).selectOption("installment");
  await page.getByRole("combobox", {name: "Category", exact: true}).selectOption("uncategorized");
  await page.getByRole("dialog").getByRole("button", {name: "Apply", exact: true}).click();
  await expect(filterButton(page)).toHaveAccessibleName("Filter, 4 active filters");
  await expect(page.getByRole("row").filter({hasText: `Laptop ${stamp}`})).toBeVisible();
  await expect(page.getByRole("row").filter({hasText: `April first ${stamp}`})).toHaveCount(0);
  await searchInput(page).fill("Laptop");
  expect(new URL(page.url()).searchParams.get("batch")).toBe(String(upload.id));
  await page.reload();
  await expect(page.getByRole("row").filter({hasText: `Laptop ${stamp}`})).toBeVisible();
  await filterButton(page).click();
  await page.getByRole("button", {name: "Clear all", exact: true}).click();
  await expect(page).toHaveURL(/search=Laptop/);
  await page.getByRole("dialog").getByRole("button", {name: "Apply", exact: true}).click();
  await expect(page).toHaveURL(/\?period=all$/);
  const after = await (await request.get("/api/export")).json();
  delete after.exported_at;
  expect(after).toEqual(before);
  expect(await (await request.get("/api/reports?month=2026-04")).json()).toEqual(beforeReports);
  expect(mutations).toEqual([]);
  const extraCsv = "Sale date,Post date,Merchant,Amount,Type,Category,Transaction notes\n"
    + Array.from({length: 36}, (_, index) => `2026-04-01,2026-04-01,Pagination ${stamp} ${index},${index + 100},Expense,,`).join("\n");
  const extra = await post("statements", {accountId: account.id, filename: `pagination-${stamp}.csv`, mime: "text/csv", base64: Buffer.from(extraCsv).toString("base64")});
  expect(extra.imported).toBe(36);
  const ids: number[] = [];
  for (const [index, count] of [20, 20, 1].entries()) {
    const result = await (await request.get(`/api/transactions?account=${account.id}&page=${index + 1}`)).json();
    expect(result.pageSize).toBe(20);
    expect(result.total).toBe(41);
    expect(result.items).toHaveLength(count);
    ids.push(...result.items.map((item: {id: number}) => item.id));
  }
  expect(new Set(ids).size).toBe(41);
  await page.goto(`/transactions?account=${account.id}&period=all`);
  const pagination = page.getByRole("navigation", {name: "Transaction pagination"});
  for (const [index, count] of [20, 20, 1].entries()) {
    await expect(pagination.getByRole("status")).toHaveText(`41 records · page ${index + 1} of 3`);
    await expect(page.locator("tbody tr")).toHaveCount(count);
    if (index < 2) await pagination.getByRole("button", {name: "Next", exact: true}).click();
  }
  await expect(pagination.getByRole("button", {name: "Next", exact: true})).toBeDisabled();
  await pagination.getByRole("button", {name: "Previous", exact: true}).click();
  await expect(page.locator("tbody tr")).toHaveCount(20);
  await expect(pagination.getByRole("status")).toHaveText("41 records · page 2 of 3");
});


test("transaction rows combine category and description with type icons before dates (mocked API)", async ({page}) => {
  await filterWorkspace(page);
  await page.setViewportSize({width:1440,height:900});
  await page.goto("/transactions?period=all&search=Cafe");
  const table=page.getByRole("table",{name:"Posted transactions"});
  await expect(table.getByRole("columnheader")).toHaveText(["Type","Date","Merchant","Account","Amount","Source","Details"]);
  const row=table.getByRole("row").filter({hasText:"Cafe"});
  await expect(row.getByRole("cell").nth(0)).toHaveText("Expense");
  await expect(row.getByRole("cell").nth(0).locator("svg")).toBeVisible();
  await expect(row.getByRole("cell").nth(1)).toHaveText("2026-10-01");
  await expect(row.getByRole("cell").nth(2)).toContainText("Food ㆍ Lunch");
  await row.getByRole("button",{name:"View Cafe on 2026-10-01"}).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.setViewportSize({width:390,height:844});
  const item=page.getByRole("list",{name:"Posted transactions"}).getByRole("listitem");
  await expect(item).toContainText("Food ㆍ Lunch");
  await expect(item.locator(".record-meta").locator("svg")).toBeVisible();
});
