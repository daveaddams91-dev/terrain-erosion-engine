import { NoiseGenerator } from "./noise";
import type { TerrainConfig } from "./types";

/**
 * 2D Heightmap grid storing floating-point elevations and offering
 * continuous bilinear interpolation, analytical gradient calculation,
 * normals, and statistical tracking.
 */
export class Heightmap {
  public readonly resolution: number;
  public readonly data: Float32Array;
  public readonly initialData: Float32Array;
  private readonly noiseGen: NoiseGenerator;

  constructor(resolution: number = 512) {
    this.resolution = resolution;
    const totalCells = resolution * resolution;
    this.data = new Float32Array(totalCells);
    this.initialData = new Float32Array(totalCells);
    this.noiseGen = new NoiseGenerator();
  }

  /**
   * Generates procedural base terrain using configured fractal noise.
   */
  public generate(config: TerrainConfig): void {
    this.noiseGen.reseed(config.seed);
    const res = this.resolution;
    const invRes = 1.0 / (res - 1);

    for (let y = 0; y < res; y++) {
      const v = y * invRes;
      const rowOffset = y * res;
      for (let x = 0; x < res; x++) {
        const u = x * invRes;
        const elevation = this.noiseGen.sampleTerrain(u, v, config);
        this.data[rowOffset + x] = elevation;
        this.initialData[rowOffset + x] = elevation;
      }
    }
  }

  /**
   * Resets the current heightmap back to its pre-erosion state.
   */
  public resetToInitial(): void {
    this.data.set(this.initialData);
  }

  /**
   * Sets the initial snapshot to the current state (e.g. after manual editing or re-basing).
   */
  public snapshot(): void {
    this.initialData.set(this.data);
  }

  /**
   * Direct cell access (clamped bounds).
   */
  public get(x: number, y: number): number {
    const cx = Math.max(0, Math.min(this.resolution - 1, x | 0));
    const cy = Math.max(0, Math.min(this.resolution - 1, y | 0));
    return this.data[cy * this.resolution + cx];
  }

  /**
   * Direct cell assignment (clamped bounds).
   */
  public set(x: number, y: number, value: number): void {
    const cx = Math.max(0, Math.min(this.resolution - 1, x | 0));
    const cy = Math.max(0, Math.min(this.resolution - 1, y | 0));
    this.data[cy * this.resolution + cx] = value;
  }

  /**
   * Continuous bilinear interpolation for fractional grid coordinates.
   */
  public sampleBilinear(x: number, y: number): number {
    const res = this.resolution;
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const x1 = Math.min(res - 1, x0 + 1);
    const y1 = Math.min(res - 1, y0 + 1);

    const fx = x - x0;
    const fy = y - y0;

    const cx0 = Math.max(0, Math.min(res - 1, x0));
    const cy0 = Math.max(0, Math.min(res - 1, y0));

    const h00 = this.data[cy0 * res + cx0];
    const h10 = this.data[cy0 * res + x1];
    const h01 = this.data[y1 * res + cx0];
    const h11 = this.data[y1 * res + x1];

    const h0 = h00 + (h10 - h00) * fx;
    const h1 = h01 + (h11 - h01) * fx;
    return h0 + (h1 - h0) * fy;
  }

  /**
   * Computes surface gradient (dh/dx, dh/dy) using central difference.
   */
  public calculateGradient(x: number, y: number): { gx: number; gy: number; height: number } {
    const res = this.resolution;
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;

    const cx0 = Math.max(0, Math.min(res - 1, x0));
    const cy0 = Math.max(0, Math.min(res - 1, y0));
    const cx1 = Math.min(res - 1, cx0 + 1);
    const cy1 = Math.min(res - 1, cy0 + 1);

    const h00 = this.data[cy0 * res + cx0];
    const h10 = this.data[cy0 * res + cx1];
    const h01 = this.data[cy1 * res + cx0];
    const h11 = this.data[cy1 * res + cx1];

    // Gradients along X and Y axes
    const gx = (h10 - h00) * (1 - fy) + (h11 - h01) * fy;
    const gy = (h01 - h00) * (1 - fx) + (h11 - h10) * fx;
    const height = (h00 * (1 - fx) + h10 * fx) * (1 - fy) + (h01 * (1 - fx) + h11 * fx) * fy;

    return { gx, gy, height };
  }

  /**
   * Computes total terrain volume / mass (sum of all height values).
   */
  public calculateTotalMass(): number {
    let sum = 0;
    const total = this.data.length;
    for (let i = 0; i < total; i++) {
      sum += this.data[i];
    }
    return sum;
  }

  /**
   * Computes total difference between initial heightmap and current heightmap.
   */
  public calculateDiffStats(): {
    totalRemoved: number;
    totalDeposited: number;
    maxErosion: number;
    maxDeposition: number;
  } {
    let totalRemoved = 0;
    let totalDeposited = 0;
    let maxErosion = 0;
    let maxDeposition = 0;

    const total = this.data.length;
    for (let i = 0; i < total; i++) {
      const delta = this.data[i] - this.initialData[i];
      if (delta < 0) {
        const removed = -delta;
        totalRemoved += removed;
        if (removed > maxErosion) maxErosion = removed;
      } else {
        totalDeposited += delta;
        if (delta > maxDeposition) maxDeposition = delta;
      }
    }

    return { totalRemoved, totalDeposited, maxErosion, maxDeposition };
  }

  /**
   * Min, max, and average elevation.
   */
  public getElevationRange(): { min: number; max: number; avg: number } {
    let min = Infinity;
    let max = -Infinity;
    let sum = 0;
    const len = this.data.length;
    for (let i = 0; i < len; i++) {
      const v = this.data[i];
      if (v < min) min = v;
      if (v > max) max = v;
      sum += v;
    }
    return { min, max, avg: sum / len };
  }

  /**
   * Exports height data normalized into [0, 1] range.
   */
  public getNormalizedData(): Float32Array {
    const { min, max } = this.getElevationRange();
    const range = Math.max(1e-6, max - min);
    const out = new Float32Array(this.data.length);
    for (let i = 0; i < this.data.length; i++) {
      out[i] = (this.data[i] - min) / range;
    }
    return out;
  }

  /**
   * Creates a deep clone of this heightmap.
   */
  public clone(): Heightmap {
    const copy = new Heightmap(this.resolution);
    copy.data.set(this.data);
    copy.initialData.set(this.initialData);
    return copy;
  }
}
