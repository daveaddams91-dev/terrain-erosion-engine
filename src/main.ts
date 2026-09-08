import { Heightmap } from "./core/heightmap";
import { PRESETS } from "./core/presets";
import { Viewport } from "./rendering/viewport";
import { TerrainMesh } from "./rendering/terrain-mesh";
import { WaterMesh } from "./rendering/water-mesh";
import { ErosionManager } from "./erosion/erosion-manager";
import { ParameterPanel } from "./ui/parameter-panel";
import { TelemetryOverlay } from "./ui/telemetry-overlay";
import { CrossSectionView } from "./ui/cross-section-view";
import { ComparisonView, type ComparisonStage } from "./ui/comparison-view";
import { PNG16Exporter } from "./export/png16-exporter";
import { RawExporter } from "./export/raw-exporter";
import type { RenderViewMode } from "./core/types";

function showToast(message: string, durationMs = 2500) {
  const toast = document.createElement("div");
  toast.className = "toast-notification";
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 300);
  }, durationMs);
}

async function main() {
  const container = document.getElementById("viewport-container")!;
  const paneContainer = document.getElementById("tweakpane-container")!;
  const appContainer = document.getElementById("app")!;

  // 1. Initial State & Configuration from Preset
  const defaultPreset = PRESETS["alpine-peaks"];
  const terrainConfig = { ...defaultPreset.terrain };
  const dropletParams = { ...defaultPreset.droplet };
  const thermalParams = { ...defaultPreset.thermal };
  const shallowParams = { ...defaultPreset.shallowWater };
  const interleaveConfig = { ...defaultPreset.interleave };

  // 2. Core Heightmap & Base Terrain
  const heightmap = new Heightmap(terrainConfig.resolution);
  heightmap.generate(terrainConfig);

  // 3. Three.js Rendering Pipeline
  const viewport = new Viewport(container);
  const terrainMesh = new TerrainMesh(500, terrainConfig.resolution);
  const waterMesh = new WaterMesh(500, Math.min(256, terrainConfig.resolution));
  viewport.scene.add(terrainMesh.mesh);
  viewport.scene.add(waterMesh.mesh);

  terrainMesh.updateFromHeightmap(heightmap);

  // 4. Erosion Simulation Manager
  const erosionManager = new ErosionManager(terrainConfig.resolution, terrainConfig.seed);
  const hasWebGPU = await erosionManager.dropletGpu.isAvailable();
  erosionManager.resetStats(heightmap);

  // 5. Diagnostics & UI Overlays
  const telemetry = new TelemetryOverlay(appContainer);
  const crossSection = new CrossSectionView(appContainer);

  const comparison = new ComparisonView(appContainer, {
    onSelectStage: (stage: ComparisonStage) => {
      if (stage === "noise-only" && comparison.noiseOnly) {
        heightmap.data.set(comparison.noiseOnly);
        terrainMesh.updateFromHeightmap(heightmap);
        crossSection.update(heightmap);
      } else if (stage === "hydraulic-only" && comparison.hydraulicOnly) {
        heightmap.data.set(comparison.hydraulicOnly);
        terrainMesh.updateFromHeightmap(heightmap);
        crossSection.update(heightmap);
      } else if (stage === "thermal-only" && comparison.thermalOnly) {
        heightmap.data.set(comparison.thermalOnly);
        terrainMesh.updateFromHeightmap(heightmap);
        crossSection.update(heightmap);
      } else if (stage === "combined" && comparison.combined) {
        heightmap.data.set(comparison.combined);
        terrainMesh.updateFromHeightmap(heightmap);
        crossSection.update(heightmap);
      }
    },
    onRunComparisonSuite: async () => {
      showToast("Running automated 4-way comparison suite...");
      // Save 1. Pure Noise
      heightmap.resetToInitial();
      comparison.storeSnapshot("noise-only", heightmap);

      // Run 2. Hydraulic Only
      erosionManager.resetStats(heightmap);
      for (let i = 0; i < 15; i++) {
        await erosionManager.step(
          heightmap,
          dropletParams,
          thermalParams,
          shallowParams,
          { ...interleaveConfig, enabled: false }
        );
      }
      comparison.storeSnapshot("hydraulic-only", heightmap);

      // Run 3. Thermal Only
      heightmap.resetToInitial();
      for (let i = 0; i < 20; i++) {
        erosionManager.thermal.simulate(heightmap, thermalParams, 1.0, false);
      }
      comparison.storeSnapshot("thermal-only", heightmap);

      // Run 4. Combined
      heightmap.resetToInitial();
      erosionManager.resetStats(heightmap);
      for (let i = 0; i < 20; i++) {
        await erosionManager.step(
          heightmap,
          dropletParams,
          thermalParams,
          shallowParams,
          { ...interleaveConfig, enabled: true }
        );
      }
      comparison.storeSnapshot("combined", heightmap);

      comparison.setActiveButton("combined");
      terrainMesh.updateFromHeightmap(heightmap);
      crossSection.update(heightmap);
      showToast("Comparison suite completed! Toggle 1, 2, 3, 4 to compare.");
    }
  });

  comparison.storeSnapshot("noise-only", heightmap);

  // 6. Parameter Panel (Tweakpane)
  const panel = new ParameterPanel(
    paneContainer,
    terrainConfig,
    dropletParams,
    thermalParams,
    shallowParams,
    interleaveConfig,
    hasWebGPU,
    {
      onGenerateTerrain: () => {
        if (terrainConfig.resolution !== heightmap.resolution) {
          window.location.reload();
          return;
        }
        heightmap.generate(terrainConfig);
        erosionManager.resetStats(heightmap);
        comparison.storeSnapshot("noise-only", heightmap);
        terrainMesh.updateFromHeightmap(heightmap);
        crossSection.update(heightmap);
        showToast("New base terrain generated.");
      },
      onResetToBase: () => {
        heightmap.resetToInitial();
        erosionManager.resetStats(heightmap);
        terrainMesh.updateFromHeightmap(heightmap);
        crossSection.update(heightmap);
        showToast("Terrain reset to pre-erosion state.");
      },
      onTogglePlay: (playing: boolean) => {
        if (playing) {
          showToast("Simulation running...");
        }
      },
      onStepSimulation: async () => {
        erosionManager.method = panel.playback.method;
        erosionManager.backend = panel.playback.backend;
        const res = await erosionManager.step(
          heightmap,
          dropletParams,
          thermalParams,
          shallowParams,
          interleaveConfig
        );
        terrainMesh.updateFromHeightmap(heightmap);
        if (erosionManager.method === "shallow-water" && panel.view.showWater) {
          waterMesh.update(heightmap.data, erosionManager.shallowWater.water, heightmap.resolution);
        }
        crossSection.update(
          heightmap,
          erosionManager.method === "shallow-water" ? erosionManager.shallowWater.water : undefined
        );
        telemetry.update(
          erosionManager.getTelemetry(heightmap, res.stepTimeMs),
          erosionManager.getConvergenceHistory()
        );
      },
      onPresetChanged: (presetKey: string) => {
        const preset = PRESETS[presetKey];
        if (preset) {
          panel.applyPreset(preset);
          heightmap.generate(panel.terrain);
          erosionManager.resetStats(heightmap);
          comparison.storeSnapshot("noise-only", heightmap);
          terrainMesh.updateFromHeightmap(heightmap);
          crossSection.update(heightmap);
          showToast(`Preset loaded: ${preset.name}`);
        }
      },
      onViewModeChanged: (mode: RenderViewMode) => {
        terrainMesh.setViewMode(mode);
      },
      onWaterVisibleChanged: (visible: boolean) => {
        waterMesh.setVisible(visible);
      },
      onCrossSectionToggle: (visible: boolean) => {
        crossSection.setVisible(visible);
      },
      onComparisonModeChanged: (mode) => {
        panel.view.comparison = mode;
      },
      onExportPNG16: () => {
        PNG16Exporter.download(
          heightmap,
          `terrain_${heightmap.resolution}x${heightmap.resolution}_16bit.png`
        );
        showToast("Exported 16-bit Grayscale PNG heightmap!");
      },
      onExportRAW: () => {
        RawExporter.downloadRaw(
          heightmap,
          `terrain_${heightmap.resolution}x${heightmap.resolution}_f32.raw`
        );
        showToast("Exported Float32 RAW heightmap!");
      },
      onExportOBJ: () => {
        RawExporter.downloadOBJ(heightmap, 500, `terrain_mesh_${heightmap.resolution}.obj`);
        showToast("Exported 3D Wavefront OBJ mesh!");
      }
    }
  );

  crossSection.update(heightmap);

  // 7. Real-Time Animation & Simulation Loop
  let lastTime = performance.now();
  let stepAccumulator = 0;

  async function animate(currentTime: number) {
    requestAnimationFrame(animate);

    const deltaTime = currentTime - lastTime;
    lastTime = currentTime;

    if (panel.playback.isPlaying) {
      erosionManager.method = panel.playback.method;
      erosionManager.backend = panel.playback.backend;

      let lastStepTime = 0;
      for (let s = 0; s < panel.playback.subStepsPerFrame; s++) {
        const res = await erosionManager.step(
          heightmap,
          panel.droplet,
          panel.thermal,
          panel.shallowWater,
          panel.interleave
        );
        lastStepTime = res.stepTimeMs;
      }

      terrainMesh.updateFromHeightmap(heightmap);

      if (erosionManager.method === "shallow-water" && panel.view.showWater) {
        waterMesh.update(heightmap.data, erosionManager.shallowWater.water, heightmap.resolution);
      } else {
        waterMesh.setVisible(false);
      }

      stepAccumulator += deltaTime;
      if (stepAccumulator > 100) {
        stepAccumulator = 0;
        crossSection.update(
          heightmap,
          erosionManager.method === "shallow-water" ? erosionManager.shallowWater.water : undefined
        );
        telemetry.update(
          erosionManager.getTelemetry(heightmap, lastStepTime),
          erosionManager.getConvergenceHistory()
        );
      }
    }

    viewport.render();
  }

  requestAnimationFrame(animate);
}

window.addEventListener("DOMContentLoaded", () => {
  main().catch((err) => console.error("Initialization error:", err));
});
