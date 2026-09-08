// WebGPU Compute Shader for Grid-Based Shallow Water / Virtual Pipe Erosion
// Implements Mei, Decaudin & Hu (2007) Eulerian fluid dynamics + sediment advection

struct ShallowWaterUniforms {
  resolution: u32,
  dt: f32,
  pipeArea: f32,
  pipeLength: f32,
  gravity: f32,
  rainRate: f32,
  evapRate: f32,
  capacityFactor: f32,
  dissolveRate: f32,
  depositRate: f32,
  minSlope: f32,
  passIndex: u32, // 0: Rain & Flux, 1: Water & Velocity, 2: Erosion/Deposition & Advection
};

@group(0) @binding(0) var<uniform> u: ShallowWaterUniforms;
@group(0) @binding(1) var<storage, read_write> terrain: array<f32>;
@group(0) @binding(2) var<storage, read_write> water: array<f32>;
@group(0) @binding(3) var<storage, read_write> sediment: array<f32>;
@group(0) @binding(4) var<storage, read_write> flux: array<vec4<f32>>; // (left, right, top, bottom)
@group(0) @binding(5) var<storage, read_write> velocity: array<vec2<f32>>;

fn getIdx(x: i32, y: i32) -> i32 {
  let res = i32(u.resolution);
  let cx = clamp(x, 0, res - 1);
  let cy = clamp(y, 0, res - 1);
  return cy * res + cx;
}

// Pass 0: Add Rain and compute Outflow Flux across virtual pipes
@compute @workgroup_size(8, 8)
fn pass0_flux(@builtin(global_invocation_id) id: vec3<u32>) {
  let x = i32(id.x);
  let y = i32(id.y);
  let res = i32(u.resolution);
  if (x >= res || y >= res) { return; }

  let idx = y * res + x;

  // 1. Precipitation
  var w = water[idx] + u.rainRate * u.dt;
  water[idx] = w;

  let b = terrain[idx];
  let hTotal = b + w;

  // 2. Virtual pipe outflow flux
  // Left, Right, Top, Bottom
  let hL = terrain[getIdx(x - 1, y)] + water[getIdx(x - 1, y)];
  let hR = terrain[getIdx(x + 1, y)] + water[getIdx(x + 1, y)];
  let hT = terrain[getIdx(x, y - 1)] + water[getIdx(x, y - 1)];
  let hB = terrain[getIdx(x, y + 1)] + water[getIdx(x, y + 1)];

  var curFlux = flux[idx];
  let factor = u.dt * u.pipeArea * (u.gravity / u.pipeLength);

  var fL = max(0.0, curFlux.x + factor * (hTotal - hL));
  var fR = max(0.0, curFlux.y + factor * (hTotal - hR));
  var fT = max(0.0, curFlux.z + factor * (hTotal - hT));
  var fB = max(0.0, curFlux.w + factor * (hTotal - hB));

  // Boundary condition: zero outflow through border pipes
  if (x == 0) { fL = 0.0; }
  if (x == res - 1) { fR = 0.0; }
  if (y == 0) { fT = 0.0; }
  if (y == res - 1) { fB = 0.0; }

  let sumFlux = fL + fR + fT + fB;
  if (sumFlux > 0.0) {
    let maxOutflow = (w * u.pipeLength * u.pipeLength) / u.dt;
    let k = min(1.0, maxOutflow / sumFlux);
    fL *= k;
    fR *= k;
    fT *= k;
    fB *= k;
  }

  flux[idx] = vec4<f32>(fL, fR, fT, fB);
}

// Pass 1: Update water surface and compute velocity field
@compute @workgroup_size(8, 8)
fn pass1_water(@builtin(global_invocation_id) id: vec3<u32>) {
  let x = i32(id.x);
  let y = i32(id.y);
  let res = i32(u.resolution);
  if (x >= res || y >= res) { return; }

  let idx = y * res + x;

  let fOut = flux[idx];
  let sumOut = fOut.x + fOut.y + fOut.z + fOut.w;

  // Inflow from neighbor cells
  let fInL = flux[getIdx(x - 1, y)].y; // Right flux of left neighbor
  let fInR = flux[getIdx(x + 1, y)].x; // Left flux of right neighbor
  let fInT = flux[getIdx(x, y - 1)].w; // Bottom flux of top neighbor
  let fInB = flux[getIdx(x, y + 1)].z; // Top flux of bottom neighbor
  let sumIn = fInL + fInR + fInT + fInB;

  let dV = u.dt * (sumIn - sumOut);
  var wNew = max(0.0, water[idx] + dV / (u.pipeLength * u.pipeLength));

  // Compute velocity field
  let avgW = max(0.001, (water[idx] + wNew) * 0.5);
  let dWx = (fInL - fOut.x + fOut.y - fInR) * 0.5;
  let dWy = (fInT - fOut.z + fOut.w - fInB) * 0.5;

  let vx = dWx / (avgW * u.pipeLength);
  let vy = dWy / (avgW * u.pipeLength);

  velocity[idx] = vec2<f32>(vx, vy);
  water[idx] = wNew;
}

// Pass 2: Erosion, Deposition, Sediment Advection, and Evaporation
@compute @workgroup_size(8, 8)
fn pass2_erosion(@builtin(global_invocation_id) id: vec3<u32>) {
  let x = i32(id.x);
  let y = i32(id.y);
  let res = i32(u.resolution);
  if (x >= res || y >= res) { return; }

  let idx = y * res + x;
  var b = terrain[idx];
  var s = sediment[idx];
  var w = water[idx];
  let v = velocity[idx];

  // Local slope calculation
  let bL = terrain[getIdx(x - 1, y)];
  let bR = terrain[getIdx(x + 1, y)];
  let bT = terrain[getIdx(x, y - 1)];
  let bB = terrain[getIdx(x, y + 1)];

  let dh_dx = (bR - bL) / (2.0 * u.pipeLength);
  let dh_dy = (bB - bT) / (2.0 * u.pipeLength);
  let slope = max(u.minSlope, sqrt(dh_dx * dh_dx + dh_dy * dh_dy));
  let speed = length(v);

  // Sediment transport capacity C = Kc * speed * sin(alpha)
  let capacity = u.capacityFactor * speed * slope;

  if (s < capacity) {
    let dissolve = u.dissolveRate * (capacity - s);
    b -= dissolve;
    s += dissolve;
  } else {
    let deposit = u.depositRate * (s - capacity);
    b += deposit;
    s -= deposit;
  }

  // Evaporation
  w = max(0.0, w * (1.0 - u.evapRate * u.dt));

  terrain[idx] = b;
  sediment[idx] = s;
  water[idx] = w;
}
