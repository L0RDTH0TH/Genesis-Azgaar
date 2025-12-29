/**
 * =============================================================================
 * biomes.test.js
 * Desc: Unit tests for biome assignment
 * Author: Lordthoth (based on original by Azgaar)
 * =============================================================================
 */

import { describe, test, expect } from '@jest/globals';
import { assignBiomes, getDefaultBiomes } from '../src/core/biomes.js';
import { getDefaultOptions } from '../src/options.js';

// Mock grid and pack structures for testing
function createMockGridAndPack(width, height, numPoints) {
  const gridCells = {
    i: Array.from({ length: numPoints }, (_, i) => i),
    h: new Uint8Array(numPoints),
    temp: new Int8Array(numPoints),
    prec: new Uint8Array(numPoints),
  };

  // Create heightmap with some variation
  for (let i = 0; i < numPoints; i++) {
    gridCells.h[i] = i % 3 === 0 ? 10 : 30 + (i % 50); // Mix of water and varying land heights
    gridCells.temp[i] = 20 + (i % 30) - 15; // Temperature variation
    gridCells.prec[i] = 50 + (i % 100);
  }

  const grid = {
    cells: gridCells,
  };

  const packCells = {
    i: Array.from({ length: numPoints }, (_, i) => i),
    h: new Uint8Array(numPoints),
    c: [], // Adjacent cells
    g: Array.from({ length: numPoints }, (_, i) => i), // Grid reference
    fl: new Uint16Array(numPoints), // Flux
    r: new Uint16Array(numPoints), // Rivers
  };

  // Copy heights from grid
  packCells.h.set(gridCells.h);

  // Create simple adjacency
  const sqrt = Math.floor(Math.sqrt(numPoints));
  for (let i = 0; i < numPoints; i++) {
    packCells.c[i] = [];
    if (i >= sqrt) packCells.c[i].push(i - sqrt); // Up
    if (i < numPoints - sqrt) packCells.c[i].push(i + sqrt); // Down
    if (i % sqrt > 0) packCells.c[i].push(i - 1); // Left
    if (i % sqrt < sqrt - 1) packCells.c[i].push(i + 1); // Right
  }

  const pack = {
    cells: packCells,
  };

  return { grid, pack };
}

describe('Biome Assignment', () => {
  test('getDefaultBiomes should return biome data', () => {
    const biomes = getDefaultBiomes();

    expect(biomes).toBeDefined();
    expect(biomes.name).toBeDefined();
    expect(biomes.color).toBeDefined();
    expect(biomes.biomesMatrix).toBeDefined();
    expect(biomes.habitability).toBeDefined();
    expect(biomes.name.length).toBe(13);
    expect(biomes.biomesMatrix.length).toBe(5);
  });

  test('assignBiomes should return Uint8Array', () => {
    const options = getDefaultOptions();
    const { grid, pack } = createMockGridAndPack(options.mapWidth, options.mapHeight, 100);

    const biome = assignBiomes({ pack, grid, options });

    expect(biome).toBeInstanceOf(Uint8Array);
    expect(biome.length).toBe(pack.cells.i.length);
  });

  test('assignBiomes should assign biomes to pack.cells', () => {
    const options = getDefaultOptions();
    const { grid, pack } = createMockGridAndPack(options.mapWidth, options.mapHeight, 100);

    assignBiomes({ pack, grid, options });

    expect(pack.cells.biome).toBeDefined();
    expect(pack.cells.biome).toBeInstanceOf(Uint8Array);
    expect(pack.cells.biome.length).toBe(pack.cells.i.length);
  });

  test('assignBiomes should assign marine biome to water cells', () => {
    const options = getDefaultOptions();
    const { grid, pack } = createMockGridAndPack(options.mapWidth, options.mapHeight, 100);

    assignBiomes({ pack, grid, options });

    // Water cells (height < 20) should have biome 0 (Marine)
    for (let i = 0; i < pack.cells.i.length; i++) {
      if (pack.cells.h[i] < 20) {
        expect(pack.cells.biome[i]).toBe(0);
      }
    }
  });

  test('assignBiomes should assign valid biome IDs', () => {
    const options = getDefaultOptions();
    const { grid, pack } = createMockGridAndPack(options.mapWidth, options.mapHeight, 100);

    assignBiomes({ pack, grid, options });

    // All biome IDs should be between 0 and 12
    for (let i = 0; i < pack.cells.biome.length; i++) {
      expect(pack.cells.biome[i]).toBeGreaterThanOrEqual(0);
      expect(pack.cells.biome[i]).toBeLessThanOrEqual(12);
    }
  });

  test('assignBiomes should be reproducible', () => {
    const options = getDefaultOptions();
    const { grid: grid1, pack: pack1 } = createMockGridAndPack(options.mapWidth, options.mapHeight, 100);
    const { grid: grid2, pack: pack2 } = createMockGridAndPack(options.mapWidth, options.mapHeight, 100);

    assignBiomes({ pack: pack1, grid: grid1, options });
    assignBiomes({ pack: pack2, grid: grid2, options });

    expect(Array.from(pack1.cells.biome)).toEqual(Array.from(pack2.cells.biome));
  });

  test('assignBiomes should use provided biomes data', () => {
    const options = getDefaultOptions();
    const { grid, pack } = createMockGridAndPack(options.mapWidth, options.mapHeight, 100);
    const customBiomes = getDefaultBiomes();

    assignBiomes({ pack, grid, options, biomesData: customBiomes });

    expect(pack.cells.biome).toBeDefined();
    expect(pack.cells.biome.length).toBe(pack.cells.i.length);
  });

  test('assignBiomes should throw error without pack', () => {
    const options = getDefaultOptions();
    const { grid } = createMockGridAndPack(options.mapWidth, options.mapHeight, 100);

    expect(() => {
      assignBiomes({ pack: null, grid, options });
    }).toThrow('Pack object with cells is required');
  });

  test('assignBiomes should throw error without grid', () => {
    const options = getDefaultOptions();
    const { pack } = createMockGridAndPack(options.mapWidth, options.mapHeight, 100);

    expect(() => {
      assignBiomes({ pack, grid: null, options });
    }).toThrow('Grid object with cells is required');
  });
});
