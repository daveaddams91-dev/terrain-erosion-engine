// WebGPU Compute Shader for Batched Parallel Droplet Erosion
// Uses fixed-point atomics to allow thousands of droplets to erode and deposit
// simultaneously across the terrain grid without race conditions.

struct SimParams {
  resolution: u32,
  maxLifetime: u32,
  numDroplets: u32,
  seed: u32,
  inertia: f32,
  sedimentCapacityFactor: f32,
  minSedimentCapacity: f32,
  depositSpeed: f32,
  erodeSpeed: f32,
  evaporateSpeed: f32,
  gravity: f32,
  minSlope: f32,
  initialWater: f32,
  initialVelocity: f32,
  fixedPointScale: f32, // e.g. 1000.0 for fixed-point atomic conversion
};

@group(0) @binding(0) var<uniform> params: SimParams;
@group(0) @binding(1) var<storage, read> terrainIn: array<f32>;
@group(0) @binding(2) var<storage, read_write> terrainFixed: array<atomic<i32>>;

// Fast hash-based PRNG for each GPU thread
fn hash(s: u32) -> u32 {
  var x = s;
  x ^= x >> 16u;
  x *= 0x7feb352du;
  x ^= x >> 15u;
  x *= 0x846ca68bu;
  x ^= x >> 16u;
  return x;
}

fn randFloat(state: ptr<function, u32>) -> f32 {
  *state = hash(*state + 0x9e3779b9u);
  return f32(*state) / 4294967296.0;
}

fn getHeight(x: u32, y: u32) -> f32 {
  let cx = clamp(x, 0u, params.resolution - 1u);
  let cy = clamp(y, 0u, params.resolution - 1u);
  let idx = cy * params.resolution + cx;
  // Read current accumulated height from atomic fixed-point buffer
  let fixedVal = atomicLoad(&terrainFixed[idx]);
  return f32(fixedVal) / params.fixedPointScale;
}

fn atomicAddHeight(x: u32, y: u32, delta: f32) {
  let cx = clamp(x, 0u, params.resolution - 1u);
  let cy = clamp(y, 0u, params.resolution - 1u);
  let idx = cy * params.resolution + cx;
  let fixedDelta = i32(delta * params.fixedPointScale);
  atomicAdd(&terrainFixed[idx], fixedDelta);
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let dropletId = global_id.x;
  if (dropletId >= params.numDroplets) {
    return;
  }

  var rngState = params.seed + dropletId * 1973u;
  let res = params.resolution;
  let resF = f32(res);

  // Spawn droplet at pseudo-random grid position
  var posX = randFloat(&rngState) * (resF - 1.0);
  var posY = randFloat(&rngState) * (resF - 1.0);
  var dirX = 0.0;
  var dirY = 0.0;
  var speed = params.initialVelocity;
  var water = params.initialWater;
  var sediment = 0.0;

  var lastNodeX = u32(posX);
  var lastNodeY = u32(posY);
  var lastOffX = posX - f32(lastNodeX);
  var lastOffY = posY - f32(lastNodeY);
  var exited = false;

  for (var step = 0u; step < params.maxLifetime; step = step + 1u) {
    let nodeX = u32(posX);
    let nodeY = u32(posY);
    let cellOffsetX = posX - f32(nodeX);
    let cellOffsetY = posY - f32(nodeY);

    lastNodeX = nodeX;
    lastNodeY = nodeY;
    lastOffX = cellOffsetX;
    lastOffY = cellOffsetY;

    let h00 = getHeight(nodeX, nodeY);
    let h10 = getHeight(nodeX + 1u, nodeY);
    let h01 = getHeight(nodeX, nodeY + 1u);
    let h11 = getHeight(nodeX + 1u, nodeY + 1u);

    // Bilinear surface gradient
    let gradX = (h10 - h00) * (1.0 - cellOffsetY) + (h11 - h01) * cellOffsetY;
    let gradY = (h01 - h00) * (1.0 - cellOffsetX) + (h11 - h10) * cellOffsetX;
    let currentHeight =
      h00 * (1.0 - cellOffsetX) * (1.0 - cellOffsetY) +
      h10 * cellOffsetX * (1.0 - cellOffsetY) +
      h01 * (1.0 - cellOffsetX) * cellOffsetY +
      h11 * cellOffsetX * cellOffsetY;

    // Momentum / inertia
    dirX = dirX * params.inertia - gradX * (1.0 - params.inertia);
    dirY = dirY * params.inertia - gradY * (1.0 - params.inertia);

    let len = sqrt(dirX * dirX + dirY * dirY);
    if (len > 0.00001) {
      dirX /= len;
      dirY /= len;
    }

    posX += dirX;
    posY += dirY;

    if (posX < 0.0 || posX >= resF - 1.0 || posY < 0.0 || posY >= resF - 1.0) {
      exited = true;
      break;
    }

    let newNodeX = u32(posX);
    let newNodeY = u32(posY);
    let newOffX = posX - f32(newNodeX);
    let newOffY = posY - f32(newNodeY);

    let nh00 = getHeight(newNodeX, newNodeY);
    let nh10 = getHeight(newNodeX + 1u, newNodeY);
    let nh01 = getHeight(newNodeX, newNodeY + 1u);
    let nh11 = getHeight(newNodeX + 1u, newNodeY + 1u);

    let newHeight =
      nh00 * (1.0 - newOffX) * (1.0 - newOffY) +
      nh10 * newOffX * (1.0 - newOffY) +
      nh01 * (1.0 - newOffX) * newOffY +
      nh11 * newOffX * newOffY;

    let deltaHeight = newHeight - currentHeight;
    let slope = max(-deltaHeight, params.minSlope);
    let sedimentCapacity = max(
      params.minSedimentCapacity,
      slope * speed * water * params.sedimentCapacityFactor
    );

    if (sediment > sedimentCapacity || deltaHeight > 0.0) {
      var depositAmount = 0.0;
      if (deltaHeight > 0.0) {
        depositAmount = min(deltaHeight, sediment);
      } else {
        depositAmount = (sediment - sedimentCapacity) * params.depositSpeed;
      }

      sediment -= depositAmount;

      atomicAddHeight(nodeX, nodeY, depositAmount * (1.0 - cellOffsetX) * (1.0 - cellOffsetY));
      atomicAddHeight(nodeX + 1u, nodeY, depositAmount * cellOffsetX * (1.0 - cellOffsetY));
      atomicAddHeight(nodeX, nodeY + 1u, depositAmount * (1.0 - cellOffsetX) * cellOffsetY);
      atomicAddHeight(nodeX + 1u, nodeY + 1u, depositAmount * cellOffsetX * cellOffsetY);
    } else {
      let erosionAmount = min(
        (sedimentCapacity - sediment) * params.erodeSpeed,
        -deltaHeight
      );

      if (erosionAmount > 0.0) {
        atomicAddHeight(nodeX, nodeY, -erosionAmount * (1.0 - cellOffsetX) * (1.0 - cellOffsetY));
        atomicAddHeight(nodeX + 1u, nodeY, -erosionAmount * cellOffsetX * (1.0 - cellOffsetY));
        atomicAddHeight(nodeX, nodeY + 1u, -erosionAmount * (1.0 - cellOffsetX) * cellOffsetY);
        atomicAddHeight(nodeX + 1u, nodeY + 1u, -erosionAmount * cellOffsetX * cellOffsetY);
        sediment += erosionAmount;
      }
    }

    speed = sqrt(max(0.0, speed * speed + deltaHeight * params.gravity));
    water *= (1.0 - params.evaporateSpeed);

    if (water < 0.001) {
      break;
    }
  }

  // Settle remaining sediment
  if (!exited && sediment > 0.0) {
    atomicAddHeight(lastNodeX, lastNodeY, sediment * (1.0 - lastOffX) * (1.0 - lastOffY));
    atomicAddHeight(lastNodeX + 1u, lastNodeY, sediment * lastOffX * (1.0 - lastOffY));
    atomicAddHeight(lastNodeX, lastNodeY + 1u, sediment * (1.0 - lastOffX) * lastOffY);
    atomicAddHeight(lastNodeX + 1u, lastNodeY + 1u, sediment * lastOffX * lastOffY);
  }
}
