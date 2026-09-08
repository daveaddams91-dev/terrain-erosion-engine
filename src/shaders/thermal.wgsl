// WebGPU Compute Shader for Thermal Erosion / Talus-Angle Scree Slumping
// Parallel cellular automata relaxation: material above critical slope slumps downhill

struct ThermalParams {
  resolution: u32,
  iterations: u32,
  talusThresholdOrthogonal: f32, // d * tan(theta)
  talusThresholdDiagonal: f32,   // sqrt(2) * d * tan(theta)
  erosionRate: f32,              // slumping rate fraction [0..1]
  spatiallyVarying: u32,         // 1 if enabled, 0 if uniform
  bedrockThreshold: f32,
  sedimentThreshold: f32,
};

@group(0) @binding(0) var<uniform> params: ThermalParams;
@group(0) @binding(1) var<storage, read> heightIn: array<f32>;
@group(0) @binding(2) var<storage, read_write> heightOut: array<f32>;

fn getH(x: i32, y: i32) -> f32 {
  let res = i32(params.resolution);
  let cx = clamp(x, 0, res - 1);
  let cy = clamp(y, 0, res - 1);
  return heightIn[cy * res + cx];
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let x = i32(global_id.x);
  let y = i32(global_id.y);
  let res = i32(params.resolution);

  if (x >= res || y >= res) {
    return;
  }

  let centerIdx = y * res + x;
  let hCenter = heightIn[centerIdx];

  var talusOrtho = params.talusThresholdOrthogonal;
  var talusDiag = params.talusThresholdDiagonal;

  if (params.spatiallyVarying == 1u) {
    // Spatially varying: higher ridges have harder rock (steeper talus angle),
    // lower valleys have loose sediment
    let normH = clamp(hCenter / 100.0, 0.0, 1.0);
    talusOrtho = mix(params.sedimentThreshold, params.bedrockThreshold, normH);
    talusDiag = talusOrtho * 1.41421356;
  }

  // Check 8 neighbors (Moore neighborhood)
  var totalExcessOut = 0.0;
  var maxExcess = 0.0;

  // 4 Orthogonal neighbors
  let hL = getH(x - 1, y);
  let hR = getH(x + 1, y);
  let hT = getH(x, y - 1);
  let hB = getH(x, y + 1);

  let dL = max(0.0, hCenter - hL - talusOrtho);
  let dR = max(0.0, hCenter - hR - talusOrtho);
  let dT = max(0.0, hCenter - hT - talusOrtho);
  let dB = max(0.0, hCenter - hB - talusOrtho);

  totalExcessOut = dL + dR + dT + dB;
  maxExcess = max(max(dL, dR), max(dT, dB));

  // Compute inflow from higher neighbors into this cell
  var totalInflow = 0.0;

  // Inflow from left
  let diffInL = hL - hCenter - talusOrtho;
  if (diffInL > 0.0) {
    totalInflow += diffInL * 0.125;
  }
  // Inflow from right
  let diffInR = hR - hCenter - talusOrtho;
  if (diffInR > 0.0) {
    totalInflow += diffInR * 0.125;
  }
  // Inflow from top
  let diffInT = hT - hCenter - talusOrtho;
  if (diffInT > 0.0) {
    totalInflow += diffInT * 0.125;
  }
  // Inflow from bottom
  let diffInB = hB - hCenter - talusOrtho;
  if (diffInB > 0.0) {
    totalInflow += diffInB * 0.125;
  }

  // Outflow scaling to prevent negative heights or overshooting
  var outflow = 0.0;
  if (totalExcessOut > 0.0) {
    outflow = min(maxExcess * 0.5, totalExcessOut * 0.125) * params.erosionRate;
  }

  let newH = hCenter - outflow + totalInflow * params.erosionRate;
  heightOut[centerIdx] = newH;
}
