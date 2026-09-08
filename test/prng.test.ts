import { describe, it, expect } from "vitest";
import { PRNG } from "../src/core/prng";

describe("PRNG (Mulberry32)", () => {
  it("generates deterministic pseudo-random sequence for identical seeds", () => {
    const prng1 = new PRNG(42);
    const prng2 = new PRNG(42);

    for (let i = 0; i < 50; i++) {
      expect(prng1.next()).toBe(prng2.next());
    }
  });

  it("produces different sequences for distinct seeds", () => {
    const prng1 = new PRNG(42);
    const prng2 = new PRNG(999);

    const s1 = Array.from({ length: 10 }, () => prng1.next());
    const s2 = Array.from({ length: 10 }, () => prng2.next());
    expect(s1).not.toEqual(s2);
  });

  it("generates values strictly in [0, 1)", () => {
    const prng = new PRNG(12345);
    for (let i = 0; i < 1000; i++) {
      const v = prng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("generates integers within specified inclusive range", () => {
    const prng = new PRNG(777);
    for (let i = 0; i < 100; i++) {
      const v = prng.rangeInt(5, 15);
      expect(v).toBeGreaterThanOrEqual(5);
      expect(v).toBeLessThanOrEqual(15);
      expect(Number.isInteger(v)).toBe(true);
    }
  });
});
