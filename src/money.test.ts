import { describe, expect, it } from "vitest";
import { allocate, applyRate, formatCents, formatRate, parseDollars, parsePercent } from "./money";

describe("parseDollars", () => {
  it("reads a dollar amount as cents", () => {
    expect(parseDollars("12")).toBe(1200);
    expect(parseDollars("12.5")).toBe(1250);
    expect(parseDollars("12.50")).toBe(1250);
    expect(parseDollars("$0.01")).toBe(1);
    expect(parseDollars(" .5 ")).toBe(50);
    expect(parseDollars("0")).toBe(0);
  });

  it("rejects amounts that aren't cents", () => {
    expect(parseDollars("")).toBeNull();
    expect(parseDollars("12.")).toBeNull();
    expect(parseDollars("12.999")).toBeNull();
    expect(parseDollars("1.2.3")).toBeNull();
    expect(parseDollars("ten")).toBeNull();
  });
});

describe("parsePercent", () => {
  it("keeps four decimal places", () => {
    expect(parsePercent("20")).toBe(200_000);
    expect(parsePercent("8.875")).toBe(88_750);
    expect(parsePercent("8.8750")).toBe(88_750);
    expect(parsePercent("20.5%")).toBe(205_000);
    expect(parsePercent("0.0001")).toBe(1);
    expect(parsePercent("100")).toBe(1_000_000);
  });

  it("rejects anything past 100% or past four decimals", () => {
    expect(parsePercent("100.0001")).toBeNull();
    expect(parsePercent("8.87555")).toBeNull();
    expect(parsePercent("")).toBeNull();
    expect(parsePercent("8.875% extra")).toBeNull();
  });
});

describe("formatters", () => {
  it("formats cents and rates", () => {
    expect(formatCents(0)).toBe("$0.00");
    expect(formatCents(1)).toBe("$0.01");
    expect(formatCents(1299)).toBe("$12.99");
    expect(formatCents(-5)).toBe("-$0.05");
    expect(formatRate(200_000)).toBe("20%");
    expect(formatRate(88_750)).toBe("8.875%");
    expect(formatRate(205_000)).toBe("20.5%");
    expect(formatRate(1)).toBe("0.0001%");
  });
});

describe("applyRate", () => {
  it("rounds half a cent up, once", () => {
    expect(applyRate(1000, 88_750)).toBe(89);
    expect(applyRate(3000, 88_750)).toBe(266);
    expect(applyRate(50, 10_000)).toBe(1);
    expect(applyRate(1, 50_000)).toBe(0);
    expect(applyRate(0, 200_000)).toBe(0);
  });
});

describe("allocate", () => {
  it("gives leftover cents to the largest fractions", () => {
    expect(allocate(10, [1, 2])).toEqual([3, 7]);
    expect(allocate(5, [1, 1, 1])).toEqual([2, 2, 1]);
    expect(allocate(1, [1, 1, 1])).toEqual([1, 0, 0]);
    expect(allocate(100, [0, 0])).toEqual([0, 0]);
    expect(allocate(40, [])).toEqual([]);
  });

  it("always sums back to the total", () => {
    const weights = [1, 2, 3, 5, 0, 8];
    for (let total = 0; total < 50; total++) {
      const shares = allocate(total, weights);
      expect(shares.reduce((sum, share) => sum + share, 0)).toBe(total);
      expect(shares[4]).toBe(0);
    }
  });
});
