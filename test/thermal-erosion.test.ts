import { describe, it, expect } from "vitest";
import { Heightmap } from "../src/core/heightmap";
import { ThermalErosion } from "../src/erosion/thermal-erosion";
import type { ThermalErosionParams } from "../src/core/types";

describe("ThermalErosion (Talus Angle & Scree Slumping)", () => {
  const defaultParams: ThermalErosionParams = {
    iterationsPerStep: 10,
    talusAngle: 35, // tan(35 deg) ~= 0.700
    erosionRate: 0.5,
    spatiallyVarying: false,
    bedrockTalusAngle: 45,
    sedimentTalusAngle: 28
  };

  it("strictly conserves total terrain mass across slumping steps", () => {
    const res = 32;
    const map = new Heightmap(res);
    // Create an unnatural vertical cliff / step function
    for (let y = 0; y < res; y++) {
      for (let x = 0; x < res; x++) {
        map.set(x, y, x < res / 2 ? 80.0 : 10.0);
      }
    }
    map.snapshot();

    const initialMass = map.calculateTotalMass();
    const thermal = new ThermalErosion();
    thermal.simulate(map, defaultParams, 1.0, false);

    const finalMass = map.calculateTotalMass();
    // Sum of all heights should remain identical
    expect(finalMass).toBeCloseTo(initialMass, 2);
    expect(thermal.totalSlumpedVolume).toBeGreaterThan(0);
  });

  it("relaxes over-steepened slopes toward the angle of repose", () => {
    const res = 32;
    const map = new Heightmap(res);
    // Single isolated spike of height 100 on a flat plane
    for (let y = 0; y < res; y++) {
      for (let x = 0; x < res; x++) {
        map.set(x, y, (x === 16 && y === 16) ? 100.0 : 0.0);
      }
    }

    const thermal = new ThermalErosion();
    // Run several relaxation iterations
    thermal.simulate(map, { ...defaultParams, iterationsPerStep: 25 }, 1.0, false);

    // Peak height has slumped down and surrounding cells have accumulated scree
    const peakHeight = map.get(16, 16);
    expect(peakHeight).toBeLessThan(100.0);

    const neighborH = map.get(16, 17);
    expect(neighborH).toBeGreaterThan(0.0);

    // Height difference between peak and neighbor should have dramatically decreased
    const slopeDiff = peakHeight - neighborH;
    expect(slopeDiff).toBeLessThan(50.0);
  });
});
