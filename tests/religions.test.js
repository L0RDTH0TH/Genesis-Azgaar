/**
 * =============================================================================
 * religions.test.js
 * Desc: Unit tests for religion generation
 * Author: Lordthoth (based on original by Azgaar)
 * =============================================================================
 */

import { describe, test, expect } from '@jest/globals';
import { generateReligions } from '../src/core/religions.js';
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
    state: new Uint16Array(numPoints),
    biome: new Uint8Array(numPoints),
    r: new Uint16Array(numPoints),
    fl: new Uint16Array(numPoints),
    area: new Float32Array(numPoints),
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
    packCells.state[i] = packCells.s[i] > 0 ? 1 + (i % 3) : 0;
    packCells.biome[i] = packCells.h[i] >= 20 ? 5 : 0;
    packCells.f[i] = packCells.h[i] >= 20 ? 2 : 1;
    packCells.area[i] = 1.0;
  }

  // Create cultures
  const cultures = [
    { i: 0, name: 'Wildlands', type: 'Generic', color: '#888888' },
    { i: 1, name: 'Culture1', type: 'Generic', center: 10, color: '#ff0000' },
    { i: 2, name: 'Culture2', type: 'Naval', center: 20, color: '#00ff00' },
    { i: 3, name: 'Culture3', type: 'Highland', center: 30, color: '#0000ff' },
  ];

  // Create burgs
  const burgs = [null];
  for (let i = 1; i <= 5; i++) {
    const cellId = i * 10;
    burgs.push({
      i,
      cell: cellId,
      x: packCells.p[cellId][0],
      y: packCells.p[cellId][1],
      capital: i === 1 ? 1 : 0,
      culture: packCells.culture[cellId],
      name: `Burg${i}`,
      population: 10 + i,
    });
  }

  const pack = {
    cells: packCells,
    burgs,
    cultures,
    features: [
      null,
      { i: 1, type: 'ocean', land: false, border: true, cells: 100 },
      { i: 2, type: 'island', land: true, border: false, cells: 50 },
    ],
  };

  return { grid, pack };
}

describe('Religion Generation', () => {
  test('generateReligions should return religions array', () => {
    const options = getDefaultOptions();
    options.religionsNumber = 5;
    const rng = new RNG('42');
    const { grid, pack } = createMockGridAndPack(options.mapWidth, options.mapHeight, 200);

    const religions = generateReligions({ pack, options, rng });

    expect(Array.isArray(religions)).toBe(true);
    expect(religions.length).toBeGreaterThan(0);
    expect(religions[0].name).toBe('No religion');
    expect(religions[0].i).toBe(0);
  });

  test('generateReligions should skip if religionsNumber is 0', () => {
    const options = getDefaultOptions();
    options.religionsNumber = 0;
    const rng = new RNG('42');
    const { grid, pack } = createMockGridAndPack(options.mapWidth, options.mapHeight, 200);

    const religions = generateReligions({ pack, options, rng });

    expect(religions.length).toBe(1);
    expect(religions[0].name).toBe('No religion');
    expect(pack.cells.religion).toBeDefined();
  });

  test('generateReligions should assign religion IDs to cells', () => {
    const options = getDefaultOptions();
    options.religionsNumber = 5;
    const rng = new RNG('42');
    const { grid, pack } = createMockGridAndPack(options.mapWidth, options.mapHeight, 200);

    generateReligions({ pack, options, rng });

    expect(pack.cells.religion).toBeDefined();
    expect(pack.cells.religion.length).toBe(pack.cells.i.length);
  });

  test('generateReligions should create folk religions for cultures', () => {
    const options = getDefaultOptions();
    options.religionsNumber = 5;
    const rng = new RNG('42');
    const { grid, pack } = createMockGridAndPack(options.mapWidth, options.mapHeight, 200);

    const religions = generateReligions({ pack, options, rng });

    const folkReligions = religions.filter((r) => r.type === 'Folk');
    expect(folkReligions.length).toBeGreaterThan(0);
  });

  test('generateReligions should create organized religions', () => {
    const options = getDefaultOptions();
    options.religionsNumber = 5;
    const rng = new RNG('42');
    const { grid, pack } = createMockGridAndPack(options.mapWidth, options.mapHeight, 200);

    const religions = generateReligions({ pack, options, rng });

    const organizedReligions = religions.filter((r) => r.type !== 'Folk' && r.i > 0);
    expect(organizedReligions.length).toBeGreaterThan(0);
  });

  test('generateReligions should assign religion properties', () => {
    const options = getDefaultOptions();
    options.religionsNumber = 5;
    const rng = new RNG('42');
    const { grid, pack } = createMockGridAndPack(options.mapWidth, options.mapHeight, 200);

    const religions = generateReligions({ pack, options, rng });

    for (const r of religions) {
      if (r.i > 0) {
        expect(r.name).toBeDefined();
        expect(r.type).toBeDefined();
        expect(r.form).toBeDefined();
        expect(r.color).toBeDefined();
        expect(r.expansion).toBeDefined();
        expect(r.expansionism).toBeDefined();
      }
    }
  });

  test('generateReligions should be reproducible with same seed', () => {
    const options = getDefaultOptions();
    options.religionsNumber = 5;
    const { grid: grid1, pack: pack1 } = createMockGridAndPack(options.mapWidth, options.mapHeight, 200);
    const { grid: grid2, pack: pack2 } = createMockGridAndPack(options.mapWidth, options.mapHeight, 200);

    const rng1 = new RNG('42');
    const religions1 = generateReligions({ pack: pack1, options, rng: rng1 });

    const rng2 = new RNG('42');
    const religions2 = generateReligions({ pack: pack2, options, rng: rng2 });

    expect(religions1.length).toBe(religions2.length);
  });

  test('generateReligions should respect religionsNumber option', () => {
    const options1 = getDefaultOptions();
    options1.religionsNumber = 3;
    const options2 = getDefaultOptions();
    options2.religionsNumber = 10;
    const rng = new RNG('42');
    const { grid, pack } = createMockGridAndPack(options1.mapWidth, options1.mapHeight, 500);

    const religions1 = generateReligions({ pack: { ...pack }, options: options1, rng: new RNG('42') });
    const religions2 = generateReligions({ pack: { ...pack }, options: options2, rng: new RNG('42') });

    // Should have approximately the requested number (plus folk religions and "No religion")
    expect(religions2.length).toBeGreaterThanOrEqual(religions1.length);
  });

  test('generateReligions should throw error without pack', () => {
    const options = getDefaultOptions();
    const rng = new RNG('42');

    expect(() => {
      generateReligions({ pack: null, options, rng });
    }).toThrow('Pack object with cells is required');
  });

  test('generateReligions should throw error without rng', () => {
    const options = getDefaultOptions();
    const { grid, pack } = createMockGridAndPack(options.mapWidth, options.mapHeight, 100);

    expect(() => {
      generateReligions({ pack, options, rng: null });
    }).toThrow('RNG instance is required');
  });
});
