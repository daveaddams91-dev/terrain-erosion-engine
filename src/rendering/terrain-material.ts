import * as THREE from "three";
import type { RenderViewMode } from "../core/types";

export interface TerrainMaterialUniforms {
  uLightDir: { value: THREE.Vector3 };
  uLightColor: { value: THREE.Color };
  uAmbientColor: { value: THREE.Color };
  uMinHeight: { value: number };
  uMaxHeight: { value: number };
  uViewMode: { value: number }; // 0: Shaded Biome, 1: Diff Heatmap, 2: Slope Angle, 3: Wireframe
  uMaxDiff: { value: number };  // Normalization range for diff heatmap
}

export function createTerrainMaterial(): THREE.ShaderMaterial {
  const uniforms: TerrainMaterialUniforms = {
    uLightDir: { value: new THREE.Vector3(0.5, 0.8, 0.4).normalize() },
    uLightColor: { value: new THREE.Color(0xfffaed) },
    uAmbientColor: { value: new THREE.Color(0x28303d) },
    uMinHeight: { value: 0.0 },
    uMaxHeight: { value: 120.0 },
    uViewMode: { value: 0 },
    uMaxDiff: { value: 15.0 }
  };

  const vertexShader = `
    attribute float aDiff;
    varying vec3 vWorldPosition;
    varying vec3 vNormal;
    varying float vHeight;
    varying float vDiff;
    varying vec2 vUv;

    void main() {
      vUv = uv;
      vDiff = aDiff;
      vNormal = normalize(normalMatrix * normal);
      vec4 worldPos = modelMatrix * vec4(position, 1.0);
      vWorldPosition = worldPos.xyz;
      vHeight = position.y;
      gl_Position = projectionMatrix * viewMatrix * worldPos;
    }
  `;

  const fragmentShader = `
    uniform vec3 uLightDir;
    uniform vec3 uLightColor;
    uniform vec3 uAmbientColor;
    uniform float uMinHeight;
    uniform float uMaxHeight;
    uniform int uViewMode;
    uniform float uMaxDiff;

    varying vec3 vWorldPosition;
    varying vec3 vNormal;
    varying float vHeight;
    varying float vDiff;
    varying vec2 vUv;

    // Biome palette definitions
    const vec3 C_SAND      = vec3(0.82, 0.74, 0.58);
    const vec3 C_GRASS     = vec3(0.28, 0.52, 0.22);
    const vec3 C_FOREST    = vec3(0.18, 0.36, 0.16);
    const vec3 C_SCREE     = vec3(0.48, 0.44, 0.40);
    const vec3 C_ROCK      = vec3(0.32, 0.30, 0.28);
    const vec3 C_DARK_ROCK = vec3(0.20, 0.19, 0.18);
    const vec3 C_SNOW      = vec3(0.96, 0.98, 1.00);

    vec3 computeBiomeColor(float hNorm, float slope) {
      // Slope factor: 0 = completely flat, 1 = vertical cliff
      float cliffFactor = smoothstep(0.32, 0.65, slope);

      // Height layers
      vec3 flatColor;
      if (hNorm < 0.12) {
        flatColor = mix(C_SAND, C_GRASS, smoothstep(0.04, 0.12, hNorm));
      } else if (hNorm < 0.45) {
        flatColor = mix(C_GRASS, C_FOREST, smoothstep(0.12, 0.45, hNorm));
      } else if (hNorm < 0.72) {
        flatColor = mix(C_FOREST, C_SCREE, smoothstep(0.45, 0.72, hNorm));
      } else {
        flatColor = mix(C_SCREE, C_SNOW, smoothstep(0.72, 0.92, hNorm));
      }

      // Steep slopes expose rock instead of vegetation/snow
      vec3 rockColor = mix(C_SCREE, C_DARK_ROCK, smoothstep(0.4, 0.8, slope));
      vec3 surfaceColor = mix(flatColor, rockColor, cliffFactor);

      // High altitude snow accumulation even on moderate slopes
      if (hNorm > 0.82 && slope < 0.55) {
        float snowBlend = smoothstep(0.82, 0.95, hNorm) * (1.0 - smoothstep(0.3, 0.55, slope));
        surfaceColor = mix(surfaceColor, C_SNOW, snowBlend);
      }

      return surfaceColor;
    }

    vec3 computeDiffHeatmap(float diff, float maxDiff) {
      float dNorm = clamp(diff / max(0.001, maxDiff), -1.0, 1.0);
      vec3 neutral = vec3(0.18, 0.20, 0.24);

      if (dNorm < 0.0) {
        // Erosion (loss): orange to high-intensity red
        float t = -dNorm;
        vec3 midErode = vec3(1.0, 0.55, 0.0);
        vec3 maxErode = vec3(0.95, 0.05, 0.12);
        return mix(neutral, mix(midErode, maxErode, t), smoothstep(0.02, 0.9, t));
      } else {
        // Deposition (gain): cyan to deep cobalt blue
        float t = dNorm;
        vec3 midDep = vec3(0.0, 0.85, 0.95);
        vec3 maxDep = vec3(0.1, 0.35, 0.95);
        return mix(neutral, mix(midDep, maxDep, t), smoothstep(0.02, 0.9, t));
      }
    }

    vec3 computeSlopeAngleColor(float slope) {
      // 0 deg (flat) = Green, ~35 deg (repose) = Yellow/Orange, 60+ deg = Red
      if (slope < 0.45) {
        return mix(vec3(0.1, 0.8, 0.2), vec3(0.9, 0.85, 0.1), slope / 0.45);
      } else {
        return mix(vec3(0.9, 0.85, 0.1), vec3(0.95, 0.15, 0.1), (slope - 0.45) / 0.55);
      }
    }

    void main() {
      vec3 normal = normalize(vNormal);
      float slope = 1.0 - clamp(normal.y, 0.0, 1.0);
      float hRange = max(0.001, uMaxHeight - uMinHeight);
      float hNorm = clamp((vHeight - uMinHeight) / hRange, 0.0, 1.0);

      vec3 baseColor;
      if (uViewMode == 1) {
        baseColor = computeDiffHeatmap(vDiff, uMaxDiff);
      } else if (uViewMode == 2) {
        baseColor = computeSlopeAngleColor(slope);
      } else {
        baseColor = computeBiomeColor(hNorm, slope);
      }

      // Lighting model: Lambert diffuse + subtle wrap-around + ambient
      vec3 L = normalize(uLightDir);
      float NdotL = max(0.0, dot(normal, L));
      float wrapNdotL = max(0.0, (dot(normal, L) + 0.25) / 1.25);

      vec3 diffuse = uLightColor * wrapNdotL;
      vec3 ambient = uAmbientColor;

      // Subtle specular glint for rock and snow
      vec3 V = normalize(cameraPosition - vWorldPosition);
      vec3 H = normalize(L + V);
      float spec = pow(max(0.0, dot(normal, H)), 24.0) * 0.15 * (1.0 - slope * 0.5);

      vec3 finalColor = baseColor * (ambient + diffuse) + vec3(spec);
      gl_FragColor = vec4(finalColor, 1.0);
    }
  `;

  return new THREE.ShaderMaterial({
    uniforms: uniforms as unknown as Record<string, THREE.IUniform>,
    vertexShader,
    fragmentShader,
    side: THREE.DoubleSide
  });
}
