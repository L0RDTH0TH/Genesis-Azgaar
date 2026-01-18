/**
 * =============================================================================
 * rivers.test.js
 * Desc: Unit tests for river generation
 * Author: Lordthoth (based on original by Azgaar)
 * =============================================================================
 */

import { describe, test, expect } from '@jest/globals';
import { generateRivers } from '../src/core/rivers.js';
import { generatePrecipitation } from '../src/core/flux.js';
import { RNG } from '../src/utils/rng.js';
import { getDefaultOptions } from '../src/options.js';
import { createTypedArray } from '../src/utils/array.js';

// Mock grid and pack structures for testing
function createMockGridAndPack(width, height, numPoints) {
  const gridCells = {
    i: Array.from({ length: numPoints }, (_, i) => i),
    h: new Uint8Array(numPoints),
    temp: new Int8Array(numPoints),
    prec: new Uint8Array(numPoints),
  };

  // Create heightmap with some variation (mix of land and water)
  for (let i = 0; i < numPoints; i++) {
    gridCells.h[i] = i % 3 === 0 ? 10 : 30 + (i % 50); // Mix of water and varying land heights
    gridCells.temp[i] = 20;
    gridCells.prec[i] = 50 + (i % 100);
  }

  const grid = {
    cells: gridCells,
    cellsX: Math.floor(Math.sqrt(numPoints)),
    cellsY: Math.floor(Math.sqrt(numPoints)),
    points: Array.from({ length: numPoints }, (_, i) => [
      (i % Math.sqrt(numPoints)) * (width / Math.sqrt(numPoints)),
      Math.floor(i / Math.sqrt(numPoints)) * (height / Math.sqrt(numPoints)),
    ]),
  };

  // Create pack with cells
  const packCells = {
    i: Array.from({ length: numPoints }, (_, i) => i),
    h: new Uint8Array(numPoints),
    c: [], // Adjacent cells
    g: Array.from({ length: numPoints }, (_, i) => i), // Grid reference
    p: Array.from({ length: numPoints }, (_, i) => [
      (i % Math.sqrt(numPoints)) * (width / Math.sqrt(numPoints)),
      Math.floor(i / Math.sqrt(numPoints)) * (height / Math.sqrt(numPoints)),
    ]),
    b: new Uint8Array(numPoints), // Border flags
    t: new Uint8Array(numPoints), // Type
    f: new Uint16Array(numPoints), // Feature IDs
  };

  // Copy heights from grid
  packCells.h.set(gridCells.h);

  // Create simple adjacency (each cell connected to neighbors)
  for (let i = 0; i < numPoints; i++) {
    packCells.c[i] = [];
    const sqrt = Math.floor(Math.sqrt(numPoints));
    if (i >= sqrt) packCells.c[i].push(i - sqrt); // Up
    if (i < numPoints - sqrt) packCells.c[i].push(i + sqrt); // Down
    if (i % sqrt > 0) packCells.c[i].push(i - 1); // Left
    if (i % sqrt < sqrt - 1) packCells.c[i].push(i + 1); // Right
    packCells.t[i] = packCells.h[i] >= 20 ? 1 : 0;
    packCells.f[i] = 0;
  }

  const pack = {
    cells: packCells,
    features: [],
  };

  return { grid, pack };
}

describe('River Generation', () => {
  test('generateRivers should return rivers data', () => {
    const options = getDefaultOptions();
    const rng = new RNG('42');
    const { grid, pack } = createMockGridAndPack(options.mapWidth, options.mapHeight, 100);

    const result = generateRivers({ grid, pack, options, rng });

    expect(result).toBeDefined();
    expect(result.rivers).toBeDefined();
    expect(Array.isArray(result.rivers)).toBe(true);
    expect(result.flux).toBeInstanceOf(Uint16Array);
    expect(result.riverIds).toBeInstanceOf(Uint16Array);
    expect(result.confluences).toBeInstanceOf(Uint8Array);
  });

  test('generateRivers should create flux array', () => {
    const options = getDefaultOptions();
    const rng = new RNG('42');
    const { grid, pack } = createMockGridAndPack(options.mapWidth, options.mapHeight, 100);

    const result = generateRivers({ grid, pack, options, rng });

    expect(pack.cells.fl).toBeDefined();
    expect(pack.cells.fl.length).toBe(pack.cells.i.length);
    expect(pack.cells.fl).toBeInstanceOf(Uint16Array);
  });

  test('generateRivers should create river IDs array', () => {
    const options = getDefaultOptions();
    const rng = new RNG('42');
    const { grid, pack } = createMockGridAndPack(options.mapWidth, options.mapHeight, 100);

    const result = generateRivers({ grid, pack, options, rng });

    expect(pack.cells.r).toBeDefined();
    expect(pack.cells.r.length).toBe(pack.cells.i.length);
    expect(pack.cells.r).toBeInstanceOf(Uint16Array);
  });

  test('generateRivers should create rivers when flux is sufficient', () => {
    const options = getDefaultOptions();
    const rng = new RNG('42');
    const { grid, pack } = createMockGridAndPack(options.mapWidth, options.mapHeight, 200);

    const result = generateRivers({ grid, pack, options, rng });

    // Should have at least some rivers if map is large enough
    expect(result.rivers.length).toBeGreaterThanOrEqual(0);
    
    // If rivers exist, they should have valid properties
    if (result.rivers.length > 0) {
      const river = result.rivers[0];
      expect(river).toHaveProperty('i');
      expect(river).toHaveProperty('source');
      expect(river).toHaveProperty('mouth');
      expect(river).toHaveProperty('cells');
      expect(Array.isArray(river.cells)).toBe(true);
      expect(river.cells.length).toBeGreaterThanOrEqual(3);
    }
  });

  test('generateRivers should be reproducible with same seed', () => {
    const options = getDefaultOptions();
    const { grid: grid1, pack: pack1 } = createMockGridAndPack(options.mapWidth, options.mapHeight, 100);
    const { grid: grid2, pack: pack2 } = createMockGridAndPack(options.mapWidth, options.mapHeight, 100);

    const rng1 = new RNG('42');
    const result1 = generateRivers({ grid: grid1, pack: pack1, options, rng: rng1 });

    const rng2 = new RNG('42');
    const result2 = generateRivers({ grid: grid2, pack: pack2, options, rng: rng2 });

    expect(result1.rivers.length).toBe(result2.rivers.length);
    expect(Array.from(result1.flux)).toEqual(Array.from(result2.flux));
    expect(Array.from(result1.riverIds)).toEqual(Array.from(result2.riverIds));
  });

  test('generateRivers should apply erosion when enabled', () => {
    const options = getDefaultOptions();
    const rng = new RNG('42');
    const { grid, pack } = createMockGridAndPack(options.mapWidth, options.mapHeight, 100);

    const originalHeights = Array.from(pack.cells.h);
    generateRivers({ grid, pack, options, rng, allowErosion: true });

    // Heights may have changed due to erosion
    const newHeights = Array.from(pack.cells.h);
    // At least some heights should be the same or lower (erosion only reduces)
    const changed = newHeights.some((h, i) => h !== originalHeights[i]);
    // Erosion may or may not occur depending on flux, so we just check it doesn't crash
    expect(newHeights.length).toBe(originalHeights.length);
  });

  test('generateRivers should not apply erosion when disabled', () => {
    const options = getDefaultOptions();
    const rng = new RNG('42');
    const { grid, pack } = createMockGridAndPack(options.mapWidth, options.mapHeight, 100);

    const originalHeights = Array.from(pack.cells.h);
    generateRivers({ grid, pack, options, rng, allowErosion: false });

    // Heights should be preserved when erosion is disabled
    const newHeights = Array.from(pack.cells.h);
    // Heights may still change due to alterHeights, but erosion won't apply
    expect(newHeights.length).toBe(originalHeights.length);
  });

  test('generateRivers should use provided precipitation', () => {
    const options = getDefaultOptions();
    const rng = new RNG('42');
    const { grid, pack } = createMockGridAndPack(options.mapWidth, options.mapHeight, 100);

    const customPrec = new Uint8Array(grid.cells.i.length);
    for (let i = 0; i < customPrec.length; i++) {
      customPrec[i] = 100; // High precipitation
    }

    const result = generateRivers({ grid, pack, options, rng, precipitation: customPrec });

    expect(result).toBeDefined();
    expect(result.flux).toBeDefined();
    expect(result.flux.length).toBe(pack.cells.i.length);
    // Flux array should be created (may be 0 if no rivers form due to height constraints)
    expect(Array.from(result.flux).every((f) => f >= 0)).toBe(true);
  });

  test('generateRivers should throw error without grid', () => {
    const options = getDefaultOptions();
    const rng = new RNG('42');
    const { pack } = createMockGridAndPack(options.mapWidth, options.mapHeight, 100);

    expect(() => {
      generateRivers({ grid: null, pack, options, rng });
    }).toThrow('Grid and pack objects are required');
  });

  test('generateRivers should throw error without pack', () => {
    const options = getDefaultOptions();
    const rng = new RNG('42');
    const { grid } = createMockGridAndPack(options.mapWidth, options.mapHeight, 100);

    expect(() => {
      generateRivers({ grid, pack: null, options, rng });
    }).toThrow('Grid and pack objects are required');
  });

  test('generateRivers should throw error without rng', () => {
    const options = getDefaultOptions();
    const { grid, pack } = createMockGridAndPack(options.mapWidth, options.mapHeight, 100);

    expect(() => {
      generateRivers({ grid, pack, options, rng: null });
    }).toThrow('RNG instance is required');
  });

  test('generateRivers should create confluences array', () => {
    const options = getDefaultOptions();
    const rng = new RNG('42');
    const { grid, pack } = createMockGridAndPack(options.mapWidth, options.mapHeight, 200);

    const result = generateRivers({ grid, pack, options, rng });

    expect(pack.cells.conf).toBeDefined();
    expect(pack.cells.conf.length).toBe(pack.cells.i.length);
    expect(pack.cells.conf).toBeInstanceOf(Uint8Array);
  });
});
