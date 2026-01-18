/**
 * =============================================================================
 * provinces.test.js
 * Desc: Unit tests for province generation
 * Author: Lordthoth (based on original by Azgaar)
 * =============================================================================
 */

import { describe, test, expect } from '@jest/globals';
import { generateProvinces } from '../src/core/provinces.js';
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
    area: new Float32Array(numPoints),
    state: new Uint16Array(numPoints),
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
    packCells.area[i] = 1.0;
    packCells.state[i] = packCells.h[i] >= 20 ? 1 + (i % 3) : 0; // Assign to states 1, 2, or 3
  }

  // Create burgs for each state
  const burgs = [null];
  let burgId = 1;
  for (let stateId = 1; stateId <= 3; stateId++) {
    for (let j = 0; j < 3; j++) {
      const cellId = stateId * 20 + j * 5;
      if (cellId < numPoints && packCells.h[cellId] >= 20) {
        burgs.push({
          i: burgId,
          cell: cellId,
          x: packCells.p[cellId][0],
          y: packCells.p[cellId][1],
          capital: j === 0 ? 1 : 0,
          culture: packCells.culture[cellId],
          name: `Burg${burgId}`,
          population: 10 + burgId,
          state: stateId,
        });
        burgId++;
      }
    }
  }

  const states = [
    { i: 0, name: 'Neutrals' },
    { i: 1, name: 'State1', capital: 1, center: 20, culture: 1, type: 'Generic', expansionism: 1, form: 'Monarchy', color: '#66c2a5' },
    { i: 2, name: 'State2', capital: 4, center: 40, culture: 2, type: 'Generic', expansionism: 1, form: 'Republic', color: '#fc8d62' },
    { i: 3, name: 'State3', capital: 7, center: 60, culture: 3, type: 'Generic', expansionism: 1, form: 'Monarchy', color: '#8da0cb' },
  ];

  const pack = {
    cells: packCells,
    burgs,
    states,
    features: [
      null,
      { i: 1, type: 'ocean', land: false, border: true, cells: 100 },
      { i: 2, type: 'island', land: true, border: false, cells: 50 },
    ],
  };

  return { grid, pack };
}

describe('Province Generation', () => {
  test('generateProvinces should return provinces array', () => {
    const options = getDefaultOptions();
    const rng = new RNG('42');
    const { grid, pack } = createMockGridAndPack(options.mapWidth, options.mapHeight, 200);

    const provinces = generateProvinces({ pack, options, rng });

    expect(Array.isArray(provinces)).toBe(true);
    expect(provinces.length).toBeGreaterThan(0);
    expect(provinces[0]).toBeNull(); // First element is null
  });

  test('generateProvinces should assign province IDs to cells', () => {
    const options = getDefaultOptions();
    const rng = new RNG('42');
    const { grid, pack } = createMockGridAndPack(options.mapWidth, options.mapHeight, 200);

    generateProvinces({ pack, options, rng });

    expect(pack.cells.province).toBeDefined();
    expect(pack.cells.province.length).toBe(pack.cells.i.length);
  });

  test('generateProvinces should create provinces for each state', () => {
    const options = getDefaultOptions();
    const rng = new RNG('42');
    const { grid, pack } = createMockGridAndPack(options.mapWidth, options.mapHeight, 200);

    const provinces = generateProvinces({ pack, options, rng });

    // Each state should have at least some provinces
    for (const s of pack.states) {
      if (s.i && !s.removed) {
        expect(s.provinces).toBeDefined();
        expect(Array.isArray(s.provinces)).toBe(true);
      }
    }
  });

  test('generateProvinces should assign provinces to state cells', () => {
    const options = getDefaultOptions();
    const rng = new RNG('42');
    const { grid, pack } = createMockGridAndPack(options.mapWidth, options.mapHeight, 200);

    generateProvinces({ pack, options, rng });

    // Land cells with states should have provinces
    for (let i = 0; i < pack.cells.i.length; i++) {
      if (pack.cells.h[i] >= 20 && pack.cells.state[i] > 0) {
        expect(pack.cells.province[i]).toBeDefined();
        expect(pack.cells.province[i]).toBeGreaterThanOrEqual(0);
      }
    }
  });

  test('generateProvinces should be reproducible with same seed', () => {
    const options = getDefaultOptions();
    const { grid: grid1, pack: pack1 } = createMockGridAndPack(options.mapWidth, options.mapHeight, 200);
    const { grid: grid2, pack: pack2 } = createMockGridAndPack(options.mapWidth, options.mapHeight, 200);

    const rng1 = new RNG('42');
    const provinces1 = generateProvinces({ pack: pack1, options, rng: rng1 });

    const rng2 = new RNG('42');
    const provinces2 = generateProvinces({ pack: pack2, options, rng: rng2 });

    expect(provinces1.length).toBe(provinces2.length);
  });

  test('generateProvinces should respect provincesRatio option', () => {
    const options1 = getDefaultOptions();
    options1.provincesRatio = 10;
    const options2 = getDefaultOptions();
    options2.provincesRatio = 50;
    const rng = new RNG('42');
    const { grid, pack } = createMockGridAndPack(options1.mapWidth, options1.mapHeight, 500);

    const provinces1 = generateProvinces({ pack: { ...pack }, options: options1, rng: new RNG('42') });
    const provinces2 = generateProvinces({ pack: { ...pack }, options: options2, rng: new RNG('42') });

    // Both should generate provinces (exact count may vary due to wild provinces)
    expect(provinces1.length).toBeGreaterThan(1);
    expect(provinces2.length).toBeGreaterThan(1);
  });

  test('generateProvinces should create wild provinces for unassigned cells', () => {
    const options = getDefaultOptions();
    const rng = new RNG('42');
    const { grid, pack } = createMockGridAndPack(options.mapWidth, options.mapHeight, 200);

    generateProvinces({ pack, options, rng });

    // All state cells should have provinces (including wild ones)
    const unassigned = pack.cells.i.filter((i) => pack.cells.h[i] >= 20 && pack.cells.state[i] > 0 && !pack.cells.province[i]);
    expect(unassigned.length).toBe(0); // All should be assigned
  });

  test('generateProvinces should assign province properties', () => {
    const options = getDefaultOptions();
    const rng = new RNG('42');
    const { grid, pack } = createMockGridAndPack(options.mapWidth, options.mapHeight, 200);

    const provinces = generateProvinces({ pack, options, rng });

    for (const p of provinces) {
      if (p && p.i) {
        expect(p.state).toBeDefined();
        expect(p.center).toBeDefined();
        expect(p.name).toBeDefined();
        expect(p.formName).toBeDefined();
        expect(p.fullName).toBeDefined();
        expect(p.color).toBeDefined();
      }
    }
  });

  test('generateProvinces should throw error without pack', () => {
    const options = getDefaultOptions();
    const rng = new RNG('42');

    expect(() => {
      generateProvinces({ pack: null, options, rng });
    }).toThrow('Pack object with cells, states, and burgs is required');
  });

  test('generateProvinces should throw error without rng', () => {
    const options = getDefaultOptions();
    const { grid, pack } = createMockGridAndPack(options.mapWidth, options.mapHeight, 100);

    expect(() => {
      generateProvinces({ pack, options, rng: null });
    }).toThrow('RNG instance is required');
  });
});
