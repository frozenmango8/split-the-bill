/** 1_000_000 = 100%. A percent keeps four decimal places: 8.875% is 88750. */
export const RATE_SCALE = 1_000_000;

const DOLLAR = /^(?:(\d{1,7})|(\d{0,7})\.(\d{1,2}))$/;
const PERCENT = /^(\d{1,3})(?:\.(\d{1,4}))?$/;

export function parseDollars(raw: string): number | null {
  const s = raw.trim().replace(/^\$/, "").trim();
  const match = DOLLAR.exec(s);
  if (!match) return null;
  const dollars = Number(match[1] ?? (match[2] === "" ? 0 : match[2]));
  const cents = match[3] ? Number(match[3].padEnd(2, "0")) : 0;
  const total = dollars * 100 + cents;
  return Number.isSafeInteger(total) ? total : null;
}

export function parsePercent(raw: string): number | null {
  const match = PERCENT.exec(raw.trim().replace(/%$/, "").trim());
  if (!match) return null;
  const frac = Number((match[2] ?? "").padEnd(4, "0"));
  const rate = Number(match[1]) * 10_000 + frac;
  if (!Number.isSafeInteger(rate) || rate > RATE_SCALE) return null;
  return rate;
}

export function formatCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}$${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

export function formatRate(rate: number): string {
  const whole = Math.floor(rate / 10_000);
  const frac = String(rate % 10_000)
    .padStart(4, "0")
    .replace(/0+$/, "");
  return frac ? `${whole}.${frac}%` : `${whole}%`;
}

// Half-up, in integer cents. BigInt so a rate like 8.875% can't fall on the
// wrong side of a half cent the way a float division sometimes does.
export function applyRate(amount: number, rate: number): number {
  if (!Number.isInteger(amount) || !Number.isInteger(rate) || amount < 0 || rate < 0) {
    throw new Error("amount and rate must be non-negative integers");
  }
  if (amount === 0 || rate === 0) return 0;
  const prod = BigInt(amount) * BigInt(rate);
  const scale = BigInt(RATE_SCALE);
  return Number((prod + scale / 2n) / scale);
}

// Largest remainder. Extra cents go to the biggest fractions, ties to the
// earlier index, so the shares add up to `total`.
export function allocate(total: number, weights: readonly number[]): number[] {
  if (!Number.isInteger(total) || total < 0) {
    throw new Error("total must be a non-negative integer");
  }
  const n = weights.length;
  if (n === 0 || total === 0) return Array(n).fill(0);

  let weightSum = 0;
  for (const weight of weights) {
    if (!Number.isInteger(weight) || weight < 0) {
      throw new Error("weights must be non-negative integers");
    }
    weightSum += weight;
  }
  if (weightSum === 0) return Array(n).fill(0);

  const totalInt = BigInt(total);
  const weightInt = BigInt(weightSum);
  const shares = new Array<number>(n);
  const remainders = new Array<bigint>(n);
  let used = 0;
  for (let i = 0; i < n; i++) {
    const prod = totalInt * BigInt(weights[i]);
    shares[i] = Number(prod / weightInt);
    remainders[i] = prod % weightInt;
    used += shares[i];
  }

  const order = weights.map((_, i) => i).sort((a, b) => {
    const diff = remainders[b] - remainders[a];
    if (diff > 0n) return 1;
    if (diff < 0n) return -1;
    return a - b;
  });
  const leftover = total - used;
  for (let i = 0; i < leftover; i++) shares[order[i]]++;
  return shares;
}
