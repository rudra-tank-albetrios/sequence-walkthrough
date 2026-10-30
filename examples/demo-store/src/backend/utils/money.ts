// Util: money is handled in minor units (paise for INR) so sums never drift.

export interface PricedLine {
  unitPrice: number;
  quantity: number;
}

const SYMBOLS: Record<string, string> = { INR: '₹', USD: '$', EUR: '€', GBP: '£' };

/** Turns a major-unit amount such as 12.5 into minor units (1250). */
export function toMinorUnits(amount: number): number {
  return Math.round(amount * 100);
}

/** Formats minor units for display: formatMoney(129900, 'INR') is "₹1299.00". */
export function formatMoney(minor: number, currency: string): string {
  const symbol = SYMBOLS[currency] ?? `${currency} `;
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(minor);
  return `${sign}${symbol}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/** Adds up unitPrice × quantity over the lines, in minor units. */
export function sumLines(lines: readonly PricedLine[]): number {
  return lines.reduce((total, line) => total + line.unitPrice * line.quantity, 0);
}
