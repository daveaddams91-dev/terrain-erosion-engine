import { describe, it, expect } from "vitest";
import { Heightmap } from "../src/core/heightmap";

describe("Heightmap", () => {
  it("initializes with correct resolution and zeroed data", () => {
    const map = new Heightmap(128);
    expect(map.resolution).toBe(128);
    expect(map.data.length).toBe(128 * 128);
    expect(map.initialData.length).toBe(128 * 128);
    expect(map.data[0]).toBe(0);
  });

  it("sets and gets values correctly, clamping to bounds", () => {
    const map = new Heightmap(32);
    map.set(10, 10, 42.5);
    expect(map.get(10, 10)).toBe(42.5);

    // out of bounds clamping
    map.set(-1, -5, 10);
    expect(map.get(0, 0)).toBe(10);
    map.set(35, 40, 20);
    expect(map.get(31, 31)).toBe(20);
    expect(map.get(35, 40)).toBe(20);
  });

  it("snapshots and resets to initial data", () => {
    const map = new Heightmap(16);
    map.set(5, 5, 100);

    // initially initialData is 0, so resetToInitial should revert
    map.resetToInitial();
    expect(map.get(5, 5)).toBe(0);

    // set and snapshot
    map.set(5, 5, 100);
    map.snapshot();
    map.set(5, 5, 200);
    expect(map.get(5, 5)).toBe(200);
    map.resetToInitial();
    expect(map.get(5, 5)).toBe(100);
  });

  it("calculates total mass correctly", () => {
    const map = new Heightmap(4);
    for (let i = 0; i < 16; i++) {
      map.data[i] = 2;
    }
    expect(map.calculateTotalMass()).toBe(32);
  });

  it("calculates difference statistics", () => {
    const map = new Heightmap(4); // 16 cells
    for (let i = 0; i < 16; i++) {
      map.data[i] = 10;
    }
    map.snapshot(); // initialData is now all 10s

    // Remove 2 from 5 cells -> totalRemoved = 10, maxErosion = 2
    for (let i = 0; i < 5; i++) {
      map.data[i] -= 2;
    }
    // Add 3 to 4 cells -> totalDeposited = 12, maxDeposition = 3
    for (let i = 5; i < 9; i++) {
      map.data[i] += 3;
    }
    // Remaining 7 cells unchanged

    const stats = map.calculateDiffStats();
    expect(stats.totalRemoved).toBe(10);
    expect(stats.totalDeposited).toBe(12);
    expect(stats.maxErosion).toBe(2);
    expect(stats.maxDeposition).toBe(3);
  });

  it("computes elevation range and normalizes data", () => {
    const map = new Heightmap(4);
    map.set(0, 0, 10);
    map.set(1, 0, 50);
    map.set(2, 0, 30);
    // remaining are 0

    const range = map.getElevationRange();
    expect(range.min).toBe(0);
    expect(range.max).toBe(50);

    // (10 + 50 + 30) / 16 = 90 / 16 = 5.625
    expect(range.avg).toBeCloseTo(5.625);

    const norm = map.getNormalizedData();
    expect(norm[0]).toBeCloseTo(10 / 50);
    expect(norm[1]).toBeCloseTo(50 / 50);
    expect(norm[2]).toBeCloseTo(30 / 50);
    expect(norm[3]).toBe(0);
  });

  it("handles normalization with uniform height", () => {
    const map = new Heightmap(4);
    for (let i = 0; i < 16; i++) map.data[i] = 10;
    const norm = map.getNormalizedData();
    // if range is 0, it divides by 1e-6, so result should be 0s
    expect(norm[0]).toBe(0);
  });

  it("clones correctly", () => {
    const map = new Heightmap(16);
    map.set(2, 2, 99);
    map.snapshot();
    map.set(2, 2, 105);

    const cloned = map.clone();
    expect(cloned.resolution).toBe(16);
    expect(cloned.get(2, 2)).toBe(105);

    cloned.resetToInitial();
    expect(cloned.get(2, 2)).toBe(99);

    // ensure deep copy
    cloned.set(2, 2, 200);
    expect(map.get(2, 2)).toBe(105);
  });

  it("samples bilinear correctly", () => {
    const map = new Heightmap(4);
    map.set(0, 0, 0);
    map.set(1, 0, 10);
    map.set(0, 1, 20);
    map.set(1, 1, 30);

    expect(map.sampleBilinear(0, 0)).toBe(0);
    expect(map.sampleBilinear(1, 0)).toBe(10);
    expect(map.sampleBilinear(0.5, 0)).toBe(5);
    expect(map.sampleBilinear(0, 0.5)).toBe(10);
    expect(map.sampleBilinear(0.5, 0.5)).toBe(15);
  });

  it("calculates gradients correctly", () => {
    const map = new Heightmap(4);
    map.set(0, 0, 0);
    map.set(1, 0, 10);
    map.set(0, 1, 0);
    map.set(1, 1, 10);

    // gx = h10 - h00 = 10 - 0 = 10
    // gy = h01 - h00 = 0 - 0 = 0
    const grad = map.calculateGradient(0, 0);
    expect(grad.gx).toBe(10);
    expect(grad.gy).toBe(0);
    expect(grad.height).toBe(0);
  });
});
