const explanations: Record<string, string> = {
  "Invalid username or password": "The username or password is incorrect. Check both and try again. Usernames are case-sensitive.",
  "Too many attempts. Try again later": "Too many sign-in attempts. Wait 15 minutes before trying again.",
  "Owner already exists": "This workspace already has an owner. Sign in with the existing account instead.",
  "Owner setup is closed": "Owner setup is unavailable. Contact the person managing this Luna server.",
  "Sign in required": "Your session has ended. Sign in again to continue.",
  "Invalid request origin": "Luna could not verify this browser request. Open the app at its configured address, then sign in again.",
  "Invalid CSRF token": "Your session could not be verified. Reload the page and sign in again before retrying.",
  "Invalid session or CSRF token": "Your session could not be verified. Reload the page and sign in again before retrying.",
  "Invalid text": "Enter a name or description within the field’s length limit.",
  "Invalid record ID": "Choose an existing record from this workspace, then try again.",
  "Invalid calendar date": "Choose a valid calendar date.",
  "Amount must be a decimal string": "Enter an amount in pesos, using no more than two decimal places.",
  "Amounts must be decimal strings": "Write amounts as quoted decimal values, such as \"12.34\", in the JSON file.",
  "Amount must be positive": "Enter an amount greater than zero, using no more than two decimal places.",
  "Amount is too large": "This amount exceeds Luna’s supported limit. Enter a smaller amount.",
  "Invalid amount": "Enter a valid amount, using no more than two decimal places.",
  "Invalid balance": "Enter a valid balance, using no more than two decimal places.",
  "Invalid credit limit": "Enter a credit limit greater than zero, using no more than two decimal places.",
  "Invalid account": "Check the account name, type and opening date. The opening date cannot be in the future.",
  "Invalid account details": "Check the account name, card details and credit limit, then try again.",
  "Credit cards require a positive credit limit": "Enter a credit limit greater than zero for this card.",
  "Account unavailable": "This account is unavailable in your workspace. Choose another active account.",
  "Account not found": "This account is unavailable in your workspace. Return to Accounts and select an existing account.",
  "Counter account unavailable": "The transfer destination is unavailable. Choose another active account.",
  "Credit repayment requires a credit card": "Choose a credit card for this repayment reminder.",
  "Credit repayment account unavailable": "The credit card is unavailable. Check the bill’s account before recording payment.",
  "Category unavailable or type mismatch": "Choose an active category matching the transaction type: income or expense.",
  "Selected category unavailable or type mismatch": "Choose an active category matching the row’s transaction type: income or expense.",
  "Category does not match transaction type": "Choose an income category for income, or an expense category for expenses and refunds.",
  "Opening balances and adjustments must keep their type and account.": "Opening balances and adjustments must keep their type and account. Change the amount or description instead.",
  "Opening date must match the account opening date.": "Choose the original account opening date for this opening record.",
  "Included fee must be greater than zero and no more than the full amount when enabled.": "Included fee must be greater than zero and no more than the full amount when enabled. Correct the fee or uncheck the fee control.",
  "Invalid transaction": "Check the transaction date, positive amount, account and category. Posted dates cannot be in the future.",
  "Invalid transaction metadata": "Shorten the description, merchant or notes to the field’s stated limit.",
  "Transaction predates account opening": "Choose a transaction date on or after the account’s opening date.",
  "Transaction predates counter account opening": "Choose a transaction date on or after the destination account’s opening date.",
  "Transfer needs two different accounts": "Choose different source and destination accounts for this transfer.",
  "Counter account only applies to transfers": "Only transfers can have a destination account. Check the transaction type.",
  "This transaction type cannot have a category": "Transfers, opening balances and adjustments do not use categories.",
  "Opening balance already exists": "This account already has an opening balance. Review its ledger before making another change.",
  "Adjustment requires a reason": "Enter a reason for the balance adjustment.",
  "Transaction not found": "This transaction is unavailable or already voided. Reload Transactions to check its current status.",
  "Invalid bill": "Check the bill name, positive amount, due date, account and category.",
  "Bill unavailable": "This bill is unavailable in your workspace. Reload Bills and select an existing reminder.",
  "Invalid payment": "Check the bill, payment date and funding account before recording payment.",
  "Invalid reminder preference": "Choose a reminder preference: once, monthly, quarterly or yearly.",
  "Invalid goal": "Check the goal name, positive target amount and optional target date.",
  "Goal unavailable": "This goal is unavailable in your workspace. Reload Goals and select an existing goal.",
  "Invalid allocation": "Check the goal, positive allocation amount and date before recording it.",
  "Invalid budget": "Choose an active category, a valid month and a positive planned amount.",
  "Invalid budget category": "Choose an active income or expense category for this budget.",
  "Planned amount must be positive": "Enter a planned amount greater than zero.",
  "Invalid category": "Enter a category name within the field’s limit and choose income or expense.",
  "Payment rows require counter_account_key": "Each payment row must include counter_account_key identifying its funding account. Compare it with the JSON template.",
  "Statement transactions do not match closing balance": "The statement’s transactions do not add up to its closing balance. Check the opening balance, amounts and transaction types before importing.",
  "Statement opening balance does not match the recorded card balance; reconcile coverage first": "The statement’s opening balance differs from the recorded card balance. Review earlier transactions and missing statement periods before importing.",
  "Statement predates card opening; resolve coverage first": "This statement starts before the card’s recorded opening date. Check the account’s opening date and earlier statement coverage before importing.",
  "CSV exceeds 2 MB": "This CSV file is larger than 2 MB. Choose a smaller file.",
  "CSV exceeds 5,000 rows": "This CSV contains more than 5,000 rows. Split it into smaller files before importing.",
  "Use a 3–40 character username and password of at least 12 characters": "Use a username of 3–40 letters, numbers, underscores, dots or hyphens, plus a password of 12–200 characters.",
  "Enter a non-negative amount with up to two decimals": "Enter zero or a positive amount in pesos, with no more than two decimal places. Do not include commas or currency symbols.",
  "Invalid preferences": "Luna could not save these preferences. Reload Settings, then try again.",
  "Invalid merchant rule": "Choose a matching category, enter a merchant phrase and use a whole-number priority between -10,000 and 10,000.",
  "Rule unavailable": "This merchant rule is unavailable. Reload Settings and select an existing rule.",
  "Invalid provider": "Enter a provider name and choose an expense category if needed.",
  "Provider unavailable": "This provider is unavailable. Reload Settings and select an existing provider.",
  "Invalid search": "Use no more than 100 characters in your search.",
  "Invalid month": "Choose a valid month and year.",
  "Invalid report month": "Choose a valid month and year for this report.",
  "Invalid sort": "Choose one of the available sorting options.",
  "Invalid type": "Choose one of the available transaction types.",
  "Invalid statement JSON v1": "This file does not match Luna’s JSON statement format. Compare it with the JSON template and correct the required fields.",
  "Invalid statement": "Choose a JSON statement matching Luna’s template.",
  "Payment funding required": "Payment funding required. Choose a distinct active cash, bank or wallet account.",
  "Credit payment requires a distinct cash, bank or wallet funding account.": "Choose a distinct active cash, bank or wallet funding account.",
  "Statement or matches changed. Reload and review before approving.": "Statement or matches changed. Evidence refreshed; review pending rows before retrying.",
  "Saved row decision differs from this retry. Reload and review pending rows.": "Saved row decision differs from this retry. Reload and review pending rows.",
  "Negative row requires explicit payment or refund classification": "Choose payment or refund classification for this negative row.",
  "Source already imported or conflicting; link or exclude this row": "Source already imported or conflicting; link or exclude this row.",
  "Possible duplicate requires a reason to import separately": "Possible duplicate requires a reason to import separately. Review source evidence before retrying.",
  "Invalid review decision": "Check row membership, category, funding and resolution values before retrying.",
  "Statement unavailable": "This statement is unavailable. Reload the archive and choose an existing upload.",
  "Statement unavailable. Check private storage or retry.": "Statement unavailable. Check private storage or retry.",
  "Only unapproved uploads can be removed. Approved or reconciled statements must be kept.": "Only unapproved uploads can be removed. Approved or reconciled statements must be kept.",
  "Statement changed. Close this dialog and review it again before removing.": "Statement changed. Close this dialog and review it again before removing.",
  "Invalid statement header": "Check the statement identifier, PHP currency, date range and transaction list against the JSON template.",
  "Invalid statement row": "Check each statement row’s date, supported type, positive amount and description or merchant.",
  "Invalid account or row mappings": "Choose a credit card and review every row’s category or funding account before importing.",
  "Invalid duplicate review": "Review the duplicate confirmation before importing the statement.",
  "Invalid CSV request": "Choose a CSV file matching Luna’s template and an active import account, then validate it again.",
  "Invalid JSON": "The file is not valid JSON. Correct its formatting or choose a file matching the JSON template.",
  "Malformed CSV quotes": "The CSV has incorrectly placed quotation marks. Export it again using the Luna CSV template.",
  "Unclosed CSV quote": "The CSV has an unfinished quoted field. Close its quotation marks, then validate again.",
  "Unexpected text after closing quote": "The CSV has text outside a quoted field. Correct its quotation marks, then validate again.",
  "Missing or duplicate CSV headers": "Use each CSV column heading exactly once. Compare the first row with the Luna CSV template.",
  "Repeated source ID within CSV": "Two selected rows share the same source ID. Review them and give distinct transactions unique source IDs.",
  "CSV has no data rows": "This CSV contains no transactions. Add rows below the template headings, then validate again.",
  "Payload too large": "This submission is too large. Shorten the entered text; import files must be no larger than 2 MB.",
  "Expected JSON": "This import requires a JSON file matching Luna’s statement template.",
};

export function clearMessage(value: unknown): string | undefined {
  if (typeof value !== "string") return;
  const message = value.trim();
  if (!message || message.length > 600) return;
  if (Object.prototype.hasOwnProperty.call(explanations, message)) return explanations[message];
  if (/csrf/i.test(message)) return explanations["Invalid CSRF token"];
  if (/request key|idempotency|different or voided transaction/i.test(message)) return "This submission was already used for a different or voided record. Reload the records and check their status before submitting again.";
  const row = /^Row (\d+): (.+)$/i.exec(message);
  if (row) {
    const details: Record<string, string> = {
      "invalid mapping": "Choose a valid category or transfer destination for this row.",
      "invalid date/type/text": "Check the ISO date, supported transaction type and text lengths. Posted dates cannot be in the future.",
      "amount must be positive": "Enter an amount greater than zero with no more than two decimal places.",
      "invalid transfer destination": "Choose a different active destination account from this workspace.",
      "predates account opening": "Use a date on or after the import account’s opening date.",
      "inconsistent columns": "Use the same number of columns as the template headings. Quote fields containing commas or newlines.",
    };
    return `Row ${row[1]}: ${details[row[2]] ?? clearMessage(row[2]) ?? "Review this row’s date, amount, category and destination, then validate again."}`;
  }
  if (/^Invalid (page|id|account|category)$/.test(message)) return "Choose an existing record or reset the filters, then try again.";
  if (/^(Request failed|HTTP(?:Error| error)?|Bad Request|Unauthorized|Forbidden|Not Found|Internal Server Error|Service Unavailable|Bad Gateway|Gateway Timeout|Request Timeout|Conflict|Too Many Requests|Unprocessable (Entity|Content)|Unsupported Media Type|Request Entity Too Large|Method not allowed|Not found|Error|Import failed|\d{3})$/i.test(message)) return;
  if (/HTTPError|\bHTTP\s*\d{3}|\[\d{3}\]|https?:\/\/|Request failed \(\d+\)|SQLITE|\bSQL\b|constraint failed|\bSELECT\b.+\bFROM\b|\bINSERT INTO\b|\bUPDATE\b.+\bSET\b|\bTypeError\b|\bReferenceError\b|\bSyntaxError\b|\bstack\b|\bat \S+\(|node_modules|[A-Z]:\\|<html|<!doctype|fetch failed|Failed to fetch|Load failed|NetworkError|Unexpected token|JSON\.parse|JSON at position|JSON at line|Unexpected end of JSON|Cannot read properties|Cannot convert|is not a function|is not defined|ENOENT|ECONN|EACCES|ERR_|binding|native module/i.test(message)) return;
  if (/^(Unknown|Ambiguous) category: [^\r\n]{1,60}$/.test(message)) return `${message}. Choose an explicit active category matching the row type.`;
  if (/^(Choose |Select |Use |Enter |Check |Luna |Your session |Cannot reach Luna\.|Too many |This |The file |Payment row \d+ needs |Paid reminders |Allocation date |Total allocation |Statement total |Possible (CSV content |content )?duplicate |Source transaction already imported:)/.test(message)) return message;
}

export function requestMessage(status: number, body: unknown, path: string, method = "GET"): string {
  const endpoint = path.split("?")[0];
  const labels: Record<string, string> = {accounts:"accounts",transactions:"transactions",reports:"financial reports",budgets:"budgets",bills:"bill reminders",goals:"goals",categories:"categories",preferences:"workspace preferences","merchant-rules":"merchant rules",providers:"service providers","import-history":"import history",imports:"statement imports","csv-imports":"CSV imports","bill-payments":"bill payments","goal-contributions":"goal allocations",search:"search results",export:"export file","auth/me":"session details","auth/login":"sign-in","auth/setup":"owner setup","auth/logout":"sign-out"};
  const label = labels[endpoint] ?? labels[endpoint.split("/")[0]] ?? "workspace records";
  if (status >= 500) return `Luna could not ${method === "GET" ? "load" : "process"} ${label} because the server encountered a problem. Try again shortly.${method !== "GET" ? " Check the records before retrying; the result is not confirmed." : ""}`;
  if (status === 401) return "Your session has ended. Sign in again to continue.";
  const payload = body && typeof body === "object" ? body as Record<string, unknown> : {};
  for (const candidate of [payload.statusMessage, payload.statusText, payload.message]) {
    const message = clearMessage(candidate);
    if (message) return message;
  }
  if (status === 403) return "Luna could not verify your access. Reload the page and sign in again before retrying.";
  if (status === 413) return "This submission is too large. Import files must be no larger than 2 MB; shorten other entered text.";
  if (status === 429) return endpoint === "auth/login" ? explanations["Too many attempts. Try again later"] : "Too many requests. Wait a moment before trying again.";
  if (status === 408) return `Luna took too long to respond.${method === "GET" ? " Try again shortly." : " The result is not confirmed. Check the records before retrying to avoid duplicates."}`;
  if (status === 404) return `Luna could not find the requested ${label}. Reload the page and choose an existing record.`;
  if (status === 409) return "This action conflicts with an existing record. Reload the records and review them before trying again.";
  if (status === 400 || status === 422) return endpoint === "auth/login" ? "Luna could not sign you in. Check your username and password, then try again." : `Luna could not ${method === "GET" ? "load" : "save"} ${label}. Check the entered values and selections, then try again.`;
  return "Luna could not complete this action. Reload the page and try again.";
}

export function networkMessage(method = "GET"): string {
  return `Cannot reach Luna. Check your connection and that the Luna server is running.${method === "GET" ? " Then try again." : " The result is not confirmed. Check the records before retrying to avoid duplicates."}`;
}
