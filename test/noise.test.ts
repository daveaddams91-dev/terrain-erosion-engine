import { describe, it, expect } from "vitest";
import { NoiseGenerator } from "../src/core/noise";
import { Heightmap } from "../src/core/heightmap";
import type { TerrainConfig } from "../src/core/types";

describe("NoiseGenerator & Heightmap", () => {
  it("simplex2D produces bounded values in [-1, 1]", () => {
    const gen = new NoiseGenerator(101);
    for (let x = 0; x < 20; x++) {
      for (let y = 0; y < 20; y++) {
        const val = gen.simplex2D(x * 0.1, y * 0.1);
        expect(val).toBeGreaterThanOrEqual(-1.01);
        expect(val).toBeLessThanOrEqual(1.01);
      }
    }
  });

  it("heightmap generation is 100% reproducible with identical seed and params", () => {
    const config: TerrainConfig = {
      resolution: 64,
      seed: 42,
      scale: 3.5,
      octaves: 4,
      persistence: 0.5,
      lacunarity: 2.0,
      heightScale: 100.0,
      power: 1.2,
      noiseType: "simplex",
      domainWarpStrength: 0.2,
      domainWarpScale: 1.0
    };

    const map1 = new Heightmap(64);
    map1.generate(config);

    const map2 = new Heightmap(64);
    map2.generate(config);

    expect(map1.data.length).toBe(64 * 64);
    for (let i = 0; i < map1.data.length; i++) {
      expect(map1.data[i]).toBe(map2.data[i]);
    }
  });

  it("bilinear interpolation samples smoothly across cell boundaries", () => {
    const map = new Heightmap(16);
    map.set(2, 2, 10.0);
    map.set(3, 2, 20.0);
    map.set(2, 3, 10.0);
    map.set(3, 3, 20.0);

    const mid = map.sampleBilinear(2.5, 2.5);
    expect(mid).toBeCloseTo(15.0, 4);
  });

  it("gradient calculation correctly reflects slope direction", () => {
    const map = new Heightmap(16);
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        map.set(x, y, x * 2.0); // Constant slope in +x
      }
    }

    const { gx, gy } = map.calculateGradient(4.5, 4.5);
    expect(gx).toBeCloseTo(2.0, 3);
    expect(gy).toBeCloseTo(0.0, 3);
  });
});
