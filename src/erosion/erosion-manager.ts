import { Heightmap } from "../core/heightmap";
import { DropletErosionCPU } from "./droplet-cpu";
import { DropletErosionGPU } from "./droplet-gpu";
import { ThermalErosion } from "./thermal-erosion";
import { ShallowWaterErosion } from "./shallow-water-erosion";
import type {
  DropletErosionParams,
  ThermalErosionParams,
  ShallowWaterErosionParams,
  InterleaveConfig,
  ErosionMethod,
  ComputeBackend,
  TelemetryData
} from "../core/types";

export class ErosionManager {
  public dropletCpu: DropletErosionCPU;
  public dropletGpu: DropletErosionGPU;
  public thermal: ThermalErosion;
  public shallowWater: ShallowWaterErosion;

  public method: ErosionMethod = "droplet";
  public backend: ComputeBackend = "cpu";
  public hasWebGpu = false;

  private totalIterations = 0;
  private totalDropletsSimulated = 0;
  private convergenceHistory: number[] = [];
  private initialMass = 0;

  constructor(resolution = 512, seed = 1337) {
    this.dropletCpu = new DropletErosionCPU(seed);
    this.dropletGpu = new DropletErosionGPU();
    this.thermal = new ThermalErosion();
    this.shallowWater = new ShallowWaterErosion(resolution);

    this.checkWebGpu();
  }

  private async checkWebGpu(): Promise<void> {
    this.hasWebGpu = await this.dropletGpu.isAvailable();
    if (this.hasWebGpu) {
      this.backend = "webgpu";
    }
  }

  public setResolution(res: number): void {
    if (this.shallowWater.resolution !== res) {
      this.shallowWater = new ShallowWaterErosion(res);
    }
  }

  public resetStats(heightmap: Heightmap): void {
    this.totalIterations = 0;
    this.totalDropletsSimulated = 0;
    this.convergenceHistory = [];
    this.initialMass = heightmap.calculateTotalMass();
    this.dropletCpu.resetDiagnostics();
    this.shallowWater.reset();
  }

  /**
   * Executes one coordinated simulation step based on current method and interleaving config.
   */
  public async step(
    heightmap: Heightmap,
    dropletParams: DropletErosionParams,
    thermalParams: ThermalErosionParams,
    shallowParams: ShallowWaterErosionParams,
    interleave: InterleaveConfig
  ): Promise<{ stepTimeMs: number; deltaChange: number }> {
    const t0 = performance.now();
    let deltaSum = 0;

    const runHydraulic = async () => {
      if (this.method === "droplet") {
        if (this.backend === "webgpu" && this.hasWebGpu) {
          const success = await this.dropletGpu.simulate(
            heightmap,
            dropletParams,
            this.totalIterations
          );
          if (success) {
            deltaSum += dropletParams.iterationsPerStep * 0.05;
            this.totalDropletsSimulated += dropletParams.iterationsPerStep;
            return;
          }
        }
        // CPU fallback or selected
        const res = this.dropletCpu.simulate(heightmap, dropletParams);
        deltaSum += res.terrainDeltaSum;
        this.totalDropletsSimulated += res.dropletCount;
      } else {
        // Grid-based shallow water
        const res = this.shallowWater.simulateStep(heightmap, shallowParams);
        deltaSum += res.deltaMass;
      }
    };

    const runThermal = () => {
      const res = this.thermal.simulate(heightmap, thermalParams, 1.0, false);
      deltaSum += res.volumeMoved;
    };

    if (interleave.enabled) {
      // Interleaved pass execution
      for (let h = 0; h < interleave.hydraulicSteps; h++) {
        await runHydraulic();
      }
      for (let t = 0; t < interleave.thermalSteps; t++) {
        runThermal();
      }
    } else {
      // Direct hydraulic step
      await runHydraulic();
    }

    this.totalIterations++;
    const stepTimeMs = performance.now() - t0;

    // Track convergence (running average of terrain delta)
    this.convergenceHistory.push(deltaSum);
    if (this.convergenceHistory.length > 60) {
      this.convergenceHistory.shift();
    }

    return { stepTimeMs, deltaChange: deltaSum };
  }

  public getTelemetry(heightmap: Heightmap, stepTimeMs: number): TelemetryData {
    const currentMass = heightmap.calculateTotalMass();
    const massDelta = currentMass - this.initialMass;

    let avgConvergence = 0;
    if (this.convergenceHistory.length > 0) {
      avgConvergence =
        this.convergenceHistory.reduce((a, b) => a + b, 0) / this.convergenceHistory.length;
    }

    let activeWaterVolume = 0;
    let totalSedimentSuspended = 0;
    if (this.method === "shallow-water") {
      for (let i = 0; i < this.shallowWater.water.length; i++) {
        activeWaterVolume += this.shallowWater.water[i];
        totalSedimentSuspended += this.shallowWater.sediment[i];
      }
    }

    return {
      fps: stepTimeMs > 0 ? Math.min(120, 1000 / stepTimeMs) : 60,
      stepTimeMs,
      stepsPerSec: stepTimeMs > 0 ? 1000 / stepTimeMs : 0,
      totalIterations: this.totalIterations,
      totalDroplets: this.totalDropletsSimulated,
      activeWaterVolume,
      totalSedimentSuspended,
      totalTerrainChange: Math.abs(massDelta),
      convergenceRate: avgConvergence,
      massBalanceError: Math.abs(massDelta),
      resolution: heightmap.resolution,
      backend: `${this.backend.toUpperCase()} (${this.method})`
    };
  }

  public getConvergenceHistory(): number[] {
    return [...this.convergenceHistory];
  }
}
