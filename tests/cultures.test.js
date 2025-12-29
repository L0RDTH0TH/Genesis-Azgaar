/**
 * =============================================================================
 * cultures.test.js
 * Desc: Unit tests for culture generation
 * Author: Lordthoth (based on original by Azgaar)
 * =============================================================================
 */

import { describe, test, expect } from '@jest/globals';
import { generateCultures, expandCultures } from '../src/core/cultures.js';
import { getDefaultOptions } from '../src/options.js';
import { RNG } from '../src/utils/rng.js';

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
    gridCells.h[i] = i % 3 === 0 ? 10 : 30 + (i % 50);
    gridCells.temp[i] = 20 + (i % 30) - 15;
    gridCells.prec[i] = 50 + (i % 100);
  }

  const grid = {
    cells: gridCells,
  };

  const packCells = {
    i: Array.from({ length: numPoints }, (_, i) => i),
    h: new Uint8Array(numPoints),
    c: [],
    g: Array.from({ length: numPoints }, (_, i) => i),
    p: Array.from({ length: numPoints }, (_, i) => [
      (i % Math.sqrt(numPoints)) * (width / Math.sqrt(numPoints)),
      Math.floor(i / Math.sqrt(numPoints)) * (height / Math.sqrt(numPoints)),
    ]),
    b: new Uint8Array(numPoints),
    t: new Uint8Array(numPoints),
    f: new Uint16Array(numPoints),
    s: new Int16Array(numPoints), // Suitability
    pop: new Float32Array(numPoints), // Population
    biome: new Uint8Array(numPoints),
    area: new Float32Array(numPoints),
  };

  packCells.h.set(gridCells.h);

  // Create simple adjacency
  const sqrt = Math.floor(Math.sqrt(numPoints));
  for (let i = 0; i < numPoints; i++) {
    packCells.c[i] = [];
    if (i >= sqrt) packCells.c[i].push(i - sqrt);
    if (i < numPoints - sqrt) packCells.c[i].push(i + sqrt);
    if (i % sqrt > 0) packCells.c[i].push(i - 1);
    if (i % sqrt < sqrt - 1) packCells.c[i].push(i + 1);

    packCells.s[i] = i % 2 === 0 ? 10 + (i % 50) : 0; // Some cells have suitability
    packCells.pop[i] = packCells.s[i] > 0 ? packCells.s[i] * 0.1 : 0;
    packCells.biome[i] = packCells.h[i] >= 20 ? 5 : 0;
    packCells.area[i] = 1.0;
    packCells.r = new Uint16Array(numPoints); // Rivers
    packCells.fl = new Uint16Array(numPoints); // Flux
    packCells.t = new Int8Array(numPoints); // Distance field
    packCells.haven = new Uint16Array(numPoints); // Haven
    packCells.harbor = new Uint8Array(numPoints); // Harbor
  }

  const pack = {
    cells: packCells,
    features: [
      null,
      { i: 1, type: 'ocean', land: false, border: true, cells: 100 },
      { i: 2, type: 'island', land: true, border: false, cells: 50 },
    ],
  };

  return { grid, pack };
}

describe('Culture Generation', () => {
  test('generateCultures should return cultures array', () => {
    const options = getDefaultOptions();
    const rng = new RNG('42');
    const { grid, pack } = createMockGridAndPack(options.mapWidth, options.mapHeight, 200);

    const cultures = generateCultures({ pack, grid, options, rng });

    expect(Array.isArray(cultures)).toBe(true);
    expect(cultures.length).toBeGreaterThan(0);
    expect(cultures[0].name).toBe('Wildlands');
    expect(cultures[0].i).toBe(0);
  });

  test('generateCultures should assign culture IDs to cells', () => {
    const options = getDefaultOptions();
    const rng = new RNG('42');
    const { grid, pack } = createMockGridAndPack(options.mapWidth, options.mapHeight, 200);

    generateCultures({ pack, grid, options, rng });

    expect(pack.cells.culture).toBeDefined();
    expect(pack.cells.culture.length).toBe(pack.cells.i.length);
  });

  test('generateCultures should create wildlands if no populated cells', () => {
    const options = getDefaultOptions();
    const rng = new RNG('42');
    const { grid, pack } = createMockGridAndPack(options.mapWidth, options.mapHeight, 100);

    // Remove all suitability
    for (let i = 0; i < pack.cells.s.length; i++) {
      pack.cells.s[i] = 0;
      pack.cells.pop[i] = 0;
    }

    const cultures = generateCultures({ pack, grid, options, rng });

    expect(cultures.length).toBe(1);
    expect(cultures[0].name).toBe('Wildlands');
  });

  test('generateCultures should be reproducible with same seed', () => {
    const options = getDefaultOptions();
    const { grid: grid1, pack: pack1 } = createMockGridAndPack(options.mapWidth, options.mapHeight, 200);
    const { grid: grid2, pack: pack2 } = createMockGridAndPack(options.mapWidth, options.mapHeight, 200);

    const rng1 = new RNG('42');
    const cultures1 = generateCultures({ pack: pack1, grid: grid1, options, rng: rng1 });

    const rng2 = new RNG('42');
    const cultures2 = generateCultures({ pack: pack2, grid: grid2, options, rng: rng2 });

    expect(cultures1.length).toBe(cultures2.length);
    // Culture centers should be the same
    for (let i = 0; i < cultures1.length; i++) {
      expect(cultures1[i].center).toBe(cultures2[i].center);
    }
  });

  test('generateCultures should respect cultures option', () => {
    const options1 = getDefaultOptions();
    options1.cultures = 5;
    const options2 = getDefaultOptions();
    options2.cultures = 10;
    const rng = new RNG('42');
    const { grid, pack } = createMockGridAndPack(options1.mapWidth, options1.mapHeight, 500);

    const cultures1 = generateCultures({ pack: { ...pack }, grid, options: options1, rng: new RNG('42') });
    const cultures2 = generateCultures({ pack: { ...pack }, grid, options: options2, rng: new RNG('42') });

    // Should have approximately the requested number (plus wildlands)
    expect(cultures1.length).toBeLessThanOrEqual(6); // 5 + wildlands
    expect(cultures2.length).toBeLessThanOrEqual(11); // 10 + wildlands
  });

  test('expandCultures should assign cultures to more cells', () => {
    const options = getDefaultOptions();
    const rng = new RNG('42');
    const { grid, pack } = createMockGridAndPack(options.mapWidth, options.mapHeight, 200);

    generateCultures({ pack, grid, options, rng });
    const beforeCount = Array.from(pack.cells.culture).filter((c) => c > 0).length;

    // Ensure cells have required arrays for expansion
    if (!pack.cells.r) pack.cells.r = new Uint16Array(pack.cells.i.length);
    if (!pack.cells.fl) pack.cells.fl = new Uint16Array(pack.cells.i.length);
    if (!pack.cells.t) pack.cells.t = new Int8Array(pack.cells.i.length);
    
    expandCultures({ pack, options });
    const afterCount = Array.from(pack.cells.culture).filter((c) => c > 0).length;

    expect(afterCount).toBeGreaterThanOrEqual(beforeCount);
  });

  test('expandCultures should throw error without pack', () => {
    const options = getDefaultOptions();

    expect(() => {
      expandCultures({ pack: null, options });
    }).toThrow('Pack object with cells and cultures is required');
  });

  test('generateCultures should throw error without pack', () => {
    const options = getDefaultOptions();
    const rng = new RNG('42');
    const { grid } = createMockGridAndPack(options.mapWidth, options.mapHeight, 100);

    expect(() => {
      generateCultures({ pack: null, grid, options, rng });
    }).toThrow('Pack object with cells is required');
  });

  test('generateCultures should throw error without rng', () => {
    const options = getDefaultOptions();
    const { grid, pack } = createMockGridAndPack(options.mapWidth, options.mapHeight, 100);

    expect(() => {
      generateCultures({ pack, grid, options, rng: null });
    }).toThrow('RNG instance is required');
  });

  test('generateCultures should assign culture types', () => {
    const options = getDefaultOptions();
    const rng = new RNG('42');
    const { grid, pack } = createMockGridAndPack(options.mapWidth, options.mapHeight, 200);

    const cultures = generateCultures({ pack, grid, options, rng });

    // Check that cultures have types assigned
    for (let i = 1; i < cultures.length; i++) {
      expect(cultures[i].type).toBeDefined();
      expect(['Generic', 'Nomadic', 'Highland', 'Lake', 'Naval', 'River', 'Hunting'].includes(cultures[i].type)).toBe(true);
    }
  });
});
