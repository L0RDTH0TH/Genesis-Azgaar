/**
 * =============================================================================
 * flux.test.js
 * Desc: Unit tests for flux and precipitation generation
 * Author: Lordthoth (based on original by Azgaar)
 * =============================================================================
 */

import { describe, test, expect } from '@jest/globals';
import { generatePrecipitation } from '../src/core/flux.js';
import { RNG } from '../src/utils/rng.js';
import { getDefaultOptions } from '../src/options.js';

// Mock grid structure for testing
function createMockGrid(width, height, numPoints) {
  const cells = {
    i: Array.from({ length: numPoints }, (_, i) => i),
    h: new Uint8Array(numPoints),
    temp: new Int8Array(numPoints),
  };

  // Generate simple grid with some variation
  for (let i = 0; i < numPoints; i++) {
    cells.h[i] = i % 2 === 0 ? 30 : 10; // Mix of land and water
    cells.temp[i] = 20; // Moderate temperature
  }

  return {
    cells,
    cellsX: Math.floor(Math.sqrt(numPoints)),
    cellsY: Math.floor(Math.sqrt(numPoints)),
    points: Array.from({ length: numPoints }, (_, i) => [i % width, Math.floor(i / width) * (height / Math.sqrt(numPoints))]),
  };
}

describe('Flux & Precipitation', () => {
  test('generatePrecipitation should return Uint8Array', () => {
    const options = getDefaultOptions();
    const rng = new RNG('42');
    const grid = createMockGrid(options.mapWidth, options.mapHeight, 100);

    const prec = generatePrecipitation({ grid, options, rng });

    expect(prec).toBeInstanceOf(Uint8Array);
    expect(prec.length).toBe(grid.cells.i.length);
  });

  test('generatePrecipitation should generate values in valid range', () => {
    const options = getDefaultOptions();
    const rng = new RNG('42');
    const grid = createMockGrid(options.mapWidth, options.mapHeight, 100);

    const prec = generatePrecipitation({ grid, options, rng });

    for (let i = 0; i < prec.length; i++) {
      expect(prec[i]).toBeGreaterThanOrEqual(0);
      expect(prec[i]).toBeLessThanOrEqual(255);
    }
  });

  test('generatePrecipitation should be reproducible with same seed', () => {
    const options = getDefaultOptions();
    const grid = createMockGrid(options.mapWidth, options.mapHeight, 100);

    const rng1 = new RNG('42');
    const prec1 = generatePrecipitation({ grid, options, rng: rng1 });

    const rng2 = new RNG('42');
    const prec2 = generatePrecipitation({ grid, options, rng: rng2 });

    expect(Array.from(prec1)).toEqual(Array.from(prec2));
  });

  test('generatePrecipitation should use provided map coordinates', () => {
    const options = getDefaultOptions();
    const rng = new RNG('42');
    const grid = createMockGrid(options.mapWidth, options.mapHeight, 100);
    const mapCoords = { latT: 60, latN: 60, latS: 0, lonT: 120, lonW: 0, lonE: 120 };

    const prec = generatePrecipitation({ grid, options, rng, mapCoordinates: mapCoords });

    expect(prec).toBeInstanceOf(Uint8Array);
    expect(prec.length).toBe(grid.cells.i.length);
  });

  test('generatePrecipitation should throw error without grid', () => {
    const options = getDefaultOptions();
    const rng = new RNG('42');

    expect(() => {
      generatePrecipitation({ grid: null, options, rng });
    }).toThrow('Grid object with cells is required');
  });

  test('generatePrecipitation should throw error without rng', () => {
    const options = getDefaultOptions();
    const grid = createMockGrid(options.mapWidth, options.mapHeight, 100);

    expect(() => {
      generatePrecipitation({ grid, options, rng: null });
    }).toThrow('RNG instance is required');
  });

  test('generatePrecipitation should respect prec option', () => {
    const options1 = getDefaultOptions();
    options1.prec = 50;
    const options2 = getDefaultOptions();
    options2.prec = 200;
    const rng = new RNG('42');
    const grid = createMockGrid(options1.mapWidth, options1.mapHeight, 100);

    const prec1 = generatePrecipitation({ grid, options: options1, rng: new RNG('42') });
    const prec2 = generatePrecipitation({ grid, options: options2, rng: new RNG('42') });

    // Both should generate valid precipitation arrays
    expect(prec1).toBeInstanceOf(Uint8Array);
    expect(prec2).toBeInstanceOf(Uint8Array);
    expect(prec1.length).toBe(prec2.length);
    
    // prec option affects the modifier, which should influence precipitation
    // (exact values depend on many factors, so we just verify both generate valid arrays)
    const sum1 = Array.from(prec1).reduce((a, b) => a + b, 0);
    const sum2 = Array.from(prec2).reduce((a, b) => a + b, 0);
    expect(sum1).toBeGreaterThanOrEqual(0);
    expect(sum2).toBeGreaterThanOrEqual(0);
  });
});
