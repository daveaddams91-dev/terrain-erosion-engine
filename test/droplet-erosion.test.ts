import { describe, it, expect } from "vitest";
import { Heightmap } from "../src/core/heightmap";
import { DropletErosionCPU } from "../src/erosion/droplet-cpu";
import type { DropletErosionParams } from "../src/core/types";

describe("DropletErosionCPU", () => {
  const defaultParams: DropletErosionParams = {
    iterationsPerStep: 500,
    maxLifetime: 30,
    inertia: 0.1,
    sedimentCapacityFactor: 4.0,
    minSedimentCapacity: 0.01,
    depositSpeed: 0.3,
    erodeSpeed: 0.3,
    evaporateSpeed: 0.02,
    gravity: 9.81,
    erosionRadius: 2,
    initialWater: 1.0,
    initialVelocity: 0.0,
    minSlope: 0.01
  };

  it("carves valleys into a sloped terrain", () => {
    const res = 32;
    const map = new Heightmap(res);
    // Create a smooth cone/pyramid peak at center
    for (let y = 0; y < res; y++) {
      for (let x = 0; x < res; x++) {
        const dx = x - res / 2;
        const dy = y - res / 2;
        const dist = Math.sqrt(dx * dx + dy * dy);
        map.set(x, y, Math.max(0, 50 - dist * 2.5));
      }
    }
    map.snapshot();

    const initialMass = map.calculateTotalMass();
    const erosion = new DropletErosionCPU(42);
    const result = erosion.simulate(map, defaultParams);

    expect(result.dropletCount).toBe(500);
    expect(result.terrainDeltaSum).toBeGreaterThan(0);

    const diff = map.calculateDiffStats();
    expect(diff.totalRemoved).toBeGreaterThan(0);
    expect(diff.maxErosion).toBeGreaterThan(0);

    // Bedrock mass change matches eroded mass minus deposited mass
    const finalMass = map.calculateTotalMass();
    const netBedrockLoss = initialMass - finalMass;
    const netSedimentProduced = erosion.totalErodedMass - erosion.totalDepositedMass;
    expect(netBedrockLoss).toBeCloseTo(netSedimentProduced, 1);
  });

  it("conserves mass within numerical limits (eroded = deposited + carried off)", () => {
    const res = 32;
    const map = new Heightmap(res);
    for (let y = 0; y < res; y++) {
      for (let x = 0; x < res; x++) {
        map.set(x, y, 20 + Math.sin(x * 0.2) * 5 + Math.cos(y * 0.2) * 5);
      }
    }
    map.snapshot();

    const erosion = new DropletErosionCPU(99);
    erosion.simulate(map, { ...defaultParams, iterationsPerStep: 300 });

    const netBedrockLoss = map.calculateTotalMass() - map.calculateTotalMass();
    expect(erosion.totalErodedMass).toBeGreaterThan(0);
    expect(erosion.totalDepositedMass + erosion.sedimentCarriedOffGrid).toBeCloseTo(
      erosion.totalErodedMass,
      0
    );
  });
});
