import { Heightmap } from "../core/heightmap";

export type ComparisonStage = "noise-only" | "hydraulic-only" | "thermal-only" | "combined";

export interface ComparisonCallbacks {
  onSelectStage: (stage: ComparisonStage) => void;
  onRunComparisonSuite: () => void;
}

export class ComparisonView {
  public readonly container: HTMLElement;
  public activeStage: ComparisonStage = "combined";

  public noiseOnly: Float32Array | null = null;
  public hydraulicOnly: Float32Array | null = null;
  public thermalOnly: Float32Array | null = null;
  public combined: Float32Array | null = null;

  constructor(parent: HTMLElement, callbacks: ComparisonCallbacks) {
    this.container = document.createElement("div");
    this.container.className = "comparison-bar";
    this.container.innerHTML = `
      <div class="comp-title">Erosion Impact Comparison:</div>
      <div class="comp-buttons">
        <button class="comp-btn" data-stage="noise-only">1. Pure Noise</button>
        <button class="comp-btn" data-stage="hydraulic-only">2. Hydraulic Only</button>
        <button class="comp-btn" data-stage="thermal-only">3. Thermal Only</button>
        <button class="comp-btn active" data-stage="combined">4. Combined Realistic</button>
      </div>
      <button class="comp-run-btn">⚡ Run 4-Way Comparison Suite</button>
    `;
    parent.appendChild(this.container);

    const buttons = this.container.querySelectorAll<HTMLButtonElement>(".comp-btn");
    buttons.forEach((btn) => {
      btn.addEventListener("click", () => {
        buttons.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        const stage = btn.dataset.stage as ComparisonStage;
        this.activeStage = stage;
        callbacks.onSelectStage(stage);
      });
    });

    const runBtn = this.container.querySelector<HTMLButtonElement>(".comp-run-btn")!;
    runBtn.addEventListener("click", () => {
      callbacks.onRunComparisonSuite();
    });
  }

  public storeSnapshot(stage: ComparisonStage, heightmap: Heightmap): void {
    const copy = new Float32Array(heightmap.data.length);
    copy.set(heightmap.data);
    if (stage === "noise-only") this.noiseOnly = copy;
    else if (stage === "hydraulic-only") this.hydraulicOnly = copy;
    else if (stage === "thermal-only") this.thermalOnly = copy;
    else if (stage === "combined") this.combined = copy;
  }

  public setActiveButton(stage: ComparisonStage): void {
    const buttons = this.container.querySelectorAll<HTMLButtonElement>(".comp-btn");
    buttons.forEach((btn) => {
      if (btn.dataset.stage === stage) btn.classList.add("active");
      else btn.classList.remove("active");
    });
    this.activeStage = stage;
  }
}
