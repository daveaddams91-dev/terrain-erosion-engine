import { Heightmap } from "../core/heightmap";

/**
 * Encodes a 16-bit grayscale PNG image in pure TypeScript.
 * Uses PNG specification format with uncompressed DEFLATE blocks (RFC 1951)
 * and Adler-32 / CRC-32 checksums for zero-dependency universal browser export.
 */
export class PNG16Exporter {
  private static crcTable: Uint32Array | null = null;

  private static getCrcTable(): Uint32Array {
    if (!this.crcTable) {
      const table = new Uint32Array(256);
      for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) {
          if (c & 1) {
            c = 0xedb88320 ^ (c >>> 1);
          } else {
            c = c >>> 1;
          }
        }
        table[n] = c;
      }
      this.crcTable = table;
    }
    return this.crcTable;
  }

  private static crc32(buf: Uint8Array, offset: number, length: number): number {
    const table = this.getCrcTable();
    let crc = 0xffffffff;
    for (let i = 0; i < length; i++) {
      crc = table[(crc ^ buf[offset + i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  private static adler32(buf: Uint8Array): number {
    let s1 = 1;
    let s2 = 0;
    for (let i = 0; i < buf.length; i++) {
      s1 = (s1 + buf[i]) % 65521;
      s2 = (s2 + s1) % 65521;
    }
    return ((s2 << 16) | s1) >>> 0;
  }

  /**
   * Generates a 16-bit grayscale PNG Blob from the heightmap.
   */
  public static export(heightmap: Heightmap): Blob {
    const res = heightmap.resolution;
    const { min, max } = heightmap.getElevationRange();
    const range = Math.max(0.001, max - min);

    // PNG Scanline: 1 filter byte (0 = None) + 2 bytes per pixel (16-bit big endian)
    const bytesPerScanline = 1 + res * 2;
    const rawData = new Uint8Array(res * bytesPerScanline);

    let writeIdx = 0;
    for (let y = 0; y < res; y++) {
      rawData[writeIdx++] = 0; // Filter byte: 0 (None)
      const row = y * res;
      for (let x = 0; x < res; x++) {
        const val = heightmap.data[row + x];
        const norm = Math.max(0, Math.min(1, (val - min) / range));
        const u16 = Math.round(norm * 65535);

        // Big-endian 16-bit
        rawData[writeIdx++] = (u16 >> 8) & 0xff;
        rawData[writeIdx++] = u16 & 0xff;
      }
    }

    // Wrap rawData in zlib container with uncompressed DEFLATE blocks
    // RFC 1950 (zlib): CMF (0x78), FLG (0x01)
    // RFC 1951: Non-compressed blocks (BTYPE 00), max 65535 bytes per block
    const maxBlockSize = 65535;
    const numBlocks = Math.ceil(rawData.length / maxBlockSize);
    const zlibLength = 2 + numBlocks * 5 + rawData.length + 4;
    const zlibData = new Uint8Array(zlibLength);

    zlibData[0] = 0x78; // Deflate, 32K window
    zlibData[1] = 0x01; // Check bits

    let zIdx = 2;
    let bytesRemaining = rawData.length;
    let rawOffset = 0;

    for (let b = 0; b < numBlocks; b++) {
      const isFinal = b === numBlocks - 1;
      const blockSize = Math.min(bytesRemaining, maxBlockSize);

      zlibData[zIdx++] = isFinal ? 0x01 : 0x00; // BFINAL, BTYPE=00
      zlibData[zIdx++] = blockSize & 0xff;
      zlibData[zIdx++] = (blockSize >> 8) & 0xff;
      const nlen = (~blockSize) & 0xffff;
      zlibData[zIdx++] = nlen & 0xff;
      zlibData[zIdx++] = (nlen >> 8) & 0xff;

      zlibData.set(rawData.subarray(rawOffset, rawOffset + blockSize), zIdx);
      zIdx += blockSize;
      rawOffset += blockSize;
      bytesRemaining -= blockSize;
    }

    // Append Adler-32
    const adler = this.adler32(rawData);
    zlibData[zIdx++] = (adler >> 24) & 0xff;
    zlibData[zIdx++] = (adler >> 16) & 0xff;
    zlibData[zIdx++] = (adler >> 8) & 0xff;
    zlibData[zIdx++] = adler & 0xff;

    // Construct PNG file: Signature + IHDR + IDAT + IEND
    const totalPngSize = 8 + (12 + 13) + (12 + zlibData.length) + (12 + 0);
    const pngBuffer = new Uint8Array(totalPngSize);
    const view = new DataView(pngBuffer.buffer);

    // 1. PNG Signature
    pngBuffer.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
    let p = 8;

    // 2. IHDR Chunk (Length 13)
    view.setUint32(p, 13);
    p += 4;
    const ihdrStart = p;
    pngBuffer.set([73, 72, 68, 82], p); // "IHDR"
    p += 4;
    view.setUint32(p, res); // Width
    p += 4;
    view.setUint32(p, res); // Height
    p += 4;
    pngBuffer[p++] = 16; // Bit depth: 16
    pngBuffer[p++] = 0;  // Color type: 0 (Grayscale)
    pngBuffer[p++] = 0;  // Compression method: 0
    pngBuffer[p++] = 0;  // Filter method: 0
    pngBuffer[p++] = 0;  // Interlace method: 0
    view.setUint32(p, this.crc32(pngBuffer, ihdrStart, 17));
    p += 4;

    // 3. IDAT Chunk
    view.setUint32(p, zlibData.length);
    p += 4;
    const idatStart = p;
    pngBuffer.set([73, 68, 65, 84], p); // "IDAT"
    p += 4;
    pngBuffer.set(zlibData, p);
    p += zlibData.length;
    view.setUint32(p, this.crc32(pngBuffer, idatStart, 4 + zlibData.length));
    p += 4;

    // 4. IEND Chunk (Length 0)
    view.setUint32(p, 0);
    p += 4;
    const iendStart = p;
    pngBuffer.set([73, 69, 78, 68], p); // "IEND"
    p += 4;
    view.setUint32(p, this.crc32(pngBuffer, iendStart, 4));
    p += 4;

    return new Blob([pngBuffer], { type: "image/png" });
  }

  public static download(heightmap: Heightmap, filename = "terrain_heightmap_16bit.png"): void {
    const blob = this.export(heightmap);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}
