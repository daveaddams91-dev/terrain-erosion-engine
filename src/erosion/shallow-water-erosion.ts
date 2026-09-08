import { Heightmap } from "../core/heightmap";
import type { ShallowWaterErosionParams } from "../core/types";

/**
 * Grid-Based Shallow Water Erosion Engine (Mei, Decaudin & Hu 2007 virtual pipe model).
 * Simulates real fluid depth, virtual pipe hydrostatic flow, velocity fields,
 * stream power sediment erosion/deposition, and semi-Lagrangian sediment advection.
 */
export class ShallowWaterErosion {
  public resolution: number;
  public readonly water: Float32Array;
  public readonly sediment: Float32Array;
  public readonly flux: Float32Array;     // 4 floats per cell: L, R, T, B
  public readonly velocity: Float32Array; // 2 floats per cell: Vx, Vy

  // Temporary buffer for semi-Lagrangian advection
  private readonly sedimentTemp: Float32Array;

  // Mass conservation diagnostics
  public totalErodedBedrock = 0;
  public totalDepositedSediment = 0;

  constructor(resolution = 512) {
    this.resolution = resolution;
    const total = resolution * resolution;
    this.water = new Float32Array(total);
    this.sediment = new Float32Array(total);
    this.sedimentTemp = new Float32Array(total);
    this.flux = new Float32Array(total * 4);
    this.velocity = new Float32Array(total * 2);
  }

  public reset(): void {
    this.water.fill(0);
    this.sediment.fill(0);
    this.sedimentTemp.fill(0);
    this.flux.fill(0);
    this.velocity.fill(0);
    this.totalErodedBedrock = 0;
    this.totalDepositedSediment = 0;
  }

  /**
   * Performs one time-step of the Eulerian shallow water simulation.
   */
  public simulateStep(
    heightmap: Heightmap,
    params: ShallowWaterErosionParams
  ): { deltaMass: number; activeWaterVolume: number; totalSuspended: number } {
    return this.simulateCPU(heightmap, params);
  }

  /**
   * High-precision CPU simulation of the Mei/Decaudin/Hu pipeline.
   */
  public simulateCPU(
    heightmap: Heightmap,
    params: ShallowWaterErosionParams
  ): { deltaMass: number; activeWaterVolume: number; totalSuspended: number } {
    const res = this.resolution;
    const b = heightmap.data;
    const w = this.water;
    const s = this.sediment;
    const f = this.flux;
    const v = this.velocity;
    const dt = params.timeStep;
    const l = params.pipeLength;
    const A = params.pipeArea;
    const g = params.gravity;
    const cellArea = l * l;

    let activeWaterVolume = 0;
    let totalSuspended = 0;
    let terrainDeltaSum = 0;

    // STEP 1: Rain Influx & Outflow Flux via virtual pipes
    const flowAccelFactor = dt * A * (g / l);

    for (let y = 0; y < res; y++) {
      const row = y * res;
      for (let x = 0; x < res; x++) {
        const idx = row + x;

        // Add rain
        w[idx] += params.rainRate * dt;
        const hTotal = b[idx] + w[idx];

        // Neighbors: Left, Right, Top, Bottom
        const hL = x > 0 ? b[idx - 1] + w[idx - 1] : hTotal;
        const hR = x < res - 1 ? b[idx + 1] + w[idx + 1] : hTotal;
        const hT = y > 0 ? b[idx - res] + w[idx - res] : hTotal;
        const hB = y < res - 1 ? b[idx + res] + w[idx + res] : hTotal;

        const fIdx = idx * 4;
        let fL = Math.max(0, f[fIdx + 0] + flowAccelFactor * (hTotal - hL));
        let fR = Math.max(0, f[fIdx + 1] + flowAccelFactor * (hTotal - hR));
        let fT = Math.max(0, f[fIdx + 2] + flowAccelFactor * (hTotal - hT));
        let fB = Math.max(0, f[fIdx + 3] + flowAccelFactor * (hTotal - hB));

        // Boundary clamps
        if (x === 0) fL = 0;
        if (x === res - 1) fR = 0;
        if (y === 0) fT = 0;
        if (y === res - 1) fB = 0;

        const sumF = fL + fR + fT + fB;
        if (sumF > 0) {
          const maxOutflow = (w[idx] * cellArea) / dt;
          const k = Math.min(1.0, maxOutflow / sumF);
          fL *= k;
          fR *= k;
          fT *= k;
          fB *= k;
        }

        f[fIdx + 0] = fL;
        f[fIdx + 1] = fR;
        f[fIdx + 2] = fT;
        f[fIdx + 3] = fB;
      }
    }

    // STEP 2: Water surface update & velocity vector field calculation
    for (let y = 0; y < res; y++) {
      const row = y * res;
      for (let x = 0; x < res; x++) {
        const idx = row + x;
        const fIdx = idx * 4;

        const fOutL = f[fIdx + 0];
        const fOutR = f[fIdx + 1];
        const fOutT = f[fIdx + 2];
        const fOutB = f[fIdx + 3];
        const sumOut = fOutL + fOutR + fOutT + fOutB;

        // Inflow from neighbors
        const fInL = x > 0 ? f[(idx - 1) * 4 + 1] : 0;
        const fInR = x < res - 1 ? f[(idx + 1) * 4 + 0] : 0;
        const fInT = y > 0 ? f[(idx - res) * 4 + 3] : 0;
        const fInB = y < res - 1 ? f[(idx + res) * 4 + 2] : 0;
        const sumIn = fInL + fInR + fInT + fInB;

        const dV = dt * (sumIn - sumOut);
        const wOld = w[idx];
        const wNew = Math.max(0, wOld + dV / cellArea);
        w[idx] = wNew;
        activeWaterVolume += wNew;

        // Calculate average flow velocity
        const avgW = Math.max(0.001, (wOld + wNew) * 0.5);
        const dWx = (fInL - fOutL + fOutR - fInR) * 0.5;
        const dWy = (fInT - fOutT + fOutB - fInB) * 0.5;

        const vx = dWx / (avgW * l);
        const vy = dWy / (avgW * l);

        const vIdx = idx * 2;
        v[vIdx + 0] = vx;
        v[vIdx + 1] = vy;
      }
    }

    // STEP 3: Erosion and Deposition based on stream power capacity
    for (let y = 0; y < res; y++) {
      const row = y * res;
      for (let x = 0; x < res; x++) {
        const idx = row + x;
        const vIdx = idx * 2;
        const vx = v[vIdx + 0];
        const vy = v[vIdx + 1];
        const speed = Math.sqrt(vx * vx + vy * vy);

        // Local slope
        const bL = x > 0 ? b[idx - 1] : b[idx];
        const bR = x < res - 1 ? b[idx + 1] : b[idx];
        const bT = y > 0 ? b[idx - res] : b[idx];
        const bB = y < res - 1 ? b[idx + res] : b[idx];

        const dh_dx = (bR - bL) / (2.0 * l);
        const dh_dy = (bB - bT) / (2.0 * l);
        const slopeGrad = Math.sqrt(dh_dx * dh_dx + dh_dy * dh_dy);
        const sinTilt = slopeGrad / Math.sqrt(1.0 + slopeGrad * slopeGrad);
        const effectiveSlope = Math.max(params.minTiltAngle, sinTilt);

        // Transport capacity C = Kc * |v| * sin(tilt)
        const capacity = params.sedimentCapacityFactor * speed * effectiveSlope;
        const curSed = s[idx];

        if (curSed < capacity) {
          // Dissolve bedrock into sediment
          const dissolve = params.dissolvingRate * (capacity - curSed);
          b[idx] -= dissolve;
          s[idx] += dissolve;
          this.totalErodedBedrock += dissolve;
          terrainDeltaSum += dissolve;
        } else {
          // Precipitate suspended sediment onto bedrock
          const deposit = params.depositionRate * (curSed - capacity);
          b[idx] += deposit;
          s[idx] -= deposit;
          this.totalDepositedSediment += deposit;
          terrainDeltaSum += deposit;
        }

        // Evaporation
        w[idx] = Math.max(0, w[idx] * (1.0 - params.evaporationRate * dt));
        totalSuspended += s[idx];
      }
    }

    // STEP 4: Semi-Lagrangian Sediment Advection
    for (let y = 0; y < res; y++) {
      const row = y * res;
      for (let x = 0; x < res; x++) {
        const idx = row + x;
        const vIdx = idx * 2;
        const vx = v[vIdx + 0];
        const vy = v[vIdx + 1];

        // Backtrack along velocity vector
        const prevX = Math.max(0, Math.min(res - 1, x - vx * dt));
        const prevY = Math.max(0, Math.min(res - 1, y - vy * dt));

        const x0 = Math.floor(prevX);
        const y0 = Math.floor(prevY);
        const x1 = Math.min(res - 1, x0 + 1);
        const y1 = Math.min(res - 1, y0 + 1);
        const fx = prevX - x0;
        const fy = prevY - y0;

        const s00 = s[y0 * res + x0];
        const s10 = s[y0 * res + x1];
        const s01 = s[y1 * res + x0];
        const s11 = s[y1 * res + x1];

        const sInterp = (s00 * (1 - fx) + s10 * fx) * (1 - fy) + (s01 * (1 - fx) + s11 * fx) * fy;
        this.sedimentTemp[idx] = sInterp;
      }
    }

    s.set(this.sedimentTemp);

    return {
      deltaMass: terrainDeltaSum,
      activeWaterVolume,
      totalSuspended
    };
  }
}
