import { allocate, applyRate } from "./money";

export type TaxMode = "amount" | "percent";
export type TipBase = "pre-tax" | "post-tax";

export type Bill = {
  people: { id: string; name: string }[];
  items: { id: string; name: string; cents: number; sharedBy: string[] }[];
  taxMode: TaxMode;
  /** Cents when taxMode is "amount"; rate units (1_000_000 = 100%) when "percent". */
  taxValue: number;
  /** Rate units, 1_000_000 = 100%. */
  tipRate: number;
  tipBase: TipBase;
};

export type PersonShare = {
  id: string;
  name: string;
  food: number;
  tax: number;
  tip: number;
  total: number;
};

export type Split = {
  people: PersonShare[];
  subtotal: number;
  unassigned: number;
  tax: number;
  tip: number;
  total: number;
};

export function splitBill(bill: Bill): Split {
  const food = new Map(bill.people.map((person) => [person.id, 0]));
  let subtotal = 0;
  let unassigned = 0;
  // How many leftover cents have already been handed out. Each item starts
  // one seat further along so the same person doesn't get the extra every time.
  let cursor = 0;

  for (const item of bill.items) {
    if (!Number.isInteger(item.cents) || item.cents < 0) {
      throw new Error("item price must be a non-negative integer number of cents");
    }
    const who = bill.people.filter((person) => item.sharedBy.includes(person.id));
    if (who.length === 0) {
      unassigned += item.cents;
      continue;
    }
    const parts = divideEvenly(item.cents, who.length, cursor);
    cursor += item.cents % who.length;
    who.forEach((person, i) => food.set(person.id, (food.get(person.id) ?? 0) + parts[i]));
    subtotal += item.cents;
  }

  const foodWeights = bill.people.map((person) => food.get(person.id) ?? 0);
  const hasFood = foodWeights.some((weight) => weight > 0);
  // A tax with no food yet is split evenly, so the rows still add up.
  const weights = hasFood ? foodWeights : bill.people.map(() => 1);

  const tax =
    bill.taxMode === "amount"
      ? mustBeCents(bill.taxValue, "tax")
      : applyRate(subtotal, mustBeCents(bill.taxValue, "tax rate"));
  const tipBase = bill.tipBase === "post-tax" ? subtotal + tax : subtotal;
  const tip = applyRate(tipBase, mustBeCents(bill.tipRate, "tip"));

  const taxShares = allocate(tax, weights);
  const tipShares = allocate(tip, weights);
  const people = bill.people.map((person, i) => {
    const shareFood = foodWeights[i];
    const shareTax = taxShares[i];
    const shareTip = tipShares[i];
    return {
      id: person.id,
      name: person.name,
      food: shareFood,
      tax: shareTax,
      tip: shareTip,
      total: shareFood + shareTax + shareTip,
    };
  });

  return { people, subtotal, unassigned, tax, tip, total: subtotal + tax + tip };
}

function divideEvenly(total: number, count: number, rotate: number): number[] {
  const base = Math.floor(total / count);
  const extra = total % count;
  const start = rotate % count;
  const parts = Array<number>(count).fill(base);
  for (let i = 0; i < extra; i++) parts[(start + i) % count]++;
  return parts;
}

function mustBeCents(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
  return value;
}
