import { describe, expect, it } from "vitest";
import { decodeHash, emptyState, encodeHash, takeId, toBill, type State } from "./state";

function sample(): State {
  let state = emptyState();
  let id: string;
  ({ id, state } = takeId(state));
  state.people.push({ id, name: 'Ada "O\'Brien"' });
  ({ id, state } = takeId(state));
  state.people.push({ id, name: "Bea" });
  ({ id, state } = takeId(state));
  state.items.push({ id, name: "Crème brûlée", price: "12.5", who: ["1", "2"] });
  state.taxMode = "percent";
  state.tax = "8.875";
  state.tip = "18";
  state.tipBase = "post-tax";
  return state;
}

describe("hash", () => {
  it("leaves the hash empty when the bill is blank", () => {
    expect(encodeHash(emptyState())).toBe("");
    expect(decodeHash("")).toEqual(emptyState());
    expect(decodeHash("#")).toEqual(emptyState());
  });

  it("round-trips a bill, encoded or already decoded", () => {
    const state = sample();
    state.people[0].name = "100%";
    const hash = encodeHash(state);
    expect(decodeHash(hash)).toEqual(state);
    expect(decodeHash("#" + decodeURIComponent(hash.slice(1)))).toEqual(state);
  });

  it("ignores a hash it doesn't understand", () => {
    expect(decodeHash("#nope")).toEqual(emptyState());
    expect(decodeHash("#" + encodeURIComponent(JSON.stringify({ v: 2 })))).toEqual(emptyState());
    expect(decodeHash("#%")).toEqual(emptyState());
  });

  it("drops duplicate ids and people who aren't on the bill", () => {
    const hash =
      "#" +
      encodeURIComponent(
        JSON.stringify({
          v: 1,
          n: 1,
          people: [
            ["a", "Ada"],
            ["a", "Again"],
            ["b", "Bea"],
          ],
          items: [["i", "Fries", "4", ["a", "a", "ghost", "b"]]],
          taxMode: "amount",
          tax: "1.10",
          tip: "",
          tipBase: "pre-tax",
        }),
      );
    const state = decodeHash(hash);
    expect(state.people.map((person) => person.name)).toEqual(["Ada", "Bea"]);
    expect(state.items[0].who).toEqual(["a", "b"]);
    expect(state.nextId).toBeGreaterThan(Number.parseInt("i", 36));
  });
});

describe("toBill", () => {
  it("turns typed amounts into cents and leaves junk at zero", () => {
    const state = sample();
    state.taxMode = "amount";
    state.tax = "1.25";
    state.items[0].price = "nope";
    const parsed = toBill(state);
    expect(parsed.items[0].cents).toBe(0);
    expect(parsed.taxValue).toBe(125);
    expect(parsed.tipRate).toBe(180_000);
    expect(parsed.tipBase).toBe("post-tax");
  });
});
