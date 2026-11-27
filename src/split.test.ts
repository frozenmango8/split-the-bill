import { describe, expect, it } from "vitest";
import { splitBill, type Bill } from "./split";

function bill(overrides: Partial<Bill> & Pick<Bill, "people" | "items">): Bill {
  return {
    taxMode: "percent",
    taxValue: 0,
    tipRate: 0,
    tipBase: "pre-tax",
    ...overrides,
  };
}

describe("splitBill", () => {
  it("splits a shared item and walks the extra cent around the table", () => {
    const people = [
      { id: "a", name: "Ada" },
      { id: "b", name: "Bea" },
      { id: "c", name: "Cal" },
    ];
    const items = [0, 1, 2].map((n) => ({
      id: String(n),
      name: "Dish",
      cents: 100,
      sharedBy: ["a", "b", "c"],
    }));
    const result = splitBill(bill({ people, items }));
    expect(result.people.map((person) => person.food)).toEqual([100, 100, 100]);
    expect(result.subtotal).toBe(300);
    expect(result.people.reduce((sum, person) => sum + person.total, 0)).toBe(result.total);
  });

  it("rounds tax once, then splits those cents", () => {
    // 8.875% of $30.00 is $2.6625 → $2.66, not 3 × round($0.8875).
    const people = ["a", "b", "c"].map((id) => ({ id, name: id }));
    const items = people.map((person) => ({
      id: person.id,
      name: "Plate",
      cents: 1000,
      sharedBy: [person.id],
    }));
    const result = splitBill(
      bill({
        people,
        items,
        taxMode: "percent",
        taxValue: 88_750,
        tipRate: 200_000,
        tipBase: "post-tax",
      }),
    );
    expect(result.tax).toBe(266);
    expect(result.tip).toBe(653);
    expect(result.people.map((person) => person.tax)).toEqual([89, 89, 88]);
    expect(result.people.map((person) => person.tip)).toEqual([218, 218, 217]);
    expect(result.people.map((person) => person.total)).toEqual([1307, 1307, 1305]);
    expect(result.total).toBe(3919);
  });

  it("weights a fixed tax and a pre-tax tip by what each person ate", () => {
    const result = splitBill(
      bill({
        people: [
          { id: "a", name: "Ada" },
          { id: "b", name: "Bea" },
        ],
        items: [
          { id: "1", name: "Steak", cents: 2000, sharedBy: ["a"] },
          { id: "2", name: "Salad", cents: 1000, sharedBy: ["b"] },
        ],
        taxMode: "amount",
        taxValue: 300,
        tipRate: 180_000,
        tipBase: "pre-tax",
      }),
    );
    expect(result.people.map((person) => [person.food, person.tax, person.tip, person.total])).toEqual([
      [2000, 200, 360, 2560],
      [1000, 100, 180, 1280],
    ]);
    expect(result.total).toBe(3840);
  });

  it("leaves an item out until someone is tapped", () => {
    const result = splitBill(
      bill({
        people: [{ id: "a", name: "Ada" }],
        items: [
          { id: "1", name: "Soup", cents: 500, sharedBy: ["a"] },
          { id: "2", name: "Cake", cents: 700, sharedBy: [] },
          { id: "3", name: "Ghost", cents: 100, sharedBy: ["nope"] },
        ],
      }),
    );
    expect(result.subtotal).toBe(500);
    expect(result.unassigned).toBe(800);
    expect(result.people[0].food).toBe(500);
  });

  it("counts a person once even if the item lists them twice", () => {
    const result = splitBill(
      bill({
        people: [
          { id: "a", name: "Ada" },
          { id: "b", name: "Bea" },
        ],
        items: [{ id: "1", name: "Fries", cents: 100, sharedBy: ["a", "a", "b"] }],
      }),
    );
    expect(result.people.map((person) => person.food)).toEqual([50, 50]);
  });

  it("splits a tax evenly when nobody has food yet", () => {
    const result = splitBill(
      bill({
        people: [
          { id: "a", name: "Ada" },
          { id: "b", name: "Bea" },
        ],
        items: [],
        taxMode: "amount",
        taxValue: 501,
        tipRate: 0,
      }),
    );
    expect(result.people.map((person) => person.total)).toEqual([251, 250]);
    expect(result.people.reduce((sum, person) => sum + person.total, 0)).toBe(result.total);
  });

  it("rejects a negative price", () => {
    expect(() =>
      splitBill(
        bill({
          people: [{ id: "a", name: "Ada" }],
          items: [{ id: "1", name: "Oops", cents: -1, sharedBy: ["a"] }],
        }),
      ),
    ).toThrow(/cents/);
  });

  it("keeps random checks exact", () => {
    let seed = 1;
    const next = () => (seed = (Math.imul(1664525, seed) + 1013904223) >>> 0);

    for (let n = 0; n < 200; n++) {
      const people = ["a", "b", "c", "d"].slice(0, 1 + (next() % 4)).map((id) => ({ id, name: id }));
      const itemCount = 1 + (next() % 6);
      const items = [];
      for (let i = 0; i < itemCount; i++) {
        const sharedBy = people.filter(() => next() % 2 === 0).map((person) => person.id);
        items.push({ id: String(i), name: "x", cents: next() % 8000, sharedBy });
      }
      const taxMode = next() % 2 === 0 ? ("amount" as const) : ("percent" as const);
      const result = splitBill({
        people,
        items,
        taxMode,
        taxValue: taxMode === "amount" ? next() % 5000 : next() % 200_000,
        tipRate: next() % 300_000,
        tipBase: next() % 2 === 0 ? "pre-tax" : "post-tax",
      });
      const itemSum = items.reduce((sum, item) => sum + item.cents, 0);
      expect(result.subtotal + result.unassigned).toBe(itemSum);
      expect(result.total).toBe(result.subtotal + result.tax + result.tip);
      expect(result.people.reduce((sum, person) => sum + person.food, 0)).toBe(result.subtotal);
      expect(result.people.reduce((sum, person) => sum + person.tax, 0)).toBe(result.tax);
      expect(result.people.reduce((sum, person) => sum + person.tip, 0)).toBe(result.tip);
      expect(result.people.reduce((sum, person) => sum + person.total, 0)).toBe(result.total);
    }
  });
});
