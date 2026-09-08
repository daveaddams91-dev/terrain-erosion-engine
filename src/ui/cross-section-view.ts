import { Heightmap } from "../core/heightmap";

export class CrossSectionView {
  public readonly container: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  public axis: "x" | "y" = "x";
  public slicePos = 0.5; // Normalized coordinate [0..1]
  public visible = true;

  constructor(parent: HTMLElement) {
    this.container = document.createElement("div");
    this.container.className = "cross-section-panel";
    this.container.innerHTML = `
      <div class="panel-header">
        <span class="panel-title">2D Elevation Cross-Section</span>
        <div class="panel-controls">
          <label><input type="radio" name="sliceAxis" value="x" checked /> X-Slice</label>
          <label><input type="radio" name="sliceAxis" value="y" /> Y-Slice</label>
          <input type="range" class="slice-slider" min="0" max="1" step="0.01" value="0.5" />
        </div>
      </div>
      <canvas class="cross-section-canvas" width="480" height="150"></canvas>
      <div class="cross-section-legend">
        <span class="legend-item"><span class="color-box initial"></span> Initial Bedrock</span>
        <span class="legend-item"><span class="color-box eroded"></span> Eroded Bedrock</span>
        <span class="legend-item"><span class="color-box water"></span> Water Surface</span>
      </div>
    `;
    parent.appendChild(this.container);

    this.canvas = this.container.querySelector("canvas")!;
    this.ctx = this.canvas.getContext("2d")!;

    // Setup input listeners
    const axisRadios = this.container.querySelectorAll<HTMLInputElement>('input[name="sliceAxis"]');
    axisRadios.forEach((radio) => {
      radio.addEventListener("change", (e) => {
        this.axis = (e.target as HTMLInputElement).value as "x" | "y";
      });
    });

    const slider = this.container.querySelector<HTMLInputElement>(".slice-slider")!;
    slider.addEventListener("input", (e) => {
      this.slicePos = parseFloat((e.target as HTMLInputElement).value);
    });
  }

  public setVisible(visible: boolean): void {
    this.visible = visible;
    this.container.style.display = visible ? "block" : "none";
  }

  public update(heightmap: Heightmap, waterData?: Float32Array): void {
    if (!this.visible) return;

    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const res = heightmap.resolution;

    ctx.clearRect(0, 0, w, h);

    // Background gradient
    const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
    bgGrad.addColorStop(0, "#161b22");
    bgGrad.addColorStop(1, "#0d1117");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    // Subtle grid lines
    ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
    ctx.lineWidth = 1;
    for (let gy = 0; gy < h; gy += 30) {
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.lineTo(w, gy);
      ctx.stroke();
    }

    const sliceIdx = Math.max(0, Math.min(res - 1, Math.floor(this.slicePos * (res - 1))));

    // Determine vertical scale range
    const { min, max } = heightmap.getElevationRange();
    const hRange = Math.max(10.0, max - min + 20.0);
    const padding = 15;
    const plotH = h - padding * 2;

    const getY = (val: number) => {
      const norm = (val - min) / hRange;
      return h - padding - norm * plotH;
    };

    // 1. Draw Initial Pre-Erosion Profile (Dashed Line)
    ctx.beginPath();
    ctx.strokeStyle = "#8b949e";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);

    for (let i = 0; i < res; i++) {
      const gridX = this.axis === "x" ? i : sliceIdx;
      const gridY = this.axis === "x" ? sliceIdx : i;
      const idx = gridY * res + gridX;
      const elev = heightmap.initialData[idx];
      const px = (i / (res - 1)) * w;
      const py = getY(elev);

      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // 2. Draw Post-Erosion Bedrock Fill
    ctx.beginPath();
    ctx.moveTo(0, h);

    for (let i = 0; i < res; i++) {
      const gridX = this.axis === "x" ? i : sliceIdx;
      const gridY = this.axis === "x" ? sliceIdx : i;
      const idx = gridY * res + gridX;
      const elev = heightmap.data[idx];
      const px = (i / (res - 1)) * w;
      const py = getY(elev);

      ctx.lineTo(px, py);
    }
    ctx.lineTo(w, h);
    ctx.closePath();

    const terrainGrad = ctx.createLinearGradient(0, 0, 0, h);
    terrainGrad.addColorStop(0, "#4d5b6a");
    terrainGrad.addColorStop(1, "#21262d");
    ctx.fillStyle = terrainGrad;
    ctx.fill();

    ctx.strokeStyle = "#58a6ff";
    ctx.lineWidth = 2;
    ctx.stroke();

    // 3. Draw Water Profile (if present)
    if (waterData) {
      let hasWater = false;
      ctx.beginPath();
      for (let i = 0; i < res; i++) {
        const gridX = this.axis === "x" ? i : sliceIdx;
        const gridY = this.axis === "x" ? sliceIdx : i;
        const idx = gridY * res + gridX;
        const elev = heightmap.data[idx];
        const wDepth = waterData[idx];

        if (wDepth > 0.05) {
          hasWater = true;
          const px = (i / (res - 1)) * w;
          const py = getY(elev + wDepth);
          if (!hasWater) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
      }

      if (hasWater) {
        ctx.strokeStyle = "#38bdf8";
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }
    }
  }
}
