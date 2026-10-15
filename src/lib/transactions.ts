export const TRANSACTION_TYPES = ["expense", "installment", "income", "refund", "transfer", "opening", "adjustment"] as const;

export function transactionTypeLabel(kind: string): string {
 return kind === "installment" ? "Installments" : kind.charAt(0).toUpperCase() + kind.slice(1);
}

type TransactionText = {description?: string; merchant?: string; notes?: string};

export function transactionType(row: TransactionText & {kind: string; is_installment?: number | null}): string {
 if (row.kind !== "expense" || row.is_installment === 0) return row.kind;
 if (row.is_installment === 1) return "installment";
 const text = `${row.description ?? ""} ${row.merchant ?? ""} ${row.notes ?? ""}`;
 const numbered = /\((\d{1,3})\/(\d{1,3})\)/.exec(text)
  ?? /\binstal(?:l)?ments?\s+(\d{1,3})\s+of\s+(\d{1,3})\b/i.exec(text);
 return numbered && Number(numbered[1]) > 0 && Number(numbered[1]) <= Number(numbered[2]) ? "installment" : row.kind;
}

export function transactionText(row: TransactionText, sources: Record<string, string>[]): {description: string; merchant: string} {
 const description = row.description ?? "", merchant = row.merchant ?? "";
 const statementMerchant = !merchant && sources.some(raw => Object.prototype.hasOwnProperty.call(raw, "postDate") && raw.description === description);
 return statementMerchant ? {description: "", merchant: description} : {description, merchant};
}
