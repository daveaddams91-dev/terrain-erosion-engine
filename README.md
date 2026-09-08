# Physically-Based Procedural Terrain Generator with Hydraulic & Thermal Erosion

[![CI](https://github.com/Raj123-0/terrain-erosion-engine/actions/workflows/ci.yml/badge.svg)](https://github.com/Raj123-0/terrain-erosion-engine/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue.svg)](https://www.typescriptlang.org/)
[![Three.js](https://img.shields.io/badge/Three.js-0.174-black.svg)](https://threejs.org/)
[![WebGPU](https://img.shields.io/badge/WebGPU-Compute_Shaders-orange.svg)](https://www.w3.org/TR/webgpu/)

An interactive, GPU-accelerated procedural landscape synthesis and simulation engine. Instead of relying solely on synthetic fractal noise (such as Perlin or Simplex noise) which produces unphysical, isotropic bumps without drainage, this engine simulates the physical laws of **hydraulic erosion** (water carving dendritic valleys, transporting sediment, and forming alluvial deposition fans) and **thermal erosion** (talus slumping and scree slope stabilization at the angle of repose).

Built with **TypeScript**, **WebGPU Compute Shaders (WGSL)**, **Three.js**, and **Tweakpane**, running at real-time frame rates with interactive controls, 2D cross-section profiling, diff heatmaps, and 16-bit heightmap exporting.

---

## 📸 Overview & Visual Comparison

```
                     ┌────────────────────────────────────────────────────────┐
                     │              Base Procedural Noise (t = 0)             │
                     │  - Random isotropic hills                              │
                     │  - No continuous drainage basins                       │
                     │  - Unnatural slope distributions                       │
                     └───────────────────────────┬────────────────────────────┘
                                                 │
                     ┌───────────────────────────┴────────────────────────────┐
                     │          Hydraulic + Thermal Erosion Simulation        │
                     │  - Fluvial incision carves V-shaped mountain ravines   │
                     │  - Branching dendritic river networks develop          │
                     │  - Talus slumps stabilize scree at angle of repose     │
                     │  - Sediment precipitates into wide alluvial fans       │
                     └───────────────────────────┬────────────────────────────┘
                                                 ▼
                     ┌────────────────────────────────────────────────────────┐
                     │      Physically-Realistic Geological Landscape         │
                     └────────────────────────────────────────────────────────┘
```

> **Comparison Modes**: Use the on-screen toggle bar `[1. Pure Noise]` `[2. Hydraulic Only]` `[3. Thermal Only]` `[4. Combined Realistic]` to directly inspect the geological impact of each simulated process.

---

## 🌊 Scientific Background: Why Noise Isn't Enough

### 1. The Fluvial Defect in Procedural Noise
Fractal noise algorithms (Perlin, Simplex, Worley) compute elevations independently per coordinate:
$$h(x, y) = \sum_{i=0}^{N-1} \gamma^i \cdot \text{noise}(\lambda^i \cdot x, \lambda^i \cdot y)$$
While fractal noise produces self-similar textures, real terrain is sculpted by **water gravity flow**. Raindrops collect into rills, rills coalesce into gullies, and gullies form dendritic river basins that follow continuous downhill gradient paths:
$$\mathbf{v} \propto -\nabla (h + w)$$
Pure noise cannot create continuous downhill drainage networks, V-shaped valleys, or alluvial sediment fans; it creates isolated hollows and uniform bumps.

### 2. Particle / Droplet Hydraulic Erosion (Hans Beyer Model)
Simulates discrete rain droplets flowing continuously across the terrain:
- **Gradient & Momentum**: Droplets steer with inertia:
  $$\mathbf{d}_{t+1} = \mathbf{d}_t \cdot I - \nabla h \cdot (1 - I)$$
- **Sediment Transport Capacity**:
  $$C = K_c \cdot \max(-\Delta h, \text{minSlope}) \cdot v \cdot w$$
- **Erosion & Deposition**:
  - When $s > C$: excess sediment precipitates: $\Delta s = (s - C) \cdot K_{\text{dep}}$.
  - When $s < C$: bedrock dissolves into sediment: $\Delta s = \min((C - s) \cdot K_{\text{erode}}, -\Delta h)$.
- **Kinematics & Evaporation**:
  $$v_{t+1} = \sqrt{v_t^2 + \Delta h \cdot g}, \quad w_{t+1} = w_t \cdot (1 - K_{\text{evap}})$$

### 3. Grid-Based Shallow Water Erosion (Mei, Decaudin & Hu Model)
An Eulerian 2D fluid simulation across the full grid using virtual pipes:
- **Hydrostatic Outflow Flux**:
  $$\Delta H = (h + w)_{\text{cell}} - (h + w)_{\text{neighbor}}$$
  $$f^{t+\Delta t} = \max\left(0, f^t + \Delta t \cdot A \cdot \frac{g \cdot \Delta H}{l}\right)$$
- **Stream Power Capacity**:
  $$C = K_c \cdot |\mathbf{v}| \cdot \sin(\alpha)$$
- **Semi-Lagrangian Sediment Advection**: Suspended sediment is backtraced along the fluid velocity vector field $\mathbf{v}$:
  $$\mathbf{x}_{\text{prev}} = \mathbf{x} - \mathbf{v} \cdot \Delta t, \quad s^{t+\Delta t}(\mathbf{x}) = s^t(\mathbf{x}_{\text{prev}})$$

### 4. Thermal Erosion (Talus Slumping)
Loose granular scree cannot maintain slopes steeper than its angle of repose $\theta_{\text{talus}}$:
$$T_{\text{crit}} = d \cdot \tan(\theta_{\text{talus}})$$
When local elevation difference $\Delta h > T_{\text{crit}}$, unstable rock material avalanches downhill to neighboring lower cells until equilibrium is restored:
$$\Delta V_i = K_{\text{thermal}} \cdot \frac{\Delta h_i - T_{\text{crit}}}{2 \cdot N}$$
Mass is strictly conserved, creating realistic scree aprons at the base of sheer cliffs.

---

## 🚀 Features

- **Dual Hydraulic Erosion Algorithms**:
  - **Droplet particle simulation**: Fast, highly localized gully incision and river carving.
  - **Grid-based shallow water / pipe model**: Continuous 2D Eulerian fluid simulation with live velocity fields and sediment advection.
- **Thermal Erosion**: Talus-angle relaxation with support for spatially varying rock hardness (bedrock cliffs vs. loose alluvial scree).
- **Pass Interleaving**: Simulates alternating passes of rainfall and gravitational weathering.
- **WebGPU Compute Shaders**: High-performance parallel simulation using WGSL compute shaders with automatic CPU fallback.
- **Real-Time 3D Rendering (Three.js)**:
  - Procedural height & slope-aware biome texturing (wet sand, lush grass, mountain forest, scree, sheer granite, snow caps).
  - Dynamic sun lighting, soft shadow maps, and custom normal derivation.
  - Interactive water layer rendering with specular reflections and Fresnel shading.
- **Diagnostics & Visual Analytics**:
  - **2D Cross-Section Elevation Profiler**: Real-time canvas slicing showing initial bedrock silhouette, eroded profile, and water depth.
  - **Diff Heatmap Mode**: Visualizes where material was eroded (red/orange) and deposited (cyan/blue).
  - **Telemetry HUD**: Live FPS, simulation ms/step, throughput (steps/sec), iteration counts, and convergence graph ($\sum |\Delta h|$ per step).
  - **Mass Balance Tracker**: Verifies closed mass conservation.
- **Geological Presets**:
  - *Alpine Glacial Peaks*
  - *Canyonlands & Mesas*
  - *River Basin & Delta*
  - *Badlands & Gully Maze*
- **Heightmap Exporters**:
  - **16-bit Grayscale PNG** (65,536 discrete elevation levels, ideal for Unreal Engine, Unity, Blender).
  - **Float32 RAW binary** format.
  - **Wavefront OBJ 3D mesh** with UV coordinates.

---

## 🛠 Tech Stack & Architecture

```
src/
├── core/
│   ├── prng.ts              # Seedable Mulberry32 PRNG (100% deterministic)
│   ├── noise.ts             # Simplex, Perlin, Ridge, Billow, Domain Warping
│   ├── heightmap.ts         # Float32 grid, bilinear interpolation, analytical normals
│   ├── presets.ts           # Preconfigured geological landscape profiles
│   └── types.ts             # Core simulation parameters & interfaces
├── erosion/
│   ├── droplet-cpu.ts       # Hans Beyer droplet CPU reference implementation
│   ├── droplet-gpu.ts       # WebGPU compute shader droplet driver
│   ├── thermal-erosion.ts   # Talus-angle scree slumping engine
│   ├── shallow-water-erosion.ts # Mei/Decaudin/Hu virtual pipe fluid simulator
│   └── erosion-manager.ts   # Unified coordinator, pass interleaver, telemetry
├── rendering/
│   ├── viewport.ts          # Three.js scene, camera, lights, OrbitControls
│   ├── terrain-mesh.ts      # Dynamic vertex displacement and normal recalculation
│   ├── terrain-material.ts  # Biome shader + diff heatmap + slope angle modes
│   └── water-mesh.ts        # Translucent reflective water surface
├── ui/
│   ├── parameter-panel.ts   # Tweakpane parameter controls and preset manager
│   ├── telemetry-overlay.ts # Performance stats, HUD, and convergence graph
│   ├── cross-section-view.ts# 2D cross-section canvas elevation profiler
│   └── comparison-view.ts   # 4-way comparison bar (Noise vs Hyd vs Therm vs Combined)
├── export/
│   ├── png16-exporter.ts    # Pure TypeScript 16-bit PNG encoder (RFC 1951 DEFLATE)
│   └── raw-exporter.ts      # Float32 binary RAW and Wavefront OBJ exporter
└── shaders/
    ├── droplets.wgsl        # WebGPU compute shader for batched droplet simulation
    ├── thermal.wgsl         # WebGPU compute shader for talus relaxation
    └── shallow-water.wgsl   # WebGPU compute shader for virtual pipe fluid simulation
```

---

## 📦 Getting Started

### Prerequisites
- Node.js 18.0 or newer
- npm 9.0 or newer
- Modern web browser (Chrome, Edge, Firefox, or Safari; WebGPU supported in Chrome 113+, Edge 113+, Safari 18+)

### Installation
```bash
# Clone the repository
git clone https://github.com/Raj123-0/terrain-erosion-engine.git
cd terrain-erosion-engine

# Install dependencies
npm install

# Start local development server
npm run dev
```

Open your browser at `http://localhost:3000` to interact with the simulation.

### Build & Test Commands
```bash
# Run unit tests (15 test suites for noise, PRNG, mass conservation, slope stability)
npm run test

# Type-check TypeScript
npm run typecheck

# Build production bundle
npm run build

# Preview production build locally
npm run preview
```

---

## ⚙️ Parameters Guide

| Parameter | Recommended Range | Description |
| :--- | :--- | :--- |
| **Droplets / Step** | `5,000 – 30,000` | Number of concurrent droplets simulated per frame tick. |
| **Droplet Lifetime** | `20 – 60` | Maximum steps a droplet travels downhill before evaporating. |
| **Inertia** | `0.05 – 0.30` | Momentum blending: higher inertia carries droplets across depressions. |
| **Capacity ($K_c$)** | `2.0 – 8.0` | Maximum sediment volume a fast-moving droplet can transport. |
| **Erode Rate ($K_e$)** | `0.10 – 0.60` | Fraction of deficit sediment carved from bedrock per step. |
| **Deposit Rate ($K_d$)** | `0.10 – 0.60` | Fraction of excess sediment deposited onto terrain per step. |
| **Evaporation Rate** | `0.01 – 0.04` | Fraction of droplet water volume lost per step. |
| **Angle of Repose** | `28° – 45°` | Maximum stable slope angle for thermal erosion; steeper slopes slump. |
| **Rain Rate** | `0.005 – 0.03` | Influx of water per unit time in shallow water simulation. |
| **Virtual Pipe Area** | `0.2 – 0.8` | Cross-sectional area controlling fluid flux between adjacent grid cells. |
| **Interleave Ratio** | `5:1 to 10:1` | Ratio of hydraulic incision passes to thermal slumping passes. |

---

## 🔬 Limitations & Future Extensions

- **Hydraulic Depressions**: Droplets currently fill small depressions up to local thresholds; integrating an explicit depression-filling algorithm (such as Planchon & Darboux priority-flood) would allow large inland lakes to overflow.
- **Underground Seepage / Aquifers**: Adding a porous subsurface Darcy flow layer would allow subterranean water storage and spring formations.
- **Variable Stratigraphy**: Supporting full 3D voxel strata (e.g. alternating sandstone and shale layers) for differential rock resistance.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
