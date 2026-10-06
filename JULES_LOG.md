### 2026-10-04 Optimized CPU Droplet Erosion Loop
Optimized the inner loop of `DropletErosionCPU.simulate` in `src/erosion/droplet-cpu.ts`. Replaced slow `Math.floor` calls with bitwise float-to-int truncations (`| 0`) and eliminated redundant `Math.min` boundary checks for spatial array lookups, relying on existing grid-exit checks. These changes improved single-core hydraulic droplet simulation throughput from ~10,000 droplets/sec to ~25,000 droplets/sec in microbenchmarks.

### 2026-10-05: Performance Optimization - Droplet CPU Brush Initialization

Optimized the `initBrush` function in `DropletErosionCPU` to pre-compute a single origin-centered brush instead of generating an absolute grid of brush offsets for every single cell. This reduces initialization overhead from (N^2 * R^2)$ to (R^2)$, bringing setup time for a 512x512 grid down from ~1100ms to <1ms and dropping simulation time for benchmarked configurations from ~640ms to ~230ms.
