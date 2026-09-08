import { Heightmap } from "../core/heightmap";
import type { ThermalErosionParams } from "../core/types";
import thermalShaderCode from "../shaders/thermal.wgsl?raw";

export class ThermalErosion {
  private device: GPUDevice | null = null;
  private pipeline: GPUComputePipeline | null = null;
  private uniformBuffer: GPUBuffer | null = null;
  private bufferA: GPUBuffer | null = null;
  private bufferB: GPUBuffer | null = null;
  private readbackBuffer: GPUBuffer | null = null;
  private currentRes = 0;
  private isGpuReady = false;

  // Diagnostics
  public totalSlumpedVolume = 0;

  constructor(gpuDevice: GPUDevice | null = null) {
    if (gpuDevice) {
      this.initGPU(gpuDevice);
    }
  }

  public initGPU(device: GPUDevice): void {
    try {
      this.device = device;
      const shaderModule = device.createShaderModule({
        label: "Thermal Erosion Shader",
        code: thermalShaderCode
      });
      this.pipeline = device.createComputePipeline({
        label: "Thermal Pipeline",
        layout: "auto",
        compute: {
          module: shaderModule,
          entryPoint: "main"
        }
      });
      this.isGpuReady = true;
    } catch (err) {
      console.warn("Thermal GPU pipeline init failed, using CPU:", err);
      this.isGpuReady = false;
    }
  }

  public simulate(
    heightmap: Heightmap,
    params: ThermalErosionParams,
    cellSpacing = 1.0,
    preferGpu = false
  ): { iterations: number; volumeMoved: number } {
    if (preferGpu && this.isGpuReady && this.device) {
      this.simulateGPU(heightmap, params, cellSpacing);
    } else {
      this.simulateCPU(heightmap, params, cellSpacing);
    }

    return {
      iterations: params.iterationsPerStep,
      volumeMoved: this.totalSlumpedVolume
    };
  }

  public simulateCPU(
    heightmap: Heightmap,
    params: ThermalErosionParams,
    cellSpacing = 1.0
  ): void {
    const res = heightmap.resolution;
    const data = heightmap.data;
    const temp = new Float32Array(data.length);

    const rad = (params.talusAngle * Math.PI) / 180.0;
    const tanTalus = Math.tan(rad);

    const bedrockTan = Math.tan((params.bedrockTalusAngle * Math.PI) / 180.0);
    const sedimentTan = Math.tan((params.sedimentTalusAngle * Math.PI) / 180.0);

    const neighborsDX = [-1, 1, 0, 0, -1, 1, -1, 1];
    const neighborsDY = [0, 0, -1, 1, -1, -1, 1, 1];
    const distances = [
      cellSpacing,
      cellSpacing,
      cellSpacing,
      cellSpacing,
      cellSpacing * Math.SQRT2,
      cellSpacing * Math.SQRT2,
      cellSpacing * Math.SQRT2,
      cellSpacing * Math.SQRT2
    ];

    let totalVolume = 0;

    for (let iter = 0; iter < params.iterationsPerStep; iter++) {
      temp.set(data);

      for (let y = 0; y < res; y++) {
        const row = y * res;
        for (let x = 0; x < res; x++) {
          const idx = row + x;
          const h = data[idx];

          let curTan = tanTalus;
          if (params.spatiallyVarying) {
            const normH = Math.max(0, Math.min(1, h / 100.0));
            curTan = sedimentTan + (bedrockTan - sedimentTan) * normH;
          }

          let maxDiff = 0;
          let totalExcess = 0;
          const excesses = [0, 0, 0, 0, 0, 0, 0, 0];

          for (let n = 0; n < 8; n++) {
            const nx = x + neighborsDX[n];
            const ny = y + neighborsDY[n];
            if (nx < 0 || nx >= res || ny < 0 || ny >= res) continue;

            const nIdx = ny * res + nx;
            const nh = data[nIdx];
            const d = distances[n];
            const threshold = d * curTan;
            const diff = h - nh;

            if (diff > threshold) {
              const excess = diff - threshold;
              excesses[n] = excess;
              totalExcess += excess;
              if (excess > maxDiff) maxDiff = excess;
            }
          }

          if (totalExcess > 0) {
            const volumeToSlump = Math.min(maxDiff * 0.5, totalExcess * 0.25) * params.erosionRate;
            temp[idx] -= volumeToSlump;
            totalVolume += volumeToSlump;

            for (let n = 0; n < 8; n++) {
              if (excesses[n] > 0) {
                const nx = x + neighborsDX[n];
                const ny = y + neighborsDY[n];
                const nIdx = ny * res + nx;
                const portion = (excesses[n] / totalExcess) * volumeToSlump;
                temp[nIdx] += portion;
              }
            }
          }
        }
      }

      data.set(temp);
    }

    this.totalSlumpedVolume += totalVolume;
  }

  private simulateGPU(
    heightmap: Heightmap,
    params: ThermalErosionParams,
    cellSpacing: number
  ): void {
    if (!this.device || !this.pipeline) return;

    const res = heightmap.resolution;
    const totalCells = res * res;
    const byteSize = totalCells * 4;

    if (this.currentRes !== res || !this.bufferA) {
      this.bufferA?.destroy();
      this.bufferB?.destroy();
      this.uniformBuffer?.destroy();
      this.readbackBuffer?.destroy();

      this.uniformBuffer = this.device.createBuffer({
        size: 64,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
      });

      this.bufferA = this.device.createBuffer({
        size: byteSize,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC
      });

      this.bufferB = this.device.createBuffer({
        size: byteSize,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC
      });

      this.readbackBuffer = this.device.createBuffer({
        size: byteSize,
        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
      });

      this.currentRes = res;
    }

    const rad = (params.talusAngle * Math.PI) / 180.0;
    const tanTalus = Math.tan(rad);
    const orthoThreshold = cellSpacing * tanTalus;
    const diagThreshold = cellSpacing * Math.SQRT2 * tanTalus;

    const uniformArray = new ArrayBuffer(64);
    const u32 = new Uint32Array(uniformArray);
    const f32 = new Float32Array(uniformArray);

    u32[0] = res;
    u32[1] = params.iterationsPerStep;
    f32[2] = orthoThreshold;
    f32[3] = diagThreshold;
    f32[4] = params.erosionRate;
    u32[5] = params.spatiallyVarying ? 1 : 0;
    f32[6] = cellSpacing * Math.tan((params.bedrockTalusAngle * Math.PI) / 180.0);
    f32[7] = cellSpacing * Math.tan((params.sedimentTalusAngle * Math.PI) / 180.0);

    this.device.queue.writeBuffer(this.uniformBuffer!, 0, uniformArray);
    this.device.queue.writeBuffer(this.bufferA!, 0, heightmap.data as unknown as BufferSource);

    let src = this.bufferA!;
    let dst = this.bufferB!;

    for (let i = 0; i < params.iterationsPerStep; i++) {
      const bindGroup = this.device.createBindGroup({
        layout: this.pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.uniformBuffer! } },
          { binding: 1, resource: { buffer: src } },
          { binding: 2, resource: { buffer: dst } }
        ]
      });

      const encoder = this.device.createCommandEncoder();
      const pass = encoder.beginComputePass();
      pass.setPipeline(this.pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.dispatchWorkgroups(Math.ceil(res / 8), Math.ceil(res / 8));
      pass.end();
      this.device.queue.submit([encoder.finish()]);

      const temp = src;
      src = dst;
      dst = temp;
    }

    const copyEncoder = this.device.createCommandEncoder();
    copyEncoder.copyBufferToBuffer(src, 0, this.readbackBuffer!, 0, byteSize);
    this.device.queue.submit([copyEncoder.finish()]);

    this.readbackBuffer!.mapAsync(GPUMapMode.READ).then(() => {
      const result = new Float32Array(this.readbackBuffer!.getMappedRange());
      heightmap.data.set(result);
      this.readbackBuffer!.unmap();
    });
  }
}
