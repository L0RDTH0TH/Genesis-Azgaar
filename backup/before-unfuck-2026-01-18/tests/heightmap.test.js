/**
 * =============================================================================
 * heightmap.test.js
 * Desc: Unit tests for heightmap generation
 * Author: Lordthoth (based on original by Azgaar)
 * =============================================================================
 */

import { describe, test, expect } from '@jest/globals';
import { generateHeightmap } from '../src/core/heightmap.js';
import { RNG } from '../src/utils/rng.js';
import { getDefaultOptions } from '../src/options.js';

// Mock grid structure for testing
function createMockGrid(width, height, numPoints) {
  const points = [];
  const cells = {
    i: Array.from({ length: numPoints }, (_, i) => i),
    c: [], // Adjacent cells (simplified for testing)
    v: [], // Vertices
  };

  // Generate simple grid points
  for (let i = 0; i < numPoints; i++) {
    const x = (i % Math.sqrt(numPoints)) * (width / Math.sqrt(numPoints));
    const y = Math.floor(i / Math.sqrt(numPoints)) * (height / Math.sqrt(numPoints));
    points.push([x, y]);
    
    // Simple adjacency (each cell connected to neighbors)
    cells.c[i] = [];
    if (i > 0) cells.c[i].push(i - 1);
    if (i < numPoints - 1) cells.c[i].push(i + 1);
  }

  return {
    points,
    cells,
    cellsDesired: numPoints,
    spacing: Math.sqrt((width * height) / numPoints),
    cellsX: Math.floor(Math.sqrt(numPoints)),
    cellsY: Math.floor(Math.sqrt(numPoints)),
    boundary: [],
  };
}

describe('Heightmap Generation', () => {
  test('generateHeightmap should return Uint8Array', () => {
    const options = getDefaultOptions();
    const rng = new RNG('42');
    const grid = createMockGrid(options.mapWidth, options.mapHeight, 100);

    const heights = generateHeightmap({ grid, options, rng });

    expect(heights).toBeInstanceOf(Uint8Array);
    expect(heights.length).toBe(grid.points.length);
  });

  test('generateHeightmap should generate heights in valid range', () => {
    const options = getDefaultOptions();
    const rng = new RNG('42');
    const grid = createMockGrid(options.mapWidth, options.mapHeight, 100);

    const heights = generateHeightmap({ grid, options, rng });

    for (let i = 0; i < heights.length; i++) {
      expect(heights[i]).toBeGreaterThanOrEqual(0);
      expect(heights[i]).toBeLessThanOrEqual(100);
    }
  });

  test('generateHeightmap should be reproducible with same seed', () => {
    const options = getDefaultOptions();
    const grid = createMockGrid(options.mapWidth, options.mapHeight, 100);

    const rng1 = new RNG('42');
    const heights1 = generateHeightmap({ grid, options, rng: rng1 });

    const rng2 = new RNG('42');
    const heights2 = generateHeightmap({ grid, options, rng: rng2 });

    expect(Array.from(heights1)).toEqual(Array.from(heights2));
  });

  test('generateHeightmap should generate different heights with different seeds', () => {
    const options = getDefaultOptions();
    const grid = createMockGrid(options.mapWidth, options.mapHeight, 100);

    const rng1 = new RNG('42');
    const heights1 = generateHeightmap({ grid, options, rng: rng1 });

    const rng2 = new RNG('123');
    const heights2 = generateHeightmap({ grid, options, rng: rng2 });

    expect(Array.from(heights1)).not.toEqual(Array.from(heights2));
  });

  test('generateHeightmap should throw error without grid', () => {
    const options = getDefaultOptions();
    const rng = new RNG('42');

    expect(() => {
      generateHeightmap({ grid: null, options, rng });
    }).toThrow('Grid object with points is required');
  });

  test('generateHeightmap should throw error without rng', () => {
    const options = getDefaultOptions();
    const grid = createMockGrid(options.mapWidth, options.mapHeight, 100);

    expect(() => {
      generateHeightmap({ grid, options, rng: null });
    }).toThrow('RNG instance is required');
  });

  test('generateHeightmap should handle different grid sizes', () => {
    const options = getDefaultOptions();
    const rng = new RNG('42');

    const grid1 = createMockGrid(960, 540, 50);
    const heights1 = generateHeightmap({ grid: grid1, options, rng });

    const grid2 = createMockGrid(1920, 1080, 200);
    const heights2 = generateHeightmap({ grid: grid2, options, rng });

    expect(heights1.length).toBe(50);
    expect(heights2.length).toBe(200);
  });
});
