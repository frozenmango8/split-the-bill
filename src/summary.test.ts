import { describe, expect, it } from "vitest";
import { splitBill } from "./split";
import { emptyState, toBill, type State } from "./state";
import { summaryText } from "./summary";

describe("summaryText", () => {
  it("lists items and what each person owes", () => {
    const state: State = {
      ...emptyState(),
      people: [
        { id: "a", name: "Ada" },
        { id: "b", name: "Bea" },
      ],
      items: [
        { id: "1", name: "Steak", price: "20", who: ["a"] },
        { id: "2", name: "Salad", price: "10", who: ["b"] },
        { id: "3", name: "Cake", price: "7", who: [] },
      ],
      taxMode: "amount",
      tax: "3",
      tip: "18",
      tipBase: "pre-tax",
    };
    const text = summaryText(state, splitBill(toBill(state)));
    expect(text).toBe(
      [
        "Steak  $20.00  Ada",
        "Salad  $10.00  Bea",
        "Cake  $7.00  unassigned",
        "",
        "Subtotal  $30.00",
        "Tax  $3.00",
        "Tip 18% before tax  $5.40",
        "Not split yet  $7.00",
        "Total  $38.40",
        "",
        "Ada  $25.60",
        "Bea  $12.80",
      ].join("\n"),
    );
  });
});
