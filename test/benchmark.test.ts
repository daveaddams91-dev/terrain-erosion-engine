import { describe, it, expect } from "vitest";
import { Heightmap } from "../src/core/heightmap";
import { DropletErosionCPU } from "../src/erosion/droplet-cpu";
import type { TerrainConfig, DropletErosionParams } from "../src/core/types";

describe("Droplet Erosion Benchmark & Verification", () => {
  it("executes 10,000 droplets on 256x256 map and measures convergence and throughput", () => {
    const terrainConfig: TerrainConfig = {
      resolution: 256,
      seed: 1234,
      scale: 3.0,
      octaves: 5,
      persistence: 0.5,
      lacunarity: 2.0,
      heightScale: 80.0,
      power: 1.2,
      noiseType: "simplex",
      domainWarpStrength: 0.1,
      domainWarpScale: 1.0
    };

    const map = new Heightmap(256);
    map.generate(terrainConfig);

    const dropletParams: DropletErosionParams = {
      iterationsPerStep: 10000,
      maxLifetime: 35,
      inertia: 0.15,
      sedimentCapacityFactor: 4.0,
      minSedimentCapacity: 0.01,
      depositSpeed: 0.3,
      erodeSpeed: 0.3,
      evaporateSpeed: 0.02,
      gravity: 9.81,
      erosionRadius: 3,
      initialWater: 1.0,
      initialVelocity: 0.0,
      minSlope: 0.01
    };

    const erosion = new DropletErosionCPU(42);

    const t0 = performance.now();
    const result = erosion.simulate(map, dropletParams);
    const elapsedMs = performance.now() - t0;

    const dropletsPerSec = (dropletParams.iterationsPerStep / (elapsedMs / 1000.0));
    console.log(`[Benchmark] 10,000 droplets on 256x256: ${elapsedMs.toFixed(1)} ms (${dropletsPerSec.toFixed(0)} droplets/sec)`);

    expect(result.dropletCount).toBe(10000);
    expect(result.terrainDeltaSum).toBeGreaterThan(0);

    const diff = map.calculateDiffStats();
    expect(diff.totalRemoved).toBeGreaterThan(100);
    expect(diff.totalDeposited).toBeGreaterThan(100);
  });
});
