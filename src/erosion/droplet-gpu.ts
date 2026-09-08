import { Heightmap } from "../core/heightmap";
import type { DropletErosionParams } from "../core/types";
import dropletShaderCode from "../shaders/droplets.wgsl?raw";

export class DropletErosionGPU {
  private device: GPUDevice | null = null;
  private pipeline: GPUComputePipeline | null = null;
  private uniformBuffer: GPUBuffer | null = null;
  private terrainBuffer: GPUBuffer | null = null;
  private fixedBuffer: GPUBuffer | null = null;
  private readbackBuffer: GPUBuffer | null = null;
  private currentResolution = 0;
  private isSupported = false;
  private initPromise: Promise<boolean> | null = null;

  constructor() {
    this.initPromise = this.initWebGPU();
  }

  public async isAvailable(): Promise<boolean> {
    if (this.initPromise) {
      await this.initPromise;
    }
    return this.isSupported;
  }

  private async initWebGPU(): Promise<boolean> {
    if (typeof navigator === "undefined" || !navigator.gpu) {
      console.warn("WebGPU is not supported in this environment. Falling back to CPU reference.");
      this.isSupported = false;
      return false;
    }

    try {
      const adapter = await navigator.gpu.requestAdapter({
        powerPreference: "high-performance"
      });
      if (!adapter) {
        console.warn("No suitable WebGPU adapter found.");
        this.isSupported = false;
        return false;
      }

      this.device = await adapter.requestDevice();
      const shaderModule = this.device.createShaderModule({
        label: "Droplet Erosion Compute Shader",
        code: dropletShaderCode
      });

      this.pipeline = this.device.createComputePipeline({
        label: "Droplet Pipeline",
        layout: "auto",
        compute: {
          module: shaderModule,
          entryPoint: "main"
        }
      });

      this.isSupported = true;
      return true;
    } catch (err) {
      console.warn("WebGPU initialization failed:", err);
      this.isSupported = false;
      return false;
    }
  }

  private ensureBuffers(resolution: number): void {
    if (!this.device) return;
    if (this.currentResolution === resolution && this.terrainBuffer && this.fixedBuffer) {
      return;
    }

    const totalCells = resolution * resolution;
    const byteSize = totalCells * 4;

    this.terrainBuffer?.destroy();
    this.fixedBuffer?.destroy();
    this.readbackBuffer?.destroy();
    this.uniformBuffer?.destroy();

    this.uniformBuffer = this.device.createBuffer({
      size: 64,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    this.terrainBuffer = this.device.createBuffer({
      size: byteSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC
    });

    this.fixedBuffer = this.device.createBuffer({
      size: byteSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC
    });

    this.readbackBuffer = this.device.createBuffer({
      size: byteSize,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
    });

    this.currentResolution = resolution;
  }

  public async simulate(
    heightmap: Heightmap,
    params: DropletErosionParams,
    seed: number,
    readbackToCpu = true
  ): Promise<boolean> {
    if (!this.device || !this.pipeline) {
      return false;
    }

    const res = heightmap.resolution;
    this.ensureBuffers(res);
    const totalCells = res * res;
    const fixedScale = 1000.0;

    const fixedData = new Int32Array(totalCells);
    for (let i = 0; i < totalCells; i++) {
      fixedData[i] = Math.round(heightmap.data[i] * fixedScale);
    }

    this.device.queue.writeBuffer(this.fixedBuffer!, 0, fixedData as unknown as BufferSource);
    this.device.queue.writeBuffer(this.terrainBuffer!, 0, heightmap.data as unknown as BufferSource);

    const uniformArray = new ArrayBuffer(64);
    const u32View = new Uint32Array(uniformArray);
    const f32View = new Float32Array(uniformArray);

    u32View[0] = res;
    u32View[1] = params.maxLifetime;
    u32View[2] = params.iterationsPerStep;
    u32View[3] = (seed * 19937 + 123) >>> 0;

    f32View[4] = params.inertia;
    f32View[5] = params.sedimentCapacityFactor;
    f32View[6] = params.minSedimentCapacity;
    f32View[7] = params.depositSpeed;
    f32View[8] = params.erodeSpeed;
    f32View[9] = params.evaporateSpeed;
    f32View[10] = params.gravity;
    f32View[11] = params.minSlope;
    f32View[12] = params.initialWater;
    f32View[13] = params.initialVelocity;
    f32View[14] = fixedScale;
    f32View[15] = 0.0;

    this.device.queue.writeBuffer(this.uniformBuffer!, 0, uniformArray);

    const bindGroup = this.device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuffer! } },
        { binding: 1, resource: { buffer: this.terrainBuffer! } },
        { binding: 2, resource: { buffer: this.fixedBuffer! } }
      ]
    });

    const commandEncoder = this.device.createCommandEncoder({ label: "Droplet Encoder" });
    const pass = commandEncoder.beginComputePass({ label: "Droplet Pass" });
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, bindGroup);

    const workgroupCount = Math.ceil(params.iterationsPerStep / 64);
    pass.dispatchWorkgroups(workgroupCount);
    pass.end();

    if (readbackToCpu) {
      commandEncoder.copyBufferToBuffer(
        this.fixedBuffer!,
        0,
        this.readbackBuffer!,
        0,
        totalCells * 4
      );
    }

    this.device.queue.submit([commandEncoder.finish()]);

    if (readbackToCpu) {
      await this.readbackBuffer!.mapAsync(GPUMapMode.READ);
      const copyArray = new Int32Array(this.readbackBuffer!.getMappedRange());
      const invScale = 1.0 / fixedScale;
      for (let i = 0; i < totalCells; i++) {
        heightmap.data[i] = copyArray[i] * invScale;
      }
      this.readbackBuffer!.unmap();
    }

    return true;
  }
}
