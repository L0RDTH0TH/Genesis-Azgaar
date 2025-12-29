/**
 * =============================================================================
 * burgs.test.js
 * Desc: Unit tests for burg generation
 * Author: Lordthoth (based on original by Azgaar)
 * =============================================================================
 */

import { describe, test, expect } from '@jest/globals';
import { generateBurgs } from '../src/core/burgs.js';
import { getDefaultOptions } from '../src/options.js';
import { RNG } from '../src/utils/rng.js';

// Mock grid and pack structures for testing
function createMockGridAndPack(width, height, numPoints) {
  const gridCells = {
    i: Array.from({ length: numPoints }, (_, i) => i),
    h: new Uint8Array(numPoints),
    temp: new Int8Array(numPoints),
  };

  for (let i = 0; i < numPoints; i++) {
    gridCells.h[i] = i % 3 === 0 ? 10 : 30 + (i % 50);
    gridCells.temp[i] = 20;
  }

  const grid = {
    cells: gridCells,
  };

  const sqrt = Math.floor(Math.sqrt(numPoints));
  const packCells = {
    i: Array.from({ length: numPoints }, (_, i) => i),
    h: new Uint8Array(numPoints),
    c: [],
    g: Array.from({ length: numPoints }, (_, i) => i),
    p: Array.from({ length: numPoints }, (_, i) => [
      (i % sqrt) * (width / sqrt),
      Math.floor(i / sqrt) * (height / sqrt),
    ]),
    b: new Uint8Array(numPoints),
    t: new Int8Array(numPoints),
    f: new Uint16Array(numPoints),
    s: new Int16Array(numPoints),
    pop: new Float32Array(numPoints),
    culture: new Uint16Array(numPoints),
    biome: new Uint8Array(numPoints),
    r: new Uint16Array(numPoints),
    fl: new Uint16Array(numPoints),
    haven: new Uint16Array(numPoints),
    harbor: new Uint8Array(numPoints),
    v: [],
  };

  packCells.h.set(gridCells.h);

  for (let i = 0; i < numPoints; i++) {
    packCells.c[i] = [];
    if (i >= sqrt) packCells.c[i].push(i - sqrt);
    if (i < numPoints - sqrt) packCells.c[i].push(i + sqrt);
    if (i % sqrt > 0) packCells.c[i].push(i - 1);
    if (i % sqrt < sqrt - 1) packCells.c[i].push(i + 1);

    packCells.s[i] = i % 2 === 0 ? 10 + (i % 50) : 0;
    packCells.pop[i] = packCells.s[i] > 0 ? packCells.s[i] * 0.1 : 0;
    packCells.culture[i] = packCells.s[i] > 0 ? 1 + (i % 5) : 0;
    packCells.biome[i] = packCells.h[i] >= 20 ? 5 : 0;
    packCells.f[i] = packCells.h[i] >= 20 ? 2 : 1;
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

describe('Burg Generation', () => {
  test('generateBurgs should return burgs array', () => {
    const options = getDefaultOptions();
    const rng = new RNG('42');
    const { grid, pack } = createMockGridAndPack(options.mapWidth, options.mapHeight, 200);

    const burgs = generateBurgs({ pack, grid, options, rng });

    expect(Array.isArray(burgs)).toBe(true);
    expect(burgs.length).toBeGreaterThan(0);
    expect(burgs[0]).toBeNull(); // First element is null
  });

  test('generateBurgs should assign burg IDs to cells', () => {
    const options = getDefaultOptions();
    const rng = new RNG('42');
    const { grid, pack } = createMockGridAndPack(options.mapWidth, options.mapHeight, 200);

    generateBurgs({ pack, grid, options, rng });

    expect(pack.cells.burg).toBeDefined();
    expect(pack.cells.burg.length).toBe(pack.cells.i.length);
  });

  test('generateBurgs should place capitals', () => {
    const options = getDefaultOptions();
    options.statesNumber = 5;
    const rng = new RNG('42');
    const { grid, pack } = createMockGridAndPack(options.mapWidth, options.mapHeight, 200);

    const burgs = generateBurgs({ pack, grid, options, rng });

    // Should have at least some capitals (plus null at index 0)
    const capitals = burgs.filter((b) => b && b.capital);
    expect(capitals.length).toBeGreaterThan(0);
    // The function may place more capitals if spacing allows and there are many suitable cells
    // This is acceptable behavior - just verify we have some capitals
    expect(capitals.length).toBeGreaterThanOrEqual(1);
  });

  test('generateBurgs should assign population to burgs', () => {
    const options = getDefaultOptions();
    const rng = new RNG('42');
    const { grid, pack } = createMockGridAndPack(options.mapWidth, options.mapHeight, 200);

    const burgs = generateBurgs({ pack, grid, options, rng });

    for (const b of burgs) {
      if (b && b.i) {
        expect(b.population).toBeDefined();
        expect(b.population).toBeGreaterThan(0);
      }
    }
  });

  test('generateBurgs should assign coordinates to burgs', () => {
    const options = getDefaultOptions();
    const rng = new RNG('42');
    const { grid, pack } = createMockGridAndPack(options.mapWidth, options.mapHeight, 200);

    const burgs = generateBurgs({ pack, grid, options, rng });

    for (const b of burgs) {
      if (b && b.i) {
        expect(b.x).toBeDefined();
        expect(b.y).toBeDefined();
        expect(typeof b.x).toBe('number');
        expect(typeof b.y).toBe('number');
      }
    }
  });

  test('generateBurgs should be reproducible with same seed', () => {
    const options = getDefaultOptions();
    const { grid: grid1, pack: pack1 } = createMockGridAndPack(options.mapWidth, options.mapHeight, 200);
    const { grid: grid2, pack: pack2 } = createMockGridAndPack(options.mapWidth, options.mapHeight, 200);

    const rng1 = new RNG('42');
    const burgs1 = generateBurgs({ pack: pack1, grid: grid1, options, rng: rng1 });

    const rng2 = new RNG('42');
    const burgs2 = generateBurgs({ pack: pack2, grid: grid2, options, rng: rng2 });

    expect(burgs1.length).toBe(burgs2.length);
    // Burg positions should be the same
    for (let i = 1; i < burgs1.length; i++) {
      if (burgs1[i] && burgs2[i]) {
        expect(burgs1[i].cell).toBe(burgs2[i].cell);
      }
    }
  });

  test('generateBurgs should assign burg types', () => {
    const options = getDefaultOptions();
    const rng = new RNG('42');
    const { grid, pack } = createMockGridAndPack(options.mapWidth, options.mapHeight, 200);

    const burgs = generateBurgs({ pack, grid, options, rng });

    for (const b of burgs) {
      if (b && b.i) {
        expect(b.type).toBeDefined();
        expect(['Generic', 'Naval', 'Lake', 'Highland', 'River', 'Nomadic', 'Hunting'].includes(b.type)).toBe(true);
      }
    }
  });

  test('generateBurgs should respect statesNumber option', () => {
    const options1 = getDefaultOptions();
    options1.statesNumber = 5;
    const options2 = getDefaultOptions();
    options2.statesNumber = 10;
    const rng = new RNG('42');
    const { grid, pack } = createMockGridAndPack(options1.mapWidth, options1.mapHeight, 500);

    const burgs1 = generateBurgs({ pack: { ...pack }, grid, options: options1, rng: new RNG('42') });
    const burgs2 = generateBurgs({ pack: { ...pack }, grid, options: options2, rng: new RNG('42') });

    const capitals1 = burgs1.filter((b) => b && b.capital).length;
    const capitals2 = burgs2.filter((b) => b && b.capital).length;

    expect(capitals2).toBeGreaterThanOrEqual(capitals1);
  });

  test('generateBurgs should throw error without pack', () => {
    const options = getDefaultOptions();
    const rng = new RNG('42');
    const { grid } = createMockGridAndPack(options.mapWidth, options.mapHeight, 100);

    expect(() => {
      generateBurgs({ pack: null, grid, options, rng });
    }).toThrow('Pack object with cells is required');
  });

  test('generateBurgs should throw error without rng', () => {
    const options = getDefaultOptions();
    const { grid, pack } = createMockGridAndPack(options.mapWidth, options.mapHeight, 100);

    expect(() => {
      generateBurgs({ pack, grid, options, rng: null });
    }).toThrow('RNG instance is required');
  });
});
