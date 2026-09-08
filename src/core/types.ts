export type NoiseType = "simplex" | "perlin" | "ridge" | "billow";

export interface TerrainConfig {
  resolution: number;        // e.g. 512, 1024, 2048
  seed: number;
  scale: number;             // Base frequency scale
  octaves: number;           // Number of noise octaves (1-10)
  persistence: number;       // Gain per octave (amplitude multiplier, e.g. 0.5)
  lacunarity: number;        // Frequency multiplier per octave (e.g. 2.0)
  heightScale: number;       // Peak terrain elevation
  power: number;             // Redistribution exponent (e.g. 1.0 = linear, 2.0 = flatter valleys, sharper peaks)
  noiseType: NoiseType;
  domainWarpStrength: number;// Domain warping strength (0 = disabled)
  domainWarpScale: number;
}

export interface DropletErosionParams {
  iterationsPerStep: number; // Droplets per tick (e.g. 20,000)
  maxLifetime: number;       // Max simulation steps per droplet (e.g. 40)
  inertia: number;           // Inertia/momentum factor [0..1] (e.g. 0.15)
  sedimentCapacityFactor: number; // Kc: transport capacity coefficient (e.g. 4.0)
  minSedimentCapacity: number;    // Minimum capacity floor (e.g. 0.01)
  depositSpeed: number;      // Kd: deposition rate fraction (e.g. 0.3)
  erodeSpeed: number;        // Ke: erosion rate fraction (e.g. 0.3)
  evaporateSpeed: number;    // Evaporation fraction per step (e.g. 0.02)
  gravity: number;           // Gravity constant (e.g. 9.81)
  erosionRadius: number;     // Spatial brush radius for erosion/deposition (1-4)
  initialWater: number;      // Initial water per droplet (e.g. 1.0)
  initialVelocity: number;   // Initial droplet velocity (e.g. 0.0)
  minSlope: number;          // Minimum slope clamping to avoid zero gradient (e.g. 0.01)
}

export interface ThermalErosionParams {
  iterationsPerStep: number; // Slumping sub-steps per frame (e.g. 2)
  talusAngle: number;        // Default angle of repose in degrees (e.g. 35)
  erosionRate: number;       // Fraction of excess material moved per step (e.g. 0.5)
  spatiallyVarying: boolean; // Enable hard rock vs loose sediment angle variation
  bedrockTalusAngle: number; // Hard bedrock angle in degrees (e.g. 45)
  sedimentTalusAngle: number;// Loose sediment angle in degrees (e.g. 28)
}

export interface ShallowWaterErosionParams {
  timeStep: number;          // Simulation delta t (e.g. 0.05)
  pipeArea: number;          // Virtual pipe cross-section area A (e.g. 0.5)
  pipeLength: number;        // Virtual pipe length l (e.g. 1.0)
  gravity: number;           // Gravity g (e.g. 9.81)
  rainRate: number;          // Water influx per unit area per second (e.g. 0.015)
  evaporationRate: number;   // Water loss fraction per second (e.g. 0.015)
  sedimentCapacityFactor: number; // Kc: stream power capacity factor (e.g. 1.2)
  dissolvingRate: number;    // Ks: bedrock dissolving rate (e.g. 0.1)
  depositionRate: number;    // Kd: sediment deposition rate (e.g. 0.1)
  minTiltAngle: number;      // Minimum tilt angle to maintain flow (e.g. 0.001)
  maxSedimentVelocity: number;// Clamping limit for stability
}

export type ErosionMethod = "droplet" | "shallow-water";

export type ComputeBackend = "webgpu" | "cpu";

export interface InterleaveConfig {
  enabled: boolean;
  hydraulicSteps: number;    // e.g. 5
  thermalSteps: number;      // e.g. 1
  order: "hydraulic-first" | "thermal-first";
}

export type RenderViewMode = "shaded" | "diff-heatmap" | "water-flow" | "slope-angle" | "wireframe";

export type ComparisonMode = "single" | "noise-vs-eroded" | "hydraulic-vs-thermal" | "quad-split";

export interface TelemetryData {
  fps: number;
  stepTimeMs: number;
  stepsPerSec: number;
  totalIterations: number;
  totalDroplets: number;
  activeWaterVolume: number;
  totalSedimentSuspended: number;
  totalTerrainChange: number;
  convergenceRate: number;    // running average of delta height
  massBalanceError: number;   // deviation from initial mass (sanity check)
  resolution: number;
  backend: string;
}

export interface Preset {
  name: string;
  description: string;
  terrain: TerrainConfig;
  droplet: DropletErosionParams;
  thermal: ThermalErosionParams;
  shallowWater: ShallowWaterErosionParams;
  interleave: InterleaveConfig;
}
