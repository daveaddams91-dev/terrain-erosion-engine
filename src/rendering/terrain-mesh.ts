import * as THREE from "three";
import { Heightmap } from "../core/heightmap";
import { createTerrainMaterial } from "./terrain-material";
import type { RenderViewMode } from "../core/types";

export class TerrainMesh {
  public readonly mesh: THREE.Mesh;
  public readonly geometry: THREE.PlaneGeometry;
  public readonly material: THREE.ShaderMaterial;
  private readonly worldSize: number;
  private currentResolution: number;

  constructor(worldSize = 500, initialResolution = 512) {
    this.worldSize = worldSize;
    this.currentResolution = initialResolution;

    // Plane rotated to horizontal XZ plane
    this.geometry = new THREE.PlaneGeometry(
      worldSize,
      worldSize,
      initialResolution - 1,
      initialResolution - 1
    );
    this.geometry.rotateX(-Math.PI / 2);

    // Add custom diff attribute
    const totalVertices = initialResolution * initialResolution;
    const diffAttr = new THREE.Float32BufferAttribute(new Float32Array(totalVertices), 1);
    this.geometry.setAttribute("aDiff", diffAttr);

    this.material = createTerrainMaterial();
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = true;
  }

  /**
   * Updates vertex positions and analytical normals from the heightmap.
   */
  public updateFromHeightmap(heightmap: Heightmap): void {
    const res = heightmap.resolution;
    const posAttr = this.geometry.attributes.position as THREE.BufferAttribute;
    const normAttr = this.geometry.attributes.normal as THREE.BufferAttribute;
    const diffAttr = this.geometry.attributes.aDiff as THREE.BufferAttribute;
    const posArray = posAttr.array as Float32Array;
    const normArray = normAttr.array as Float32Array;
    const diffArray = diffAttr.array as Float32Array;

    const data = heightmap.data;
    const initialData = heightmap.initialData;
    const dx = this.worldSize / (res - 1);
    const dz = this.worldSize / (res - 1);

    let minH = Infinity;
    let maxH = -Infinity;
    let maxAbsDiff = 0.001;

    for (let y = 0; y < res; y++) {
      const row = y * res;
      for (let x = 0; x < res; x++) {
        const idx = row + x;
        const vIdx = idx * 3;
        const h = data[idx];
        const hInit = initialData[idx];
        const diff = h - hInit;

        if (h < minH) minH = h;
        if (h > maxH) maxH = h;
        const absDiff = Math.abs(diff);
        if (absDiff > maxAbsDiff) maxAbsDiff = absDiff;

        // Position: Y is up
        posArray[vIdx + 1] = h;
        diffArray[idx] = diff;

        // High-precision central difference surface normal:
        // Gradients along X and Z
        const xL = x > 0 ? data[row + x - 1] : h;
        const xR = x < res - 1 ? data[row + x + 1] : h;
        const zT = y > 0 ? data[(y - 1) * res + x] : h;
        const zB = y < res - 1 ? data[(y + 1) * res + x] : h;

        const dHdx = (xR - xL) / (2 * dx);
        const dHdz = (zB - zT) / (2 * dz);

        // Surface normal N = normalize(-dHdx, 1, -dHdz)
        const len = Math.sqrt(dHdx * dHdx + 1.0 + dHdz * dHdz);
        normArray[vIdx] = -dHdx / len;
        normArray[vIdx + 1] = 1.0 / len;
        normArray[vIdx + 2] = -dHdz / len;
      }
    }

    posAttr.needsUpdate = true;
    normAttr.needsUpdate = true;
    diffAttr.needsUpdate = true;
    this.geometry.computeBoundingSphere();
    this.geometry.computeBoundingBox();

    // Update shader uniforms
    const u = this.material.uniforms;
    u.uMinHeight.value = minH;
    u.uMaxHeight.value = maxH;
    u.uMaxDiff.value = Math.max(1.0, maxAbsDiff);
  }

  public setViewMode(mode: RenderViewMode): void {
    const u = this.material.uniforms;
    if (mode === "diff-heatmap") {
      u.uViewMode.value = 1;
      this.material.wireframe = false;
    } else if (mode === "slope-angle") {
      u.uViewMode.value = 2;
      this.material.wireframe = false;
    } else if (mode === "wireframe") {
      u.uViewMode.value = 0;
      this.material.wireframe = true;
    } else {
      u.uViewMode.value = 0;
      this.material.wireframe = false;
    }
  }

  public getResolution(): number {
    return this.currentResolution;
  }
}
