import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Heightmap } from "../../src/core/heightmap";
import { PNG16Exporter } from "../../src/export/png16-exporter";

// @vitest-environment jsdom

describe("PNG16Exporter", () => {
  let heightmap: Heightmap;

  beforeEach(() => {
    heightmap = new Heightmap(32);
    // Fill with some data
    for (let i = 0; i < 32 * 32; i++) {
      heightmap.data[i] = i * 0.1;
    }

    // Mock URL methods
    global.URL.createObjectURL = vi.fn(() => "blob:mock-url");
    global.URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("exports a valid Blob for 16-bit PNG", () => {
    const blob = PNG16Exporter.export(heightmap);

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("image/png");
    expect(blob.size).toBeGreaterThan(0);
  });

  it("triggers download by creating an anchor element", () => {
    const mockAnchor = document.createElement("a");
    const clickSpy = vi.spyOn(mockAnchor, "click").mockImplementation(() => {});

    const createElementSpy = vi.spyOn(document, "createElement").mockReturnValue(mockAnchor);
    const appendChildSpy = vi.spyOn(document.body, "appendChild");
    const removeChildSpy = vi.spyOn(document.body, "removeChild");

    PNG16Exporter.download(heightmap, "test.png");

    expect(createElementSpy).toHaveBeenCalledWith("a");
    expect(mockAnchor.href).toMatch(/^blob:/);
    expect(mockAnchor.download).toBe("test.png");
    expect(appendChildSpy).toHaveBeenCalledWith(mockAnchor);
    expect(clickSpy).toHaveBeenCalled();
    expect(removeChildSpy).toHaveBeenCalledWith(mockAnchor);
    // Because we mock URL.createObjectURL earlier to return "blob:mock-url",
    // we can check if revoke is called correctly.
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
  });
});
