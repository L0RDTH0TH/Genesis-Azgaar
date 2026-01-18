/**
 * =============================================================================
 * states.test.js
 * Desc: Unit tests for state generation
 * Author: Lordthoth (based on original by Azgaar)
 * =============================================================================
 */

import { describe, test, expect } from '@jest/globals';
import { generateStates, expandStates, normalizeStates, collectStatistics, assignColors } from '../src/core/states.js';
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
  }

  // Create some capitals
  const burgs = [null];
  for (let i = 1; i <= 5; i++) {
    const cellId = i * 10;
    burgs.push({
      i,
      cell: cellId,
      x: packCells.p[cellId][0],
      y: packCells.p[cellId][1],
      capital: 1,
      culture: packCells.culture[cellId],
      name: `Capital${i}`,
      population: 10 + i,
    });
  }

  const cultures = [
    { i: 0, name: 'Wildlands', type: 'Generic' },
    { i: 1, name: 'Culture1', type: 'Generic', center: 10 },
    { i: 2, name: 'Culture2', type: 'Naval', center: 20 },
    { i: 3, name: 'Culture3', type: 'Highland', center: 30 },
    { i: 4, name: 'Culture4', type: 'River', center: 40 },
    { i: 5, name: 'Culture5', type: 'Nomadic', center: 50 },
  ];

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

describe('State Generation', () => {
  test('generateStates should return states array', () => {
    const options = getDefaultOptions();
    const rng = new RNG('42');
    const { grid, pack } = createMockGridAndPack(options.mapWidth, options.mapHeight, 200);

    const states = generateStates({ pack, options, rng });

    expect(Array.isArray(states)).toBe(true);
    expect(states.length).toBeGreaterThan(0);
    expect(states[0].name).toBe('Neutrals');
    expect(states[0].i).toBe(0);
  });

  test('generateStates should assign state IDs to cells', () => {
    const options = getDefaultOptions();
    const rng = new RNG('42');
    const { grid, pack } = createMockGridAndPack(options.mapWidth, options.mapHeight, 200);

    generateStates({ pack, options, rng });

    expect(pack.cells.state).toBeDefined();
    expect(pack.cells.state.length).toBe(pack.cells.i.length);
  });

  test('generateStates should create states from capitals', () => {
    const options = getDefaultOptions();
    const rng = new RNG('42');
    const { grid, pack } = createMockGridAndPack(options.mapWidth, options.mapHeight, 200);

    const states = generateStates({ pack, options, rng });

    // Should have states for each capital (plus neutrals)
    const capitals = pack.burgs.filter((b) => b && b.capital);
    expect(states.length).toBeGreaterThanOrEqual(capitals.length + 1);
  });

  test('generateStates should assign states to burgs', () => {
    const options = getDefaultOptions();
    const rng = new RNG('42');
    const { grid, pack } = createMockGridAndPack(options.mapWidth, options.mapHeight, 200);

    generateStates({ pack, options, rng });

    // All burgs should have a state assigned
    for (const b of pack.burgs) {
      if (b && b.i) {
        expect(b.state).toBeDefined();
        expect(b.state).toBeGreaterThanOrEqual(0);
      }
    }
  });

  test('generateStates should be reproducible with same seed', () => {
    const options = getDefaultOptions();
    const { grid: grid1, pack: pack1 } = createMockGridAndPack(options.mapWidth, options.mapHeight, 200);
    const { grid: grid2, pack: pack2 } = createMockGridAndPack(options.mapWidth, options.mapHeight, 200);

    const rng1 = new RNG('42');
    const states1 = generateStates({ pack: pack1, options, rng: rng1 });

    const rng2 = new RNG('42');
    const states2 = generateStates({ pack: pack2, options, rng: rng2 });

    expect(states1.length).toBe(states2.length);
  });

  test('expandStates should assign states to more cells', () => {
    const options = getDefaultOptions();
    const rng = new RNG('42');
    const { grid, pack } = createMockGridAndPack(options.mapWidth, options.mapHeight, 200);

    // Create states manually
    pack.states = [
      { i: 0, name: 'Neutrals' },
      { i: 1, name: 'State1', capital: 1, center: 10, culture: 1, type: 'Generic', expansionism: 1 },
    ];
    pack.cells.state = new Uint16Array(pack.cells.i.length);

    expandStates({ pack, options });

    // Should have assigned states to some cells
    const assignedCount = Array.from(pack.cells.state).filter((s) => s > 0).length;
    expect(assignedCount).toBeGreaterThan(0);
  });

  test('normalizeStates should smooth state borders', () => {
    const options = getDefaultOptions();
    const { grid, pack } = createMockGridAndPack(options.mapWidth, options.mapHeight, 200);

    // Create states with some assignments
    pack.states = [
      { i: 0, name: 'Neutrals' },
      { i: 1, name: 'State1', capital: 1, center: 10, culture: 1, type: 'Generic', expansionism: 1 },
      { i: 2, name: 'State2', capital: 2, center: 20, culture: 2, type: 'Generic', expansionism: 1 },
    ];
    pack.cells.state = new Uint16Array(pack.cells.i.length);
    pack.cells.state[10] = 1;
    pack.cells.state[20] = 2;

    normalizeStates({ pack });

    // Function should complete without error
    expect(pack.cells.state).toBeDefined();
  });

  test('collectStatistics should calculate state statistics', () => {
    const options = getDefaultOptions();
    const { grid, pack } = createMockGridAndPack(options.mapWidth, options.mapHeight, 200);

    pack.states = [
      { i: 0, name: 'Neutrals' },
      { i: 1, name: 'State1', capital: 1, center: 10, culture: 1, type: 'Generic', expansionism: 1 },
    ];
    pack.cells.state = new Uint16Array(pack.cells.i.length);
    for (let i = 0; i < 50; i++) {
      if (pack.cells.h[i] >= 20) pack.cells.state[i] = 1;
    }

    collectStatistics({ pack });

    expect(pack.states[1].cells).toBeGreaterThan(0);
    expect(pack.states[1].area).toBeDefined();
    expect(pack.states[1].neighbors).toBeDefined();
  });

  test('assignColors should assign colors to states', () => {
    const options = getDefaultOptions();
    const rng = new RNG('42');
    const { grid, pack } = createMockGridAndPack(options.mapWidth, options.mapHeight, 200);

    pack.states = [
      { i: 0, name: 'Neutrals' },
      { i: 1, name: 'State1', capital: 1, center: 10, culture: 1, type: 'Generic', expansionism: 1, neighbors: [] },
      { i: 2, name: 'State2', capital: 2, center: 20, culture: 2, type: 'Generic', expansionism: 1, neighbors: [1] },
    ];

    assignColors({ pack, rng });

    expect(pack.states[1].color).toBeDefined();
    expect(pack.states[2].color).toBeDefined();
  });

  test('generateStates should throw error without pack', () => {
    const options = getDefaultOptions();
    const rng = new RNG('42');

    expect(() => {
      generateStates({ pack: null, options, rng });
    }).toThrow('Pack object with cells and burgs is required');
  });

  test('generateStates should throw error without rng', () => {
    const options = getDefaultOptions();
    const { grid, pack } = createMockGridAndPack(options.mapWidth, options.mapHeight, 100);

    expect(() => {
      generateStates({ pack, options, rng: null });
    }).toThrow('RNG instance is required');
  });
});
