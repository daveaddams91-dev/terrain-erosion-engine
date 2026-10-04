import { Heightmap } from "../core/heightmap";
import { PRNG } from "../core/prng";
import type { DropletErosionParams } from "../core/types";

interface BrushCache {
  offsetsX: Int32Array[];
  offsetsY: Int32Array[];
  weights: Float32Array[];
}

/**
 * CPU Reference Implementation of Particle / Droplet-based Hydraulic Erosion.
 * Based on Hans Theobald Beyer's method with bilinear height/gradient sampling,
 * momentum/inertia physics, sediment capacity laws, and mass conservation tracking.
 */
export class DropletErosionCPU {
  private brushCache: BrushCache | null = null;
  private cachedRadius = -1;
  private cachedResolution = -1;
  private prng: PRNG;

  // Mass conservation diagnostics
  public totalErodedMass = 0;
  public totalDepositedMass = 0;
  public sedimentCarriedOffGrid = 0;

  constructor(seed = 1337) {
    this.prng = new PRNG(seed);
  }

  public reseed(seed: number): void {
    this.prng.reset(seed);
  }

  public resetDiagnostics(): void {
    this.totalErodedMass = 0;
    this.totalDepositedMass = 0;
    this.sedimentCarriedOffGrid = 0;
  }

  private initBrush(radius: number, resolution: number): void {
    if (this.brushCache && this.cachedRadius === radius && this.cachedResolution === resolution) {
      return;
    }

    const totalCells = resolution * resolution;
    const offsetsX: Int32Array[] = new Array(totalCells);
    const offsetsY: Int32Array[] = new Array(totalCells);
    const weights: Float32Array[] = new Array(totalCells);

    const rInt = Math.ceil(radius);

    for (let y = 0; y < resolution; y++) {
      for (let x = 0; x < resolution; x++) {
        const idx = y * resolution + x;
        const xList: number[] = [];
        const yList: number[] = [];
        const wList: number[] = [];
        let weightSum = 0;

        for (let dy = -rInt; dy <= rInt; dy++) {
          const cy = y + dy;
          if (cy < 0 || cy >= resolution) continue;

          for (let dx = -rInt; dx <= rInt; dx++) {
            const cx = x + dx;
            if (cx < 0 || cx >= resolution) continue;

            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist <= radius) {
              const weight = 1.0 - dist / radius;
              xList.push(cx);
              yList.push(cy);
              wList.push(weight);
              weightSum += weight;
            }
          }
        }

        const count = xList.length;
        const oX = new Int32Array(count);
        const oY = new Int32Array(count);
        const wA = new Float32Array(count);
        const invSum = weightSum > 0 ? 1.0 / weightSum : 1.0;

        for (let i = 0; i < count; i++) {
          oX[i] = xList[i];
          oY[i] = yList[i];
          wA[i] = wList[i] * invSum;
        }

        offsetsX[idx] = oX;
        offsetsY[idx] = oY;
        weights[idx] = wA;
      }
    }

    this.brushCache = { offsetsX, offsetsY, weights };
    this.cachedRadius = radius;
    this.cachedResolution = resolution;
  }

  public simulate(heightmap: Heightmap, params: DropletErosionParams): {
    dropletCount: number;
    terrainDeltaSum: number;
  } {
    const res = heightmap.resolution;
    const data = heightmap.data;
    const numDroplets = params.iterationsPerStep;

    this.initBrush(params.erosionRadius, res);
    const brush = this.brushCache!;

    let totalDelta = 0;

    for (let d = 0; d < numDroplets; d++) {
      let posX = this.prng.range(0, res - 1);
      let posY = this.prng.range(0, res - 1);
      let dirX = 0;
      let dirY = 0;
      let speed = params.initialVelocity;
      let water = params.initialWater;
      let sediment = 0;

      let lastIdx00 = 0;
      let lastIdx10 = 0;
      let lastIdx01 = 0;
      let lastIdx11 = 0;
      let lastCellOffsetX = 0;
      let lastCellOffsetY = 0;
      let exitedGrid = false;

      for (let step = 0; step < params.maxLifetime; step++) {
        const nodeX = posX | 0;
        const nodeY = posY | 0;
        const cellOffset = nodeY * res + nodeX;

        const cellOffsetX = posX - nodeX;
        const cellOffsetY = posY - nodeY;

        const idx00 = cellOffset;
        const idx10 = idx00 + 1;
        const idx01 = idx00 + res;
        const idx11 = idx00 + res + 1;

        lastIdx00 = idx00;
        lastIdx10 = idx10;
        lastIdx01 = idx01;
        lastIdx11 = idx11;
        lastCellOffsetX = cellOffsetX;
        lastCellOffsetY = cellOffsetY;

        const h00 = data[idx00];
        const h10 = data[idx10];
        const h01 = data[idx01];
        const h11 = data[idx11];

        // Gradient
        const gradX = (h10 - h00) * (1.0 - cellOffsetY) + (h11 - h01) * cellOffsetY;
        const gradY = (h01 - h00) * (1.0 - cellOffsetX) + (h11 - h10) * cellOffsetX;
        const currentHeight =
          h00 * (1.0 - cellOffsetX) * (1.0 - cellOffsetY) +
          h10 * cellOffsetX * (1.0 - cellOffsetY) +
          h01 * (1.0 - cellOffsetX) * cellOffsetY +
          h11 * cellOffsetX * cellOffsetY;

        // Direction with inertia
        dirX = dirX * params.inertia - gradX * (1.0 - params.inertia);
        dirY = dirY * params.inertia - gradY * (1.0 - params.inertia);

        const len = Math.sqrt(dirX * dirX + dirY * dirY);
        if (len !== 0) {
          dirX /= len;
          dirY /= len;
        }

        posX += dirX;
        posY += dirY;

        if (posX < 0 || posX >= res - 1 || posY < 0 || posY >= res - 1) {
          this.sedimentCarriedOffGrid += sediment;
          sediment = 0;
          exitedGrid = true;
          break;
        }

        const newNodeX = posX | 0;
        const newNodeY = posY | 0;
        const newCellOffsetX = posX - newNodeX;
        const newCellOffsetY = posY - newNodeY;
        const newCellOffset = newNodeY * res + newNodeX;

        const nh00 = data[newCellOffset];
        const nh10 = data[newCellOffset + 1];
        const nh01 = data[newCellOffset + res];
        const nh11 = data[newCellOffset + res + 1];

        const newHeight =
          nh00 * (1.0 - newCellOffsetX) * (1.0 - newCellOffsetY) +
          nh10 * newCellOffsetX * (1.0 - newCellOffsetY) +
          nh01 * (1.0 - newCellOffsetX) * newCellOffsetY +
          nh11 * newCellOffsetX * newCellOffsetY;

        const deltaHeight = newHeight - currentHeight;

        // Transport capacity
        const slope = Math.max(-deltaHeight, params.minSlope);
        const sedimentCapacity = Math.max(
          params.minSedimentCapacity,
          slope * speed * water * params.sedimentCapacityFactor
        );

        if (sediment > sedimentCapacity || deltaHeight > 0) {
          const depositAmount =
            deltaHeight > 0
              ? Math.min(deltaHeight, sediment)
              : (sediment - sedimentCapacity) * params.depositSpeed;

          sediment -= depositAmount;
          this.totalDepositedMass += depositAmount;

          const d00 = depositAmount * (1.0 - cellOffsetX) * (1.0 - cellOffsetY);
          const d10 = depositAmount * cellOffsetX * (1.0 - cellOffsetY);
          const d01 = depositAmount * (1.0 - cellOffsetX) * cellOffsetY;
          const d11 = depositAmount * cellOffsetX * cellOffsetY;

          data[idx00] += d00;
          data[idx10] += d10;
          data[idx01] += d01;
          data[idx11] += d11;

          totalDelta += depositAmount;
        } else {
          const erosionAmount = Math.min(
            (sedimentCapacity - sediment) * params.erodeSpeed,
            -deltaHeight
          );

          if (erosionAmount > 0) {
            const curIdx = nodeY * res + nodeX;
            const bX = brush.offsetsX[curIdx];
            const bY = brush.offsetsY[curIdx];
            const bW = brush.weights[curIdx];
            const bCount = bW.length;

            for (let i = 0; i < bCount; i++) {
              const cellIdx = bY[i] * res + bX[i];
              const cellErode = erosionAmount * bW[i];
              data[cellIdx] -= cellErode;
            }

            sediment += erosionAmount;
            this.totalErodedMass += erosionAmount;
            totalDelta += erosionAmount;
          }
        }

        speed = Math.sqrt(Math.max(0, speed * speed + deltaHeight * params.gravity));
        water *= 1.0 - params.evaporateSpeed;

        if (water < 0.001) {
          break;
        }
      }

      // If droplet expired while holding sediment (and didn't fly off-grid),
      // deposit remaining suspended sediment at its resting place
      if (!exitedGrid && sediment > 0) {
        const d00 = sediment * (1.0 - lastCellOffsetX) * (1.0 - lastCellOffsetY);
        const d10 = sediment * lastCellOffsetX * (1.0 - lastCellOffsetY);
        const d01 = sediment * (1.0 - lastCellOffsetX) * lastCellOffsetY;
        const d11 = sediment * lastCellOffsetX * lastCellOffsetY;

        data[lastIdx00] += d00;
        data[lastIdx10] += d10;
        data[lastIdx01] += d01;
        data[lastIdx11] += d11;

        this.totalDepositedMass += sediment;
        totalDelta += sediment;
      }
    }

    return { dropletCount: numDroplets, terrainDeltaSum: totalDelta };
  }
}
