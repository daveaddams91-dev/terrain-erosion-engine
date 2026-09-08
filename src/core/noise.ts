import { PRNG } from "./prng";
import type { NoiseType, TerrainConfig } from "./types";

/**
 * 2D Simplex and Perlin Noise generator with seedable permutation table,
 * multi-octave fractal Brownian motion (fBm), ridge noise, billow noise,
 * and domain warping.
 */
export class NoiseGenerator {
  private perm: Uint8Array = new Uint8Array(512);
  private permMod12: Uint8Array = new Uint8Array(512);

  // Gradient vectors for 2D simplex noise
  private static readonly GRAD2 = [
    [1, 1], [-1, 1], [1, -1], [-1, -1],
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [-1, 1], [1, -1], [-1, -1]
  ];

  // Skewing and unskewing factors for 2D Simplex
  private static readonly F2 = 0.5 * (Math.sqrt(3.0) - 1.0);
  private static readonly G2 = (3.0 - Math.sqrt(3.0)) / 6.0;

  constructor(seed: number = 42) {
    this.reseed(seed);
  }

  public reseed(seed: number): void {
    const prng = new PRNG(seed);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
      p[i] = i;
    }
    // Fisher-Yates shuffle
    for (let i = 255; i > 0; i--) {
      const j = prng.rangeInt(0, i);
      const temp = p[i];
      p[i] = p[j];
      p[j] = temp;
    }
    for (let i = 0; i < 512; i++) {
      this.perm[i] = p[i & 255];
      this.permMod12[i] = this.perm[i] % 12;
    }
  }

  /**
   * 2D Simplex Noise in range [-1, 1].
   */
  public simplex2D(xin: number, yin: number): number {
    let n0 = 0;
    let n1 = 0;
    let n2 = 0;

    // Skew the input space to determine which simplex cell we're in
    const s = (xin + yin) * NoiseGenerator.F2;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);

    // Unskew cell origin back to (x, y) space
    const t = (i + j) * NoiseGenerator.G2;
    const X0 = i - t;
    const Y0 = j - t;
    const x0 = xin - X0; // The x,y distances from the cell origin
    const y0 = yin - Y0;

    // For the 2D case, the simplex shape is an equilateral triangle.
    // Determine which simplex we are in.
    let i1 = 0;
    let j1 = 0;
    if (x0 > y0) {
      i1 = 1;
      j1 = 0;
    } else {
      i1 = 0;
      j1 = 1;
    }

    // Offsets for middle and last corners
    const x1 = x0 - i1 + NoiseGenerator.G2;
    const y1 = y0 - j1 + NoiseGenerator.G2;
    const x2 = x0 - 1.0 + 2.0 * NoiseGenerator.G2;
    const y2 = y0 - 1.0 + 2.0 * NoiseGenerator.G2;

    // Work out the hashed gradient indices of the three simplex corners
    const ii = i & 255;
    const jj = j & 255;
    const gi0 = this.permMod12[ii + this.perm[jj]];
    const gi1 = this.permMod12[ii + i1 + this.perm[jj + j1]];
    const gi2 = this.permMod12[ii + 1 + this.perm[jj + 1]];

    // Calculate the contribution from the three corners
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 >= 0) {
      t0 *= t0;
      const g0 = NoiseGenerator.GRAD2[gi0];
      n0 = t0 * t0 * (g0[0] * x0 + g0[1] * y0);
    }

    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 >= 0) {
      t1 *= t1;
      const g1 = NoiseGenerator.GRAD2[gi1];
      n1 = t1 * t1 * (g1[0] * x1 + g1[1] * y1);
    }

    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 >= 0) {
      t2 *= t2;
      const g2 = NoiseGenerator.GRAD2[gi2];
      n2 = t2 * t2 * (g2[0] * x2 + g2[1] * y2);
    }

    // Add contributions from each corner to get the final noise value.
    // The result is scaled to stay strictly within [-1, 1].
    return 70.0 * (n0 + n1 + n2);
  }

  /**
   * Classical Perlin 2D noise in range [-1, 1].
   */
  public perlin2D(x: number, y: number): number {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);

    const u = this.fade(xf);
    const v = this.fade(yf);

    const aa = this.perm[X + this.perm[Y]];
    const ab = this.perm[X + this.perm[Y + 1]];
    const ba = this.perm[X + 1 + this.perm[Y]];
    const bb = this.perm[X + 1 + this.perm[Y + 1]];

    const g00 = NoiseGenerator.GRAD2[aa % 12];
    const g10 = NoiseGenerator.GRAD2[ba % 12];
    const g01 = NoiseGenerator.GRAD2[ab % 12];
    const g11 = NoiseGenerator.GRAD2[bb % 12];

    const d00 = g00[0] * xf + g00[1] * yf;
    const d10 = g10[0] * (xf - 1) + g10[1] * yf;
    const d01 = g01[0] * xf + g01[1] * (yf - 1);
    const d11 = g11[0] * (xf - 1) + g11[1] * (yf - 1);

    const nx0 = this.lerp(d00, d10, u);
    const nx1 = this.lerp(d01, d11, u);

    return this.lerp(nx0, nx1, v);
  }

  private fade(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  private lerp(a: number, b: number, t: number): number {
    return a + t * (b - a);
  }

  /**
   * Multi-octave fractal noise based on configuration.
   */
  public fractal2D(
    x: number,
    y: number,
    octaves: number,
    persistence: number,
    lacunarity: number,
    type: NoiseType = "simplex"
  ): number {
    let total = 0;
    let frequency = 1;
    let amplitude = 1;
    let maxValue = 0; // Used for normalizing result

    for (let i = 0; i < octaves; i++) {
      let n = 0;
      const nx = x * frequency;
      const ny = y * frequency;

      if (type === "perlin") {
        n = this.perlin2D(nx, ny);
      } else if (type === "ridge") {
        // Inverted absolute noise gives sharp ridges
        const raw = Math.abs(this.simplex2D(nx, ny));
        n = 1.0 - raw;
        n = n * n; // Sharpen crests
        n = n * 2.0 - 1.0;
      } else if (type === "billow") {
        // Absolute noise gives billowy / rounded puffy hills
        n = Math.abs(this.simplex2D(nx, ny)) * 2.0 - 1.0;
      } else {
        n = this.simplex2D(nx, ny);
      }

      total += n * amplitude;
      maxValue += amplitude;
      amplitude *= persistence;
      frequency *= lacunarity;
    }

    return total / maxValue;
  }

  /**
   * Evaluates terrain height at normalized [0, 1] UV coordinates.
   * Applies domain warping, multi-octave noise, and redistribution power.
   */
  public sampleTerrain(u: number, v: number, config: TerrainConfig): number {
    let px = u * config.scale;
    let py = v * config.scale;

    // Optional domain warping for natural meandering curves
    if (config.domainWarpStrength > 0) {
      const warpX = this.simplex2D(
        px * config.domainWarpScale + 5.2,
        py * config.domainWarpScale + 1.3
      );
      const warpY = this.simplex2D(
        px * config.domainWarpScale + 8.7,
        py * config.domainWarpScale + 9.1
      );
      px += warpX * config.domainWarpStrength;
      py += warpY * config.domainWarpStrength;
    }

    // Normalized noise value in [-1, 1]
    const raw = this.fractal2D(
      px,
      py,
      config.octaves,
      config.persistence,
      config.lacunarity,
      config.noiseType
    );

    // Remap to [0, 1]
    let h = (raw + 1.0) * 0.5;

    // Apply redistribution power to sharpen peaks and flatten valleys
    if (config.power !== 1.0) {
      h = Math.pow(Math.max(0.0, Math.min(1.0, h)), config.power);
    }

    return h * config.heightScale;
  }
}
