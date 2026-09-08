import { Pane } from "tweakpane";
import { PRESETS } from "../core/presets";
import type {
  TerrainConfig,
  DropletErosionParams,
  ThermalErosionParams,
  ShallowWaterErosionParams,
  InterleaveConfig,
  ErosionMethod,
  ComputeBackend,
  RenderViewMode,
  ComparisonMode
} from "../core/types";

export interface ParameterPanelCallbacks {
  onGenerateTerrain: () => void;
  onResetToBase: () => void;
  onTogglePlay: (playing: boolean) => void;
  onStepSimulation: () => void;
  onPresetChanged: (presetKey: string) => void;
  onViewModeChanged: (mode: RenderViewMode) => void;
  onWaterVisibleChanged: (visible: boolean) => void;
  onCrossSectionToggle: (visible: boolean) => void;
  onComparisonModeChanged: (mode: ComparisonMode) => void;
  onExportPNG16: () => void;
  onExportRAW: () => void;
  onExportOBJ: () => void;
}

export class ParameterPanel {
  public readonly pane: Pane;
  private refreshableBindings: Array<{ refresh: () => void }> = [];

  // Local state references
  public terrain: TerrainConfig;
  public droplet: DropletErosionParams;
  public thermal: ThermalErosionParams;
  public shallowWater: ShallowWaterErosionParams;
  public interleave: InterleaveConfig;

  public playback = {
    isPlaying: false,
    subStepsPerFrame: 1,
    method: "droplet" as ErosionMethod,
    backend: "cpu" as ComputeBackend
  };

  public view = {
    mode: "shaded" as RenderViewMode,
    showWater: true,
    showCrossSection: true,
    comparison: "single" as ComparisonMode
  };

  public presetChoice = "alpine-peaks";

  constructor(
    parent: HTMLElement,
    initialTerrain: TerrainConfig,
    initialDroplet: DropletErosionParams,
    initialThermal: ThermalErosionParams,
    initialShallow: ShallowWaterErosionParams,
    initialInterleave: InterleaveConfig,
    hasWebGPU: boolean,
    callbacks: ParameterPanelCallbacks
  ) {
    this.terrain = initialTerrain;
    this.droplet = initialDroplet;
    this.thermal = initialThermal;
    this.shallowWater = initialShallow;
    this.interleave = initialInterleave;
    if (hasWebGPU) {
      this.playback.backend = "webgpu";
    }

    this.pane = new Pane({
      container: parent,
      title: "Terrain Simulation Controls"
    });

    // 1. PRESETS FOLDER
    const fPresets = this.pane.addFolder({ title: "Geological Presets", expanded: true });
    const bPreset = fPresets.addBinding(this, "presetChoice", {
      label: "Preset",
      options: {
        "Alpine Glacial Peaks": "alpine-peaks",
        "Canyonlands & Mesas": "canyonlands",
        "River Basin & Delta": "river-basin",
        "Badlands & Gully Maze": "badlands"
      }
    });
    bPreset.on("change", (ev: { value: string }) => {
      callbacks.onPresetChanged(ev.value);
      this.refresh();
    });
    this.refreshableBindings.push(bPreset);

    // 2. PLAYBACK & EXECUTION FOLDER
    const fPlayback = this.pane.addFolder({ title: "Simulation Playback", expanded: true });

    const playBtn = fPlayback.addButton({ title: "▶ Play Simulation" });
    playBtn.on("click", () => {
      this.playback.isPlaying = !this.playback.isPlaying;
      playBtn.title = this.playback.isPlaying ? "⏸ Pause Simulation" : "▶ Play Simulation";
      callbacks.onTogglePlay(this.playback.isPlaying);
    });

    fPlayback.addButton({ title: "⏭ Single Step" }).on("click", () => {
      callbacks.onStepSimulation();
    });

    fPlayback.addButton({ title: "↺ Reset to Base Heightmap" }).on("click", () => {
      callbacks.onResetToBase();
    });

    this.refreshableBindings.push(
      fPlayback.addBinding(this.playback, "subStepsPerFrame", {
        label: "Speed (Steps/Frame)",
        min: 1,
        max: 10,
        step: 1
      }),
      fPlayback.addBinding(this.playback, "method", {
        label: "Erosion Method",
        options: {
          "Droplet Particle (Hans Beyer)": "droplet",
          "Grid Shallow Water (Mei et al.)": "shallow-water"
        }
      }),
      fPlayback.addBinding(this.playback, "backend", {
        label: "Compute Engine",
        options: {
          "WebGPU Compute Shaders": "webgpu",
          "CPU Reference Engine": "cpu"
        }
      })
    );

    // 3. TERRAIN BASE GENERATION
    const fTerrain = this.pane.addFolder({ title: "Base Terrain Noise", expanded: false });

    this.refreshableBindings.push(
      fTerrain.addBinding(this.terrain, "resolution", {
        label: "Resolution",
        options: {
          "256 × 256 (Fastest)": 256,
          "512 × 512 (Standard)": 512,
          "1024 × 1024 (HD)": 1024
        }
      }),
      fTerrain.addBinding(this.terrain, "seed", { label: "Seed", min: 1, max: 99999, step: 1 }),
      fTerrain.addBinding(this.terrain, "scale", { label: "Noise Scale", min: 0.5, max: 8.0, step: 0.1 }),
      fTerrain.addBinding(this.terrain, "octaves", { label: "Octaves", min: 1, max: 8, step: 1 }),
      fTerrain.addBinding(this.terrain, "persistence", { label: "Persistence", min: 0.1, max: 0.9, step: 0.02 }),
      fTerrain.addBinding(this.terrain, "lacunarity", { label: "Lacunarity", min: 1.2, max: 3.5, step: 0.1 }),
      fTerrain.addBinding(this.terrain, "heightScale", { label: "Height Scale", min: 20, max: 250, step: 5 }),
      fTerrain.addBinding(this.terrain, "power", { label: "Redistribution", min: 0.5, max: 2.5, step: 0.05 }),
      fTerrain.addBinding(this.terrain, "noiseType", {
        label: "Noise Function",
        options: {
          "Simplex Noise": "simplex",
          "Perlin Noise": "perlin",
          "Rigid Mountain Ridges": "ridge",
          "Billow / Puffy Hills": "billow"
        }
      }),
      fTerrain.addBinding(this.terrain, "domainWarpStrength", {
        label: "Domain Warp",
        min: 0.0,
        max: 0.5,
        step: 0.02
      })
    );

    fTerrain.addButton({ title: "🎲 Random Seed & Regenerate" }).on("click", () => {
      this.terrain.seed = Math.floor(Math.random() * 99999) + 1;
      this.refresh();
      callbacks.onGenerateTerrain();
    });

    fTerrain.addButton({ title: "⚡ Generate Base Terrain" }).on("click", () => {
      callbacks.onGenerateTerrain();
    });

    // 4. HYDRAULIC DROPLET PARAMETERS
    const fDroplet = this.pane.addFolder({ title: "Hydraulic Droplet Physics", expanded: false });
    this.refreshableBindings.push(
      fDroplet.addBinding(this.droplet, "iterationsPerStep", {
        label: "Droplets / Step",
        min: 1000,
        max: 50000,
        step: 1000
      }),
      fDroplet.addBinding(this.droplet, "maxLifetime", { label: "Max Lifetime", min: 10, max: 100, step: 5 }),
      fDroplet.addBinding(this.droplet, "inertia", { label: "Inertia", min: 0.0, max: 0.4, step: 0.01 }),
      fDroplet.addBinding(this.droplet, "sedimentCapacityFactor", {
        label: "Capacity (Kc)",
        min: 1.0,
        max: 12.0,
        step: 0.2
      }),
      fDroplet.addBinding(this.droplet, "erodeSpeed", { label: "Erosion Rate (Ke)", min: 0.05, max: 0.9, step: 0.05 }),
      fDroplet.addBinding(this.droplet, "depositSpeed", { label: "Deposit Rate (Kd)", min: 0.05, max: 0.9, step: 0.05 }),
      fDroplet.addBinding(this.droplet, "evaporateSpeed", {
        label: "Evaporation",
        min: 0.005,
        max: 0.08,
        step: 0.005
      }),
      fDroplet.addBinding(this.droplet, "gravity", { label: "Gravity (g)", min: 2.0, max: 25.0, step: 0.5 }),
      fDroplet.addBinding(this.droplet, "erosionRadius", { label: "Brush Radius", min: 1, max: 4, step: 1 })
    );

    // 5. SHALLOW WATER PIPE PARAMETERS
    const fShallow = this.pane.addFolder({ title: "Shallow Water Fluid Physics", expanded: false });
    this.refreshableBindings.push(
      fShallow.addBinding(this.shallowWater, "rainRate", { label: "Rain Influx", min: 0.002, max: 0.06, step: 0.002 }),
      fShallow.addBinding(this.shallowWater, "evaporationRate", {
        label: "Evaporation",
        min: 0.002,
        max: 0.05,
        step: 0.002
      }),
      fShallow.addBinding(this.shallowWater, "pipeArea", { label: "Virtual Pipe Area", min: 0.1, max: 1.0, step: 0.05 }),
      fShallow.addBinding(this.shallowWater, "dissolvingRate", {
        label: "Dissolving (Ks)",
        min: 0.01,
        max: 0.4,
        step: 0.01
      }),
      fShallow.addBinding(this.shallowWater, "depositionRate", {
        label: "Deposition (Kd)",
        min: 0.01,
        max: 0.4,
        step: 0.01
      }),
      fShallow.addBinding(this.shallowWater, "sedimentCapacityFactor", {
        label: "Stream Capacity",
        min: 0.5,
        max: 5.0,
        step: 0.1
      })
    );

    // 6. THERMAL EROSION & PASS INTERLEAVING
    const fThermal = this.pane.addFolder({ title: "Thermal Erosion & Repose", expanded: false });
    this.refreshableBindings.push(
      fThermal.addBinding(this.thermal, "iterationsPerStep", {
        label: "Sub-iterations",
        min: 1,
        max: 10,
        step: 1
      }),
      fThermal.addBinding(this.thermal, "talusAngle", {
        label: "Angle of Repose (°)",
        min: 20,
        max: 60,
        step: 1
      }),
      fThermal.addBinding(this.thermal, "erosionRate", { label: "Slump Fraction", min: 0.1, max: 0.9, step: 0.05 }),
      fThermal.addBinding(this.thermal, "spatiallyVarying", { label: "Spatially Varying" }),
      fThermal.addBinding(this.thermal, "bedrockTalusAngle", { label: "Bedrock Angle (°)", min: 35, max: 65, step: 1 }),
      fThermal.addBinding(this.thermal, "sedimentTalusAngle", { label: "Sediment Angle (°)", min: 20, max: 35, step: 1 })
    );

    const fInterleave = fThermal.addFolder({ title: "Pass Interleaving", expanded: true });
    this.refreshableBindings.push(
      fInterleave.addBinding(this.interleave, "enabled", { label: "Interleave Passes" }),
      fInterleave.addBinding(this.interleave, "hydraulicSteps", {
        label: "Hydraulic Steps",
        min: 1,
        max: 10,
        step: 1
      }),
      fInterleave.addBinding(this.interleave, "thermalSteps", {
        label: "Thermal Steps",
        min: 1,
        max: 5,
        step: 1
      })
    );

    // 7. VISUALIZATION & VIEW MODES
    const fView = this.pane.addFolder({ title: "Visualization & View Modes", expanded: true });
    const bMode = fView.addBinding(this.view, "mode", {
      label: "Render Style",
      options: {
        "Realistic Biome Shading": "shaded",
        "Before/After Diff Heatmap": "diff-heatmap",
        "Slope Steepness Heatmap": "slope-angle",
        "Wireframe Mesh": "wireframe"
      }
    });
    bMode.on("change", (ev: { value: RenderViewMode }) => {
      callbacks.onViewModeChanged(ev.value);
    });

    const bWater = fView.addBinding(this.view, "showWater", { label: "Render Water Flow" });
    bWater.on("change", (ev: { value: boolean }) => {
      callbacks.onWaterVisibleChanged(ev.value);
    });

    const bCross = fView.addBinding(this.view, "showCrossSection", { label: "2D Cross-Section" });
    bCross.on("change", (ev: { value: boolean }) => {
      callbacks.onCrossSectionToggle(ev.value);
    });

    this.refreshableBindings.push(bMode, bWater, bCross);

    // 8. COMPARISON & EXPORT
    const fExport = this.pane.addFolder({ title: "Export Heightmap", expanded: false });

    fExport.addButton({ title: "💾 Download 16-bit Grayscale PNG" }).on("click", () => {
      callbacks.onExportPNG16();
    });

    fExport.addButton({ title: "💾 Download Float32 RAW File" }).on("click", () => {
      callbacks.onExportRAW();
    });

    fExport.addButton({ title: "💾 Download 3D Mesh (OBJ)" }).on("click", () => {
      callbacks.onExportOBJ();
    });
  }

  public refresh(): void {
    for (const b of this.refreshableBindings) {
      b.refresh();
    }
  }

  public applyPreset(preset: (typeof PRESETS)[string]): void {
    Object.assign(this.terrain, preset.terrain);
    Object.assign(this.droplet, preset.droplet);
    Object.assign(this.thermal, preset.thermal);
    Object.assign(this.shallowWater, preset.shallowWater);
    Object.assign(this.interleave, preset.interleave);
    this.refresh();
  }
}
