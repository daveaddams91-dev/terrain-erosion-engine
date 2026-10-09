// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Heightmap } from "../../src/core/heightmap";
import { RawExporter } from "../../src/export/raw-exporter";

describe("RawExporter", () => {
  let heightmap: Heightmap;

  beforeEach(() => {
    heightmap = new Heightmap(4);
    // Fill with some basic data
    for (let i = 0; i < 4 * 4; i++) {
      heightmap.data[i] = i * 2.5;
    }

    // Mock URL methods
    global.URL.createObjectURL = vi.fn(() => "blob:mock-url");
    global.URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("downloadRaw exports raw Float32Array and triggers download", () => {
    const mockAnchor = document.createElement("a");
    const clickSpy = vi.spyOn(mockAnchor, "click").mockImplementation(() => {});

    const createElementSpy = vi.spyOn(document, "createElement").mockReturnValue(mockAnchor);
    const appendChildSpy = vi.spyOn(document.body, "appendChild");
    const removeChildSpy = vi.spyOn(document.body, "removeChild");

    RawExporter.downloadRaw(heightmap, "test.raw");

    expect(createElementSpy).toHaveBeenCalledWith("a");
    expect(mockAnchor.href).toMatch(/^blob:/);
    expect(mockAnchor.download).toBe("test.raw");
    expect(appendChildSpy).toHaveBeenCalledWith(mockAnchor);
    expect(clickSpy).toHaveBeenCalled();
    expect(removeChildSpy).toHaveBeenCalledWith(mockAnchor);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
  });

  it("downloadOBJ exports OBJ mesh and triggers download", () => {
    const mockAnchor = document.createElement("a");
    const clickSpy = vi.spyOn(mockAnchor, "click").mockImplementation(() => {});

    const createElementSpy = vi.spyOn(document, "createElement").mockReturnValue(mockAnchor);
    const appendChildSpy = vi.spyOn(document.body, "appendChild");
    const removeChildSpy = vi.spyOn(document.body, "removeChild");

    RawExporter.downloadOBJ(heightmap, 500, "test.obj");

    expect(createElementSpy).toHaveBeenCalledWith("a");
    expect(mockAnchor.href).toMatch(/^blob:/);
    expect(mockAnchor.download).toBe("test.obj");
    expect(appendChildSpy).toHaveBeenCalledWith(mockAnchor);
    expect(clickSpy).toHaveBeenCalled();
    expect(removeChildSpy).toHaveBeenCalledWith(mockAnchor);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
  });
});
