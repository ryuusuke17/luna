import directory from "@/data/philippines_cards_directory_2026.md?raw";

export type CardType = "credit" | "debit" | "ewallet";
export type CardProduct = { issuer: string; product: string; network: string; status: string };

const sections: Record<CardType, string> = {
  credit: "## 1. Credit cards",
  debit: "## 2. Debit cards",
  ewallet: "## 3. E-wallet cards",
};

function readProducts(type: CardType): CardProduct[] {
  const start = directory.indexOf(sections[type]);
  const end = directory.indexOf("\n## ", start + sections[type].length);
  const content = directory.slice(start, end < 0 ? undefined : end);
  return content.split("\n").filter(line => line.startsWith("| ") && !line.includes("Provider / Issuer") && !line.includes("---"))
    .map(line => line.split("|").slice(1, -1).map(cell => cell.trim()))
    .filter(cells => cells.length >= 7 && cells[0] && cells[1])
    .map(cells => ({ issuer: cells[0], product: cells[1], network: cells[2], status: cells[4] }));
}

export const cardProducts: Record<CardType, CardProduct[]> = {
  credit: readProducts("credit"),
  debit: readProducts("debit"),
  ewallet: readProducts("ewallet"),
};

export const cardNetworks = ["Visa", "Mastercard", "American Express", "JCB", "UnionPay", "Diners Club", "BancNet", "Other / not specified"];
export const ewalletProviders = [...new Set(cardProducts.ewallet.map(item => item.issuer))];
