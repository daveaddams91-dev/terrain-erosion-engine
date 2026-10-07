import { describe, it, expect, vi } from "vitest";
import { ErosionManager } from "../src/erosion/erosion-manager";
import { Heightmap } from "../src/core/heightmap";

describe("ErosionManager", () => {
  const mockDropletParams = {
    iterationsPerStep: 100,
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

  const mockThermalParams = {
    iterationsPerStep: 2,
    talusAngle: 30,
    erosionRate: 0.5,
    spatiallyVarying: false,
    bedrockTalusAngle: 45,
    sedimentTalusAngle: 25
  };

  const mockShallowWaterParams = {
    rainRate: 0.01,
    evaporationRate: 0.01,
    pipeArea: 0.5,
    gravity: 9.81,
    friction: 0.01,
    sedimentCapacityFactor: 1.0,
    dissolvingRate: 0.1,
    depositionRate: 0.1,
    spatiallyVarying: false
  };

  it("initializes with CPU method as default", async () => {
    const manager = new ErosionManager(32, 1234);
    expect(manager.method).toBe("droplet");
    expect(manager.backend).toBe("cpu"); // Note: checkWebGpu sets to webgpu if available, but mock environment won't have it
  });

  it("resets statistics and convergence history", () => {
    const manager = new ErosionManager(32);
    const map = new Heightmap(32);
    map.data[0] = 50; // Add some mass
    manager.resetStats(map);

    const telemetry = manager.getTelemetry(map, 10);
    expect(telemetry.totalIterations).toBe(0);
    expect(telemetry.totalDroplets).toBe(0);
    expect(telemetry.convergenceRate).toBe(0);
  });

  it("performs a single direct droplet step (no interleave)", async () => {
    const manager = new ErosionManager(16, 42);
    const map = new Heightmap(16);
    map.generate({
      resolution: 16,
      seed: 42,
      scale: 1,
      octaves: 1,
      persistence: 0.5,
      lacunarity: 2.0,
      heightScale: 10.0,
      power: 1.0,
      noiseType: "simplex",
      domainWarpStrength: 0,
      domainWarpScale: 1
    });

    manager.resetStats(map);

    const res = await manager.step(
      map,
      mockDropletParams,
      mockThermalParams,
      mockShallowWaterParams,
      { enabled: false, hydraulicSteps: 1, thermalSteps: 1 }
    );

    expect(res.stepTimeMs).toBeGreaterThanOrEqual(0);
    expect(res.deltaChange).toBeGreaterThanOrEqual(0);
    expect(manager.getConvergenceHistory().length).toBe(1);

    const telemetry = manager.getTelemetry(map, res.stepTimeMs);
    expect(telemetry.totalIterations).toBe(1);
    expect(telemetry.totalDroplets).toBe(100);
  });

  it("performs interleaved hydraulic and thermal steps", async () => {
    const manager = new ErosionManager(16, 42);
    const map = new Heightmap(16);

    manager.resetStats(map);

    const spyThermal = vi.spyOn(manager.thermal, 'simulate');
    const spyHydraulic = vi.spyOn(manager.dropletCpu, 'simulate');

    await manager.step(
      map,
      mockDropletParams,
      mockThermalParams,
      mockShallowWaterParams,
      { enabled: true, hydraulicSteps: 2, thermalSteps: 3 }
    );

    expect(spyHydraulic).toHaveBeenCalledTimes(2);
    expect(spyThermal).toHaveBeenCalledTimes(3);

    const telemetry = manager.getTelemetry(map, 50);
    expect(telemetry.totalIterations).toBe(1);
  });

  it("performs shallow water simulation step", async () => {
    const manager = new ErosionManager(16, 42);
    const map = new Heightmap(16);
    manager.method = "shallow-water";
    manager.resetStats(map);

    const spyShallow = vi.spyOn(manager.shallowWater, 'simulateStep');

    await manager.step(
      map,
      mockDropletParams,
      mockThermalParams,
      mockShallowWaterParams,
      { enabled: false, hydraulicSteps: 1, thermalSteps: 1 }
    );

    expect(spyShallow).toHaveBeenCalledTimes(1);
    const telemetry = manager.getTelemetry(map, 10);
    expect(telemetry.totalIterations).toBe(1);
    expect(telemetry.backend).toContain("shallow-water");
  });

  it("updates resolution correctly", () => {
    const manager = new ErosionManager(16);
    expect(manager.shallowWater.resolution).toBe(16);
    manager.setResolution(32);
    expect(manager.shallowWater.resolution).toBe(32);
  });
});
