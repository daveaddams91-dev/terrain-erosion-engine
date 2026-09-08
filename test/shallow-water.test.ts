import { describe, it, expect } from "vitest";
import { Heightmap } from "../src/core/heightmap";
import { ShallowWaterErosion } from "../src/erosion/shallow-water-erosion";
import type { ShallowWaterErosionParams } from "../src/core/types";

describe("ShallowWaterErosion (Mei/Decaudin/Hu Pipe Model)", () => {
  const defaultParams: ShallowWaterErosionParams = {
    timeStep: 0.05,
    pipeArea: 0.5,
    pipeLength: 1.0,
    gravity: 9.81,
    rainRate: 0.02,
    evaporationRate: 0.01,
    sedimentCapacityFactor: 1.5,
    dissolvingRate: 0.1,
    depositionRate: 0.1,
    minTiltAngle: 0.01,
    maxSedimentVelocity: 10.0
  };

  it("water accelerates downhill and accumulates in valleys", () => {
    const res = 32;
    const map = new Heightmap(res);
    // V-shaped valley sloping down toward the right
    for (let y = 0; y < res; y++) {
      for (let x = 0; x < res; x++) {
        const vValley = Math.abs(y - res / 2) * 2.0;
        const xSlope = (res - x) * 1.5;
        map.set(x, y, vValley + xSlope);
      }
    }

    const sim = new ShallowWaterErosion(res);

    // Simulate 20 steps of shallow water fluid flow
    for (let step = 0; step < 20; step++) {
      sim.simulateStep(map, defaultParams);
    }

    // Check that water volume is strictly positive
    let totalWater = 0;
    for (let i = 0; i < sim.water.length; i++) {
      totalWater += sim.water[i];
    }
    expect(totalWater).toBeGreaterThan(0);

    // Downstream / low cells (x close to res - 1) should have water
    const downstreamWater = sim.water[Math.floor(res / 2) * res + (res - 2)];
    expect(downstreamWater).toBeGreaterThan(0);
  });

  it("erodes high-velocity channels and creates suspended sediment", () => {
    const res = 32;
    const map = new Heightmap(res);
    for (let y = 0; y < res; y++) {
      for (let x = 0; x < res; x++) {
        map.set(x, y, 40 - x); // Constant slope
      }
    }
    map.snapshot();

    const sim = new ShallowWaterErosion(res);
    for (let step = 0; step < 30; step++) {
      sim.simulateStep(map, defaultParams);
    }

    expect(sim.totalErodedBedrock).toBeGreaterThan(0);
  });
});
