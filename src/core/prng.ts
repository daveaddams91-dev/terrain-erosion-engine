/**
 * Deterministic, seedable pseudo-random number generator.
 * Uses Mulberry32: fast, excellent statistical properties for 32-bit state.
 */
export class PRNG {
  private state: number;
  private readonly initialSeed: number;

  constructor(seed: number = 1337) {
    this.initialSeed = Math.floor(seed);
    this.state = this.initialSeed;
    this.next(); // Warm up generator
  }

  /**
   * Reset PRNG back to its initial seed.
   */
  public reset(seed?: number): void {
    this.state = Math.floor(seed !== undefined ? seed : this.initialSeed);
    this.next();
  }

  /**
   * Get next 32-bit unsigned integer in [0, 2^32 - 1].
   */
  public nextInt(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  }

  /**
   * Returns a pseudo-random float in [0, 1).
   */
  public next(): number {
    return this.nextInt() / 4294967296;
  }

  /**
   * Returns float in [min, max).
   */
  public range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /**
   * Returns integer in [min, max].
   */
  public rangeInt(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  /**
   * Returns Gaussian / normally distributed float with mean and stdDev.
   * Uses Box-Muller transform.
   */
  public gaussian(mean = 0, stdDev = 1): number {
    const u1 = Math.max(1e-15, this.next());
    const u2 = this.next();
    const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    return mean + z0 * stdDev;
  }
}
