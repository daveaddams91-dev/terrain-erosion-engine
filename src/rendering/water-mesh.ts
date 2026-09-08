import * as THREE from "three";

export class WaterMesh {
  public readonly mesh: THREE.Mesh;
  public readonly geometry: THREE.PlaneGeometry;
  public readonly material: THREE.ShaderMaterial;
  private readonly worldSize: number;

  constructor(worldSize = 500, resolution = 256) {
    this.worldSize = worldSize;
    this.geometry = new THREE.PlaneGeometry(
      worldSize,
      worldSize,
      resolution - 1,
      resolution - 1
    );
    this.geometry.rotateX(-Math.PI / 2);

    const vertexShader = `
      varying vec3 vWorldPosition;
      varying vec3 vNormal;
      varying vec2 vUv;

      void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPos.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `;

    const fragmentShader = `
      uniform vec3 uSunDir;
      uniform vec3 uWaterDeepColor;
      uniform vec3 uWaterShallowColor;
      uniform float uTime;

      varying vec3 vWorldPosition;
      varying vec3 vNormal;
      varying vec2 vUv;

      void main() {
        vec3 N = normalize(vNormal);
        vec3 L = normalize(uSunDir);
        vec3 V = normalize(cameraPosition - vWorldPosition);

        // Fresnel term
        float fresnel = pow(1.0 - max(0.0, dot(N, V)), 3.0);

        // Subtle specular highlight
        vec3 H = normalize(L + V);
        float spec = pow(max(0.0, dot(N, H)), 64.0) * 0.8;

        vec3 waterColor = mix(uWaterShallowColor, uWaterDeepColor, 0.6);
        vec3 col = mix(waterColor, vec3(0.85, 0.95, 1.0), fresnel * 0.5) + vec3(spec);

        gl_FragColor = vec4(col, 0.68);
      }
    `;

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uSunDir: { value: new THREE.Vector3(0.5, 0.8, 0.4).normalize() },
        uWaterDeepColor: { value: new THREE.Color(0x0e4d7a) },
        uWaterShallowColor: { value: new THREE.Color(0x38bdf8) },
        uTime: { value: 0 }
      },
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide
    });

    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.visible = false;
  }

  /**
   * Updates water mesh vertex Y coordinates based on terrain elevation + water height.
   */
  public update(
    terrainData: Float32Array,
    waterData: Float32Array,
    res: number,
    minRenderThreshold = 0.05
  ): void {
    const posAttr = this.geometry.attributes.position as THREE.BufferAttribute;
    const posArray = posAttr.array as Float32Array;

    let hasWater = false;
    const total = res * res;
    for (let i = 0; i < total; i++) {
      const w = waterData[i];
      const h = terrainData[i];
      const vIdx = i * 3;

      if (w > minRenderThreshold) {
        posArray[vIdx + 1] = h + w;
        hasWater = true;
      } else {
        // Drop below terrain so thin water film does not z-fight
        posArray[vIdx + 1] = h - 2.0;
      }
    }

    posAttr.needsUpdate = true;
    this.geometry.computeVertexNormals();
    this.mesh.visible = hasWater;
  }

  public setVisible(visible: boolean): void {
    this.mesh.visible = visible;
  }
}
