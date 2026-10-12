/** Money helpers. Amounts are integer centavos everywhere outside of input boxes. */

/** Change this to switch the currency symbol across the whole app. */
export const CURRENCY_SYMBOL = "₱";

/** ₱100,000,000,000.00 — must match MAX_AMOUNT in src-tauri/src/money.rs. */
export const MAX_CENTAVOS = 10_000_000_000_000;

function groupThousands(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** 123450 -> "₱1,234.50" */
export function formatMoney(centavos: number): string {
  const sign = centavos < 0 ? "-" : "";
  const abs = Math.abs(Math.trunc(centavos));
  const whole = Math.floor(abs / 100);
  const cents = abs % 100;
  return `${sign}${CURRENCY_SYMBOL}${groupThousands(whole)}.${String(cents).padStart(2, "0")}`;
}

/** 123450 -> "1234.50" (for prefilling input boxes) */
export function centavosToInput(centavos: number): string {
  const abs = Math.abs(Math.trunc(centavos));
  const sign = centavos < 0 ? "-" : "";
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/**
 * Parse a peso string ("1,234.5", "₱12") into centavos without floating-point math.
 * Returns null when invalid or with more than two decimals.
 */
export function parsePesos(input: string): number | null {
  const cleaned = input.trim().replace(CURRENCY_SYMBOL, "").replace(/[,\s]/g, "");
  if (!/^(\d+(\.\d{0,2})?|\.\d{1,2})$/.test(cleaned)) return null;
  const [whole = "", frac = ""] = cleaned.split(".");
  const centavos = Number(whole || "0") * 100 + Number(frac.padEnd(2, "0") || "0");
  return Number.isSafeInteger(centavos) ? centavos : null;
}
