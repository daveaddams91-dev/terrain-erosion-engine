import type { Preset } from "./types";

export const PRESETS: Record<string, Preset> = {
  "alpine-peaks": {
    name: "Alpine Glacial Peaks",
    description: "Towering mountain crests with sharp knife-edge ridges, steep talus aprons, and glacial cirques.",
    terrain: {
      resolution: 512,
      seed: 4201,
      scale: 2.8,
      octaves: 6,
      persistence: 0.52,
      lacunarity: 2.05,
      heightScale: 140.0,
      power: 1.35,
      noiseType: "ridge",
      domainWarpStrength: 0.18,
      domainWarpScale: 1.2
    },
    droplet: {
      iterationsPerStep: 15000,
      maxLifetime: 45,
      inertia: 0.12,
      sedimentCapacityFactor: 5.0,
      minSedimentCapacity: 0.01,
      depositSpeed: 0.25,
      erodeSpeed: 0.35,
      evaporateSpeed: 0.018,
      gravity: 12.0,
      erosionRadius: 3,
      initialWater: 1.0,
      initialVelocity: 0.0,
      minSlope: 0.01
    },
    thermal: {
      iterationsPerStep: 2,
      talusAngle: 42,
      erosionRate: 0.55,
      spatiallyVarying: true,
      bedrockTalusAngle: 48,
      sedimentTalusAngle: 30
    },
    shallowWater: {
      timeStep: 0.05,
      pipeArea: 0.5,
      pipeLength: 1.0,
      gravity: 9.81,
      rainRate: 0.012,
      evaporationRate: 0.015,
      sedimentCapacityFactor: 1.4,
      dissolvingRate: 0.08,
      depositionRate: 0.08,
      minTiltAngle: 0.01,
      maxSedimentVelocity: 12.0
    },
    interleave: {
      enabled: true,
      hydraulicSteps: 5,
      thermalSteps: 1,
      order: "hydraulic-first"
    }
  },

  "canyonlands": {
    name: "Canyonlands & Mesas",
    description: "Steep-walled plateau canyons carved by vigorous hydraulic incision with alluvial deposits.",
    terrain: {
      resolution: 512,
      seed: 8812,
      scale: 2.2,
      octaves: 5,
      persistence: 0.48,
      lacunarity: 2.2,
      heightScale: 110.0,
      power: 1.8,
      noiseType: "simplex",
      domainWarpStrength: 0.25,
      domainWarpScale: 0.9
    },
    droplet: {
      iterationsPerStep: 20000,
      maxLifetime: 50,
      inertia: 0.22,
      sedimentCapacityFactor: 4.5,
      minSedimentCapacity: 0.01,
      depositSpeed: 0.3,
      erodeSpeed: 0.4,
      evaporateSpeed: 0.015,
      gravity: 9.81,
      erosionRadius: 3,
      initialWater: 1.0,
      initialVelocity: 0.0,
      minSlope: 0.01
    },
    thermal: {
      iterationsPerStep: 1,
      talusAngle: 38,
      erosionRate: 0.45,
      spatiallyVarying: true,
      bedrockTalusAngle: 44,
      sedimentTalusAngle: 28
    },
    shallowWater: {
      timeStep: 0.05,
      pipeArea: 0.6,
      pipeLength: 1.0,
      gravity: 9.81,
      rainRate: 0.02,
      evaporationRate: 0.01,
      sedimentCapacityFactor: 1.8,
      dissolvingRate: 0.12,
      depositionRate: 0.1,
      minTiltAngle: 0.01,
      maxSedimentVelocity: 10.0
    },
    interleave: {
      enabled: true,
      hydraulicSteps: 4,
      thermalSteps: 1,
      order: "hydraulic-first"
    }
  },

  "river-basin": {
    name: "River Basin & Delta",
    description: "Gentle lowlands with intricate dendritic stream networks flowing into wide lake basins.",
    terrain: {
      resolution: 512,
      seed: 1337,
      scale: 3.2,
      octaves: 5,
      persistence: 0.5,
      lacunarity: 2.0,
      heightScale: 75.0,
      power: 1.1,
      noiseType: "simplex",
      domainWarpStrength: 0.12,
      domainWarpScale: 1.0
    },
    droplet: {
      iterationsPerStep: 15000,
      maxLifetime: 55,
      inertia: 0.2,
      sedimentCapacityFactor: 3.5,
      minSedimentCapacity: 0.01,
      depositSpeed: 0.35,
      erodeSpeed: 0.25,
      evaporateSpeed: 0.012,
      gravity: 8.5,
      erosionRadius: 2,
      initialWater: 1.0,
      initialVelocity: 0.0,
      minSlope: 0.005
    },
    thermal: {
      iterationsPerStep: 1,
      talusAngle: 32,
      erosionRate: 0.35,
      spatiallyVarying: false,
      bedrockTalusAngle: 40,
      sedimentTalusAngle: 28
    },
    shallowWater: {
      timeStep: 0.05,
      pipeArea: 0.5,
      pipeLength: 1.0,
      gravity: 9.81,
      rainRate: 0.015,
      evaporationRate: 0.012,
      sedimentCapacityFactor: 1.2,
      dissolvingRate: 0.06,
      depositionRate: 0.08,
      minTiltAngle: 0.005,
      maxSedimentVelocity: 8.0
    },
    interleave: {
      enabled: false,
      hydraulicSteps: 1,
      thermalSteps: 0,
      order: "hydraulic-first"
    }
  },

  "badlands": {
    name: "Badlands & Gully Maze",
    description: "Highly erodible friable terrain forming dense dendritic rills, ravines, and sharp mudstone spurs.",
    terrain: {
      resolution: 512,
      seed: 5555,
      scale: 3.6,
      octaves: 6,
      persistence: 0.55,
      lacunarity: 2.1,
      heightScale: 95.0,
      power: 1.2,
      noiseType: "billow",
      domainWarpStrength: 0.2,
      domainWarpScale: 1.5
    },
    droplet: {
      iterationsPerStep: 25000,
      maxLifetime: 40,
      inertia: 0.08,
      sedimentCapacityFactor: 6.0,
      minSedimentCapacity: 0.01,
      depositSpeed: 0.2,
      erodeSpeed: 0.5,
      evaporateSpeed: 0.025,
      gravity: 14.0,
      erosionRadius: 2,
      initialWater: 1.0,
      initialVelocity: 0.0,
      minSlope: 0.02
    },
    thermal: {
      iterationsPerStep: 3,
      talusAngle: 34,
      erosionRate: 0.6,
      spatiallyVarying: false,
      bedrockTalusAngle: 38,
      sedimentTalusAngle: 26
    },
    shallowWater: {
      timeStep: 0.05,
      pipeArea: 0.5,
      pipeLength: 1.0,
      gravity: 9.81,
      rainRate: 0.025,
      evaporationRate: 0.02,
      sedimentCapacityFactor: 2.2,
      dissolvingRate: 0.15,
      depositionRate: 0.1,
      minTiltAngle: 0.01,
      maxSedimentVelocity: 14.0
    },
    interleave: {
      enabled: true,
      hydraulicSteps: 3,
      thermalSteps: 1,
      order: "hydraulic-first"
    }
  }
};
