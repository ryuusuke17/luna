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
  await page.goto("/transactions?account=2&batch=6&period=all");
  await expect(dateButton(page)).toHaveText("All time");
  await expect(page.getByRole("row").filter({hasText: "Silicon Valley"})).toBeVisible();
  await searchInput(page).fill("Silicon");
  expect(new URL(page.url()).searchParams.get("batch")).toBe("6");
  await dateButton(page).click();
  await page.getByRole("combobox", {name: "Date mode", exact: true}).selectOption("month");
  await page.getByLabel("Month", {exact: true}).fill("2026-04");
  await page.getByRole("dialog").getByRole("button", {name: "Apply", exact: true}).click();
  expect(new URL(page.url()).searchParams.get("batch")).toBe("6");
  await page.goto("/transactions?legacy=csv&importId=3&period=all");
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
  await expect(page).toHaveURL(/month=2026-04&dateMode=calendar&kind=installment/);
  await page.goBack();
  await expect(page).toHaveURL(/\?month=2026-04&dateMode=calendar$/);
  await page.goBack();
  await expect(page).toHaveURL(/\?period=all$/);
  await page.goto("/transactions?id=12&period=all");
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
  await page.goto(`/transactions?account=${account.id}&batch=${upload.id}&period=all`);
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


async function issuedWorkspace(page: Page) {
  const state=await filterWorkspace(page);
  const issues=[
    {id:91,card_id:2,card_name:"Everyday card",statement_date:"2026-08-25",currency:"USD",filename:"August separate USD.csv"},
    {id:90,card_id:2,card_name:"Everyday card",statement_date:"2026-08-15",currency:"PHP",filename:"August issue with a very long source filename ".repeat(3)+".csv"},
    {id:89,card_id:2,card_name:"Everyday card",statement_date:"2026-06-15",currency:"PHP",filename:"June older.csv"},
  ].map(issue=>({...issue,last4:"4321",due_date:"2026-09-15",original_balance:1000,minimum_due:100,applied:0,remaining:1000,status:"not_tracked",metadata:{issuer:"Fixture bank"}}));
  const statementRequests:URLSearchParams[]=[],activityRequests:URLSearchParams[]=[],transactionRequests:URLSearchParams[]=[];
  let fail=false,activityFail=false,heldIssue="",release:(()=>void)|undefined;
  const lines=issues.flatMap(issue=>Array.from({length:issue.id===90?20:issue.id===89?26:1},(_,index)=>({id:issue.id*100+index,statement_id:issue.id,row_index:index+1,card_id:2,card_name:issue.card_name,issuer:"Fixture bank",last4:"4321",currency:issue.currency,statement_month:issue.statement_date.slice(0,7),amount:index===19||issue.id===91?-300000:1000,display_type:index===19||issue.id===91?"payment":index===1?"installment":"charge",display_category:"Shopping",ledgerTransactionId:issue.id===90&&index===0?200:null,source:{saleDate:issue.id===90?"2026-07-25":issue.statement_date,postDate:issue.id===90?index===0?"2026-07-25":"2026-08-07":issue.statement_date,merchantRaw:issue.id===90?index===0?"Linked July purchase":`Unlinked source purchase ${index}`:issue.id===91?"Unlinked USD credit":`Older source ${index}`,transactionNotesRaw:"Immutable source line",typeRaw:"charge"}})));
  const cards=[{id:2,name:"Everyday card",issuer:"Fixture bank",last4:"4321",credit_limit:100000}];
  await page.route(/\/api\/credit-card-statements(?:\?|$)/,async route=>{
    const q=new URL(route.request().url()).searchParams;statementRequests.push(q);
    if(fail){await route.fulfill({status:503,json:{message:"Statements temporarily unavailable"}});return;}
    const selected=issues.filter(issue=>q.has("month")?issue.statement_date.startsWith(q.get("month")!):false);
    const scoped=q.get("cards")&&q.get("cards")!=="2"?[]:issues;
    const number=Number(q.get("page")||1);
    await route.fulfill({json:{items:q.has("month")?selected:scoped.slice((number-1)*2,number*2),page:number,pageSize:2,total:q.has("month")?selected.length:scoped.length,metrics:[],cards:[{id:2,selectedIssues:selected}],allCards:cards,issuers:["Fixture bank"]}});
  });
  await page.route(/\/api\/transactions(?:\?|$)/,async(route)=>{
    const q=new URL(route.request().url()).searchParams;
    transactionRequests.push(new URLSearchParams(q));
    if(!q.has("issuedStatement")){await route.fallback();return;}
    state.requests.push(new URLSearchParams(q));
    const items=q.get("issuedStatement")==="90"?[{id:200,posted_date:"2026-07-25",merchant:"Linked July purchase",description:"Corrected linked row",kind:"expense",account_id:2,account_name:"Everyday card",amount:1000,source:"import",balance_impacts:[],version:"1"}]:[];
    await route.fulfill({json:{items,total:items.length,pageSize:20}});
  });
  await page.route(/\/api\/credit-card-dashboard(?:\?|$)/,async route=>{
    const q=new URL(route.request().url()).searchParams;activityRequests.push(new URLSearchParams(q));
    if(activityFail){await route.fulfill({status:503,json:{message:"Statement lines temporarily unavailable"}});return;}
    if(heldIssue&&q.get("issuedStatement")===heldIssue)await new Promise<void>(resolve=>{release=resolve;});
    if(q.has("issuedStatement")&&(!issues.some(issue=>String(issue.id)===q.get("issuedStatement"))||q.has("cards")&&q.get("cards")!=="2")){await route.fulfill({status:400,json:{message:"Statement unavailable for this account"}});return;}
    const selected=issues.filter(issue=>(!q.get("issuedStatement")||String(issue.id)===q.get("issuedStatement"))&&(!q.get("month")||issue.statement_date.startsWith(q.get("month")!))&&(!q.get("cards")||q.get("cards")==="2"));
    const filtered=lines.filter(line=>selected.some(issue=>issue.id===line.statement_id)&&(!q.get("lineSearch")||line.source.merchantRaw.toLowerCase().includes(q.get("lineSearch")!.toLowerCase()))&&(!q.get("lineType")||(q.get("lineType")==="credit"?line.amount<0:line.display_type===q.get("lineType")))&&(!q.get("start")||line.source.postDate>=q.get("start")!)&&(!q.get("end")||line.source.postDate<=q.get("end")!));
    const linePage=Number(q.get("linePage")||1),number=Number(q.get("page")||1);
    await route.fulfill({json:{items:selected.slice((number-1)*25,number*25),total:selected.length,page:number,pageSize:25,metrics:[],cards:[],allCards:cards,issuers:["Fixture bank"],availableMonths:["2026-08","2026-06"],activity:{items:filtered.slice((linePage-1)*25,linePage*25),total:filtered.length,page:linePage,pageSize:25,categories:["Shopping"]}}});
  });
  await page.route(/\/api\/credit-card-statements\/\d+(?:\?|$)/,route=>route.fulfill({status:503,json:{message:"Read-only detail fixture unavailable"}}));
  return {...state,issues,lines,statementRequests,activityRequests,transactionRequests,failNext:()=>{fail=true;},recover:()=>{fail=false;activityFail=false;},failActivity:()=>{activityFail=true;},holdIssue:(id:string)=>{heldIssue=id;},releaseIssue:()=>{heldIssue="";release?.();}};
}

test("main Transactions excludes statement activity and keeps its query scoped to manual non-card entries",async({page})=>{
  const state=await issuedWorkspace(page);
  const activity=page.getByRole("region",{name:"Unified statement transactions",exact:true});
  await page.goto("/transactions?account=2&dateMode=statement&issuedStatement=90&lineSearch=linked");
  await expect(activity).toHaveCount(0);
  await expect(page.getByRole("option",{name:"Per statement",exact:true})).toHaveCount(0);
  await expect(page.getByRole("option",{name:"Statement month",exact:true})).toHaveCount(0);
  await expect(page).not.toHaveURL(/issuedStatement|lineSearch/);
  await expect(page.getByRole("button",{name:/Date filter:/})).toBeVisible();
  expect(state.activityRequests).toHaveLength(0);
  expect(state.statementRequests).toHaveLength(0);
  expect(state.transactionRequests.length).toBeGreaterThan(0);
  expect(state.transactionRequests.every(query=>query.get("scope")==="manual-non-card"&&!query.has("issuedStatement"))).toBe(true);
  expect(state.workspace.requests.every(request=>request.method==="GET")).toBe(true);
});

test("card account bare months now use statement-month activity by default",async({page})=>{
  const state=await issuedWorkspace(page);
  await page.goto("/accounts/2?account=2&month=2026-08&search=linked&sort=oldest");
  await expect(page).toHaveURL(/dateMode=statement-month/);
  expect(new URL(page.url()).searchParams.has("search")).toBe(false);
  expect(new URL(page.url()).searchParams.has("sort")).toBe(false);
  expect(state.requests).toHaveLength(0);expect(state.activityRequests.some(q=>q.get("month")==="2026-08"&&q.get("cards")==="2"&&!q.has("issuedStatement"))).toBe(true);
  await expect(page.getByRole("region",{name:"Unified statement transactions",exact:true}).locator("tbody tr")).toHaveCount(21);
  await page.goto("/accounts/2?account=2&month=2026-09");
  await expect(page.getByText("No statement issued in September 2026 for this card. Choose another statement month or Calendar month.")).toBeVisible();
  await dateButton(page).click();await page.getByRole("combobox",{name:"Date mode",exact:true}).selectOption("month");
  await page.getByLabel("Month",{exact:true}).fill("2026-09");
  await page.getByRole("dialog",{name:"Date filter",exact:true}).getByRole("button",{name:"Apply",exact:true}).click();
  await expect(page).toHaveURL(/dateMode=calendar/);await page.reload();await expect(dateButton(page)).toHaveText("September 2026");
  expect(state.requests.some(q=>q.get("month")==="2026-09"&&q.get("dateMode")==="calendar")).toBe(true);
});

test("statement month shows every card statement issued in that month and distinguishes empty months",async({page})=>{
  const state=await issuedWorkspace(page);
  await page.goto("/accounts/2?account=2");
  await expect(dateButton(page)).toHaveText("October 2026");
  await dateButton(page).click();
  const chooser=page.getByRole("dialog",{name:"Date filter",exact:true});
  await expect(chooser.getByRole("combobox",{name:"Date mode",exact:true}).getByRole("option",{name:"Per statement",exact:true})).toHaveCount(0);
  await expect(chooser.getByRole("combobox",{name:"Date mode",exact:true})).toHaveValue("statement-month");
  await page.locator('input[type="month"]').fill("2026-08");
  await chooser.getByRole("button",{name:"Apply",exact:true}).click();
  await expect(page).toHaveURL(/dateMode=statement-month/);
  await expect(page).toHaveURL(/month=2026-08/);
  const activity=page.getByRole("region",{name:"Unified statement transactions",exact:true});
  await expect(activity.locator("tbody tr")).toHaveCount(21);
  const issuedMonth=[...state.activityRequests].reverse().find(query=>query.get("month")==="2026-08");
  expect(issuedMonth?.get("cards")).toBe("2");
  expect(issuedMonth?.has("issuedStatement")).toBe(false);
  expect(state.transactionRequests.some(query=>query.get("month")==="2026-08"&&query.get("account")==="2")).toBe(false);

  await page.goto("/accounts/2?account=2&month=2026-10&dateMode=statement-month");
  await expect(page.getByText("No statement issued in October 2026 for this card. Choose another statement month or Calendar month.")).toBeVisible();
});

test("card account filters stay compact and fit touch layouts",async({page})=>{
  const state=await issuedWorkspace(page);
  await page.goto("/accounts/2?account=2");
  await expect(dateButton(page)).toHaveText("October 2026");
  await expect(page.getByLabel("Merchant / notes",{exact:true})).toBeVisible();
  await expect(page.getByText("Filters",{exact:true})).toBeVisible();
  await expect(page.getByRole("searchbox",{name:"Merchant / notes"})).toHaveAttribute("placeholder","Merchant / notes");
  const toolbar=page.getByLabel("Transaction filters");
  expect(await toolbar.evaluate(element=>element.getBoundingClientRect().width)).toBeGreaterThan(600);
  expect(await toolbar.evaluate(element=>[getComputedStyle(element).paddingLeft,getComputedStyle(element).paddingRight])).toEqual(["16px","16px"]);
  await expect(page.getByLabel("Exact signed amount",{exact:true})).toHaveCount(0);
  await page.getByText("Filters",{exact:true}).click();
  await expect(page.getByLabel("Exact signed amount",{exact:true})).toHaveCount(0);
  await expect(page.getByLabel("Amount currency",{exact:true})).toHaveCount(0);
  await expect(page.getByRole("combobox",{name:"Line type",exact:true})).toBeVisible();
  await expect(page.getByRole("button",{name:"Apply",exact:true})).toBeVisible();
  await expect(page.getByRole("button",{name:"Reset",exact:true})).toBeVisible();
  await page.getByRole("heading",{name:"Transactions",exact:true}).click();
  await expect(page.getByRole("combobox",{name:"Line type",exact:true})).toHaveCount(0);
  await page.getByText("Filters",{exact:true}).click();
  await page.getByRole("combobox",{name:"Line type",exact:true}).selectOption("charge");
  expect(new URL(page.url()).searchParams.has("lineType")).toBe(false);
  await page.getByRole("button",{name:"Apply",exact:true}).click();
  await expect(page).toHaveURL(/lineType=charge/);
  await page.getByText(/Filters · 1/).click();
  await page.getByRole("combobox",{name:"Line type",exact:true}).selectOption("payment");
  await page.getByRole("button",{name:"Reset",exact:true}).click();
  await expect(page).not.toHaveURL(/lineType/);
  await page.goto("/accounts/2?account=2&dateMode=statement-month&month=2026-08&lineCurrency=194");
  await expect(page).not.toHaveURL(/lineCurrency/);
  await expect(page.getByRole("region",{name:"Unified statement transactions",exact:true}).locator("tbody tr")).toHaveCount(21);
  expect(state.activityRequests.every(query=>!query.has("lineCurrency"))).toBe(true);
  await page.keyboard.press("Escape");
  const bottoms=await Promise.all([
    dateButton(page).evaluate(element=>element.getBoundingClientRect().bottom),
    page.getByRole("searchbox",{name:"Merchant / notes"}).evaluate(element=>element.getBoundingClientRect().bottom),
    page.locator("summary").filter({hasText:/Filters/}).evaluate(element=>element.getBoundingClientRect().bottom),
  ]);
  expect(Math.max(...bottoms)-Math.min(...bottoms)).toBeLessThanOrEqual(4);
  for(const width of [1440,820,390,320]){
    await page.setViewportSize({width,height:900});await dateButton(page).focus();await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog",{name:"Date filter",exact:true})).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.keyboard.press("Escape");await expect(dateButton(page)).toBeFocused();
  }
});

test("statement source membership stays within Accounts and Statements with independent line dates",async({page})=>{
  const state=await issuedWorkspace(page);
  const activity=page.getByRole("region",{name:"Unified statement transactions",exact:true});
  let expected:string[]=[];
  for(const path of ["/accounts/2?account=2&dateMode=statement&issuedStatement=90","/statements?issuedStatement=90"]){
    await page.goto(path);await expect(activity.locator("tbody tr")).toHaveCount(20);
    if(path.startsWith("/accounts/")){
      expect(await activity.locator("thead th").allTextContents()).toEqual(["Sale date","Post date","Merchant / description","Signed amount","Type","Category","Notes"]);
      await expect(activity.getByRole("button",{name:/View source/})).toHaveCount(0);
      await expect(activity.getByText("Statement transactions",{exact:true})).toHaveCount(0);
      await expect(activity.getByText("Statement row",{exact:false})).toHaveCount(0);
      await expect(activity.getByRole("columnheader",{name:"Type"})).toHaveClass(/w-24/);
      await expect(page.getByLabel("Merchant / notes",{exact:true})).toBeVisible();
    }else{
      expect(await activity.locator("thead th").allTextContents()).toEqual(["Sale date","Post date","Merchant / description","Issuer","Card","Statement month","Signed amount","Type","Category","Funding / payment source","Notes / source"]);
      await expect(activity.getByRole("button",{name:/View source/})).toHaveCount(20);
      await expect(page.getByText("Statement transactions",{exact:true})).toBeVisible();
    }
    const merchants=await activity.locator("tbody tr td:nth-child(3)").allTextContents();
    if(expected.length)expect(merchants).toEqual(expected);else expected=merchants;
    await expect(activity.getByRole("link",{name:path.startsWith("/accounts/")?"Ledger #200":"Linked ledger #200"})).toHaveAttribute("href",path.startsWith("/accounts/")?"/accounts/2?account=2&period=all&id=200":"/accounts/2?account=2&dateMode=statement&issuedStatement=90");
    await expect(page.getByRole("button",{name:/Edit transaction|Delete transaction/})).toHaveCount(0);
  }
  await page.goto("/accounts/2?account=2&dateMode=statement&issuedStatement=90");
  await page.getByText("Filters",{exact:true}).click();
  await page.getByLabel("Post date from",{exact:true}).fill("2026-08-01");
  await expect(activity.locator("tbody tr")).toHaveCount(20);
  expect(new URL(page.url()).searchParams.has("lineStart")).toBe(false);
  await page.getByRole("button",{name:"Apply",exact:true}).click();
  await expect(activity.locator("tbody tr")).toHaveCount(19);
  expect(new URL(page.url()).searchParams.get("lineStart")).toBe("2026-08-01");
  expect(new URL(page.url()).searchParams.has("start")).toBe(false);
  expect(state.activityRequests.some(query=>query.get("start")==="2026-08-01"&&!query.has("month"))).toBe(true);
  await page.reload();await expect(activity.locator("tbody tr")).toHaveCount(19);
  await page.goto("/accounts/2?account=2&dateMode=statement&issuedStatement=89&lineSort=merchant");
  await expect(activity.locator("tbody tr")).toHaveCount(25);
  await page.getByRole("button",{name:"Next activity",exact:true}).click();
  await expect(activity.locator("tbody tr")).toHaveCount(1);
  await page.getByRole("button",{name:"Next statement",exact:true}).click();
  await expect(activity.locator("tbody tr")).toHaveCount(20);
  const query=new URL(page.url()).searchParams;expect(query.has("linePage")).toBe(false);expect(query.get("lineSort")).toBe("merchant");
  await page.getByLabel("Merchant / notes",{exact:true}).fill("missing source");
  await expect(page.getByText("No lines match these activity filters.",{exact:false})).toBeVisible();
  await page.goBack();await expect(activity.locator("tbody tr")).toHaveCount(20);
  const search=page.getByLabel("Merchant / notes",{exact:true});await search.focus();await search.pressSequentially("Unlinked");
  await expect(search).toBeFocused();await expect(search).toHaveValue("Unlinked");await expect(activity.locator("tbody tr")).toHaveCount(19);
  expect(state.requests.some(query=>query.has("issuedStatement"))).toBe(false);
  expect(state.workspace.requests.every(request=>request.method==="GET")).toBe(true);
});

test("per-statement switching never displays stale rows and unavailable or failed requests remain explicit",async({page})=>{
  const state=await issuedWorkspace(page),activity=page.getByRole("region",{name:"Unified statement transactions",exact:true});
  await page.goto("/accounts/2?account=2&dateMode=statement&issuedStatement=90");
  await expect(activity.locator("tbody tr")).toHaveCount(20);
  state.holdIssue("91");await page.getByRole("button",{name:"Next statement",exact:true}).click();
  await expect(page.getByText("Loading statement lines…",{exact:true})).toBeVisible();
  await expect(activity).toHaveCount(0);state.releaseIssue();
  await expect(activity.locator("tbody tr")).toHaveCount(1);
  for(const path of ["/accounts/1?account=1&dateMode=statement&issuedStatement=90","/statements?issuedStatement=99999"]){
    await page.goto(path);await expect(page.getByRole("alert").filter({hasText:"Statement unavailable for this account"})).toBeVisible({timeout:15000});
    await expect(activity).toHaveCount(0);
  }
  state.failActivity();await page.goto("/accounts/2?account=2&dateMode=statement&issuedStatement=90");
  const retry=page.getByRole("button",{name:"Retry statement lines",exact:true});
  await expect(retry).toBeVisible({timeout:15000});await expect(activity).toHaveCount(0);
  expect(state.workspace.requests.every(request=>request.method==="GET")).toBe(true);
});

test("Statements activity selector retains line filters and keeps details independent",async({page})=>{
  const state=await issuedWorkspace(page);
  await page.goto("/statements?month=2026-08&activityMonth=2026-08&activityCard=2&lineType=credit&page=2&linePage=2");
  const select=page.getByRole("combobox",{name:"Statement",exact:true}),activity=page.getByRole("region",{name:"Unified statement transactions",exact:true});
  await expect(select).toHaveValue("");await expect(select.getByRole("option",{name:/2026-08-15 · #90/})).toBeAttached();
  await select.selectOption("90");
  await expect(select).toHaveValue("90");
  const query=new URL(page.url()).searchParams;for(const key of ["activityMonth","activityCard","linePage"])expect(query.has(key)).toBe(false);expect(query.get("lineType")).toBe("credit");expect(query.get("month")).toBe("2026-08");expect(query.get("page")).toBe("2");
  await expect(activity.locator("tbody tr")).toHaveCount(1);
  await expect(page.getByRole("button",{name:"View statement #91",exact:true})).toHaveCount(0);
  await page.goto("/statements?activityStatement=90&lineType=credit&document=90");
  await expect(page.getByRole("region",{name:"Credit card statement detail",exact:true})).toBeVisible();await expect(activity.locator("tbody tr")).toHaveCount(1);
  await page.getByRole("button",{name:"Close statement",exact:true}).click();await expect(select).toHaveValue("90");
  await page.reload();await expect(select).toHaveValue("90");await expect(activity.locator("tbody tr")).toHaveCount(1);
  await page.getByRole("combobox",{name:"Issue month",exact:true}).selectOption("2026-06");
  await expect(select).toHaveValue("");expect(new URL(page.url()).searchParams.has("activityStatement")).toBe(false);
  await page.goBack();await expect(select).toHaveValue("90");await page.goForward();await expect(select).toHaveValue("");
  await page.goto("/statements?activityStatement=89");await expect(select).toHaveValue("89");
  await expect(select.getByRole("option",{name:/2026-06-15 · #89/})).toBeAttached();
  expect(state.statementRequests.some(query=>query.get("page")==="2")).toBe(true);
  await expect(activity.locator("tbody tr")).toHaveCount(25);
  await select.selectOption("");await expect(page.getByRole("navigation",{name:"Activity pagination"})).toContainText("47 lines");
  state.holdIssue("91");await select.focus();await select.selectOption("91");
  await expect(page.getByText("Loading statement transactions…",{exact:true})).toBeVisible();await expect(activity).toHaveCount(0);state.releaseIssue();
  await expect(activity.locator("tbody tr")).toHaveCount(1);await expect(select).toBeFocused();
  const search=page.getByLabel("Merchant / notes",{exact:true});await search.focus();await search.pressSequentially("Unlinked");
  await expect(search).toBeFocused();await expect(search).toHaveValue("Unlinked");await expect(activity.locator("tbody tr")).toHaveCount(1);
  expect(state.workspace.requests.every(request=>request.method==="GET")).toBe(true);
});

test("per-statement responsive desktop tablet mobile screenshots preserve keyboard focus and contained scrolling",async({page},testInfo)=>{
  await issuedWorkspace(page);
  for(const [name,width] of [["desktop",1440],["tablet",820],["mobile",390]] as const){
    await page.setViewportSize({width,height:900});
    for(const [surface,path] of [["accounts","/accounts/2?account=2&dateMode=statement&issuedStatement=90"],["statements","/statements?issuedStatement=90"]]){
      await page.goto(path);const region=page.getByRole("region",{name:"Unified statement transactions",exact:true});
      await expect(region.locator("tbody tr")).toHaveCount(20);await region.focus();await expect(region).toBeFocused();
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      await page.screenshot({path:testInfo.outputPath(`${surface}-${name}.png`),fullPage:true});
    }
  }
});
