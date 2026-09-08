import type { TelemetryData } from "../core/types";

export class TelemetryOverlay {
  public readonly container: HTMLElement;
  private readonly statsList: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;

  constructor(parent: HTMLElement) {
    this.container = document.createElement("div");
    this.container.className = "telemetry-overlay";
    this.container.innerHTML = `
      <div class="telemetry-header">Simulation Telemetry & Convergence</div>
      <div class="telemetry-stats"></div>
      <div class="telemetry-chart-label">Terrain Change / Step (Convergence)</div>
      <canvas class="telemetry-canvas" width="260" height="70"></canvas>
    `;
    parent.appendChild(this.container);

    this.statsList = this.container.querySelector(".telemetry-stats")!;
    this.canvas = this.container.querySelector("canvas")!;
    this.ctx = this.canvas.getContext("2d")!;
  }

  public update(data: TelemetryData, history: number[]): void {
    this.statsList.innerHTML = `
      <div class="stat-row"><span class="stat-label">Frame Rate:</span><span class="stat-val">${data.fps.toFixed(0)} FPS</span></div>
      <div class="stat-row"><span class="stat-label">Step Time:</span><span class="stat-val">${data.stepTimeMs.toFixed(1)} ms</span></div>
      <div class="stat-row"><span class="stat-label">Throughput:</span><span class="stat-val">${data.stepsPerSec.toFixed(1)} steps/s</span></div>
      <div class="stat-row"><span class="stat-label">Iterations:</span><span class="stat-val">${data.totalIterations}</span></div>
      <div class="stat-row"><span class="stat-label">Resolution:</span><span class="stat-val">${data.resolution}×${data.resolution}</span></div>
      <div class="stat-row"><span class="stat-label">Compute Backend:</span><span class="stat-val badge">${data.backend}</span></div>
      <div class="stat-row"><span class="stat-label">Mass Balance Δ:</span><span class="stat-val">${data.massBalanceError.toFixed(2)} units</span></div>
    `;

    // Draw Convergence Graph
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = "rgba(13, 17, 23, 0.85)";
    ctx.fillRect(0, 0, w, h);

    if (history.length < 2) return;

    // Determine max value in history
    let maxVal = 0.001;
    for (let i = 0; i < history.length; i++) {
      if (history[i] > maxVal) maxVal = history[i];
    }

    const pad = 6;
    const plotW = w - pad * 2;
    const plotH = h - pad * 2;

    ctx.beginPath();
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 1.8;

    for (let i = 0; i < history.length; i++) {
      const px = pad + (i / (history.length - 1)) * plotW;
      const normY = history[i] / maxVal;
      const py = h - pad - normY * plotH;

      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // Subtle area fill under convergence curve
    ctx.lineTo(pad + plotW, h - pad);
    ctx.lineTo(pad, h - pad);
    ctx.closePath();
    ctx.fillStyle = "rgba(56, 189, 248, 0.15)";
    ctx.fill();
  }
}
