/**
 * =============================================================================
 * features.test.js
 * Desc: Unit tests for feature detection
 * Author: Lordthoth (based on original by Azgaar)
 * =============================================================================
 */

import { describe, test, expect } from '@jest/globals';
import { markupGrid, markupPack, specifyFeatures } from '../src/core/features.js';
import { getDefaultOptions } from '../src/options.js';

// Mock grid structure for testing
function createMockGrid(width, height, numPoints) {
  const cells = {
    i: Array.from({ length: numPoints }, (_, i) => i),
    h: new Uint8Array(numPoints),
    c: [], // Adjacent cells
    b: new Uint8Array(numPoints), // Border flags
  };

  // Create simple pattern: land in center, water around edges
  const sqrt = Math.floor(Math.sqrt(numPoints));
  for (let i = 0; i < numPoints; i++) {
    const row = Math.floor(i / sqrt);
    const col = i % sqrt;
    // Center cells are land, edges are water
    if (row > sqrt / 4 && row < (3 * sqrt) / 4 && col > sqrt / 4 && col < (3 * sqrt) / 4) {
      cells.h[i] = 30; // Land
    } else {
      cells.h[i] = 10; // Water
    }

    // Mark border cells
    cells.b[i] = row === 0 || row === sqrt - 1 || col === 0 || col === sqrt - 1 ? 1 : 0;

    // Create adjacency
    cells.c[i] = [];
    if (i >= sqrt) cells.c[i].push(i - sqrt); // Up
    if (i < numPoints - sqrt) cells.c[i].push(i + sqrt); // Down
    if (i % sqrt > 0) cells.c[i].push(i - 1); // Left
    if (i % sqrt < sqrt - 1) cells.c[i].push(i + 1); // Right
  }

  return {
    cells,
    cellsX: sqrt,
    points: Array.from({ length: numPoints }, (_, i) => [
      (i % sqrt) * (width / sqrt),
      Math.floor(i / sqrt) * (height / sqrt),
    ]),
  };
}

// Mock pack structure for testing
function createMockPack(numPoints) {
  const cells = {
    i: Array.from({ length: numPoints }, (_, i) => i),
    h: new Uint8Array(numPoints),
    c: [], // Adjacent cells
    b: new Uint8Array(numPoints), // Border flags
    p: Array.from({ length: numPoints }, (_, i) => [i % 10, Math.floor(i / 10)]), // Points
  };

  // Create simple pattern
  const sqrt = Math.floor(Math.sqrt(numPoints));
  for (let i = 0; i < numPoints; i++) {
    const row = Math.floor(i / sqrt);
    const col = i % sqrt;
    if (row > sqrt / 4 && row < (3 * sqrt) / 4 && col > sqrt / 4 && col < (3 * sqrt) / 4) {
      cells.h[i] = 30; // Land
    } else {
      cells.h[i] = 10; // Water
    }

    cells.b[i] = row === 0 || row === sqrt - 1 || col === 0 || col === sqrt - 1 ? 1 : 0;

    cells.c[i] = [];
    if (i >= sqrt) cells.c[i].push(i - sqrt);
    if (i < numPoints - sqrt) cells.c[i].push(i + sqrt);
    if (i % sqrt > 0) cells.c[i].push(i - 1);
    if (i % sqrt < sqrt - 1) cells.c[i].push(i + 1);
  }

  return {
    cells,
  };
}

describe('Feature Detection', () => {
  test('markupGrid should return features array', () => {
    const grid = createMockGrid(960, 540, 100);

    const features = markupGrid({ grid });

    expect(Array.isArray(features)).toBe(true);
    expect(features.length).toBeGreaterThan(0);
  });

  test('markupGrid should assign feature IDs to grid.cells', () => {
    const grid = createMockGrid(960, 540, 100);

    markupGrid({ grid });

    expect(grid.cells.f).toBeDefined();
    expect(grid.cells.f).toBeInstanceOf(Uint16Array);
    expect(grid.cells.f.length).toBe(grid.cells.i.length);
  });

  test('markupGrid should assign distance field to grid.cells', () => {
    const grid = createMockGrid(960, 540, 100);

    markupGrid({ grid });

    expect(grid.cells.t).toBeDefined();
    expect(grid.cells.t).toBeInstanceOf(Int8Array);
    expect(grid.cells.t.length).toBe(grid.cells.i.length);
  });

  test('markupGrid should detect islands and oceans', () => {
    const grid = createMockGrid(960, 540, 100);

    const features = markupGrid({ grid });

    const islandFeatures = features.filter((f) => f && f.type === 'island');
    const oceanFeatures = features.filter((f) => f && f.type === 'ocean');

    expect(islandFeatures.length).toBeGreaterThan(0);
    expect(oceanFeatures.length).toBeGreaterThan(0);
  });

  test('markupPack should return features array', () => {
    const pack = createMockPack(100);

    const features = markupPack({ pack });

    expect(Array.isArray(features)).toBe(true);
    expect(features.length).toBeGreaterThan(0);
  });

  test('markupPack should assign feature IDs to pack.cells', () => {
    const pack = createMockPack(100);

    markupPack({ pack });

    expect(pack.cells.f).toBeDefined();
    expect(pack.cells.f).toBeInstanceOf(Uint16Array);
    expect(pack.cells.f.length).toBe(pack.cells.i.length);
  });

  test('markupPack should assign distance field to pack.cells', () => {
    const pack = createMockPack(100);

    markupPack({ pack });

    expect(pack.cells.t).toBeDefined();
    expect(pack.cells.t).toBeInstanceOf(Int8Array);
    expect(pack.cells.t.length).toBe(pack.cells.i.length);
  });

  test('markupPack should assign haven and harbor to pack.cells', () => {
    const pack = createMockPack(100);

    markupPack({ pack });

    expect(pack.cells.haven).toBeDefined();
    expect(pack.cells.harbor).toBeDefined();
    expect(pack.cells.haven.length).toBe(pack.cells.i.length);
    expect(pack.cells.harbor.length).toBe(pack.cells.i.length);
  });

  test('markupPack should detect coasts', () => {
    const pack = createMockPack(100);

    markupPack({ pack });

    // Check for coast cells (LAND_COAST = 1)
    const coastCells = Array.from(pack.cells.t).filter((t) => t === 1);
    expect(coastCells.length).toBeGreaterThan(0);
  });

  test('specifyFeatures should assign groups to features', () => {
    const options = getDefaultOptions();
    const grid = createMockGrid(960, 540, 100);
    const pack = createMockPack(100);

    markupPack({ pack });
    specifyFeatures({ pack, grid, options });

    // Check that features have groups assigned
    for (const feature of pack.features) {
      if (feature && feature.type !== 'ocean') {
        expect(feature.group).toBeDefined();
      }
    }
  });

  test('markupGrid should throw error without grid', () => {
    expect(() => {
      markupGrid({ grid: null });
    }).toThrow('Grid object with cells is required');
  });

  test('markupPack should throw error without pack', () => {
    expect(() => {
      markupPack({ pack: null });
    }).toThrow('Pack object with cells is required');
  });

  test('specifyFeatures should throw error without pack', () => {
    const options = getDefaultOptions();
    const grid = createMockGrid(960, 540, 100);

    expect(() => {
      specifyFeatures({ pack: null, grid, options });
    }).toThrow('Pack object with features is required');
  });
});
