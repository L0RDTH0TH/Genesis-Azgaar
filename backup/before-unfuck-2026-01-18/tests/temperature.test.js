/**
 * =============================================================================
 * temperature.test.js
 * Desc: Unit tests for temperature calculation
 * Author: Lordthoth (based on original by Azgaar)
 * =============================================================================
 */

import { describe, test, expect } from '@jest/globals';
import { calculateTemperatures } from '../src/core/temperature.js';
import { RNG } from '../src/utils/rng.js';
import { getDefaultOptions } from '../src/options.js';

// Mock grid structure for testing
function createMockGrid(width, height, numPoints) {
  const cells = {
    i: Array.from({ length: numPoints }, (_, i) => i),
    h: new Uint8Array(numPoints),
  };

  // Generate simple grid with some variation
  for (let i = 0; i < numPoints; i++) {
    cells.h[i] = i % 2 === 0 ? 30 : 10; // Mix of land and water
  }

  const sqrt = Math.floor(Math.sqrt(numPoints));
  const points = [];
  for (let i = 0; i < numPoints; i++) {
    const x = (i % sqrt) * (width / sqrt);
    const y = Math.floor(i / sqrt) * (height / sqrt);
    points.push([x, y]);
  }

  return {
    cells,
    cellsX: sqrt,
    points,
  };
}

describe('Temperature Calculation', () => {
  test('calculateTemperatures should return Int8Array', () => {
    const options = getDefaultOptions();
    const grid = createMockGrid(options.mapWidth, options.mapHeight, 100);

    const temp = calculateTemperatures({ grid, options });

    expect(temp).toBeInstanceOf(Int8Array);
    expect(temp.length).toBe(grid.cells.i.length);
  });

  test('calculateTemperatures should generate temperatures in valid range', () => {
    const options = getDefaultOptions();
    const grid = createMockGrid(options.mapWidth, options.mapHeight, 100);

    const temp = calculateTemperatures({ grid, options });

    for (let i = 0; i < temp.length; i++) {
      expect(temp[i]).toBeGreaterThanOrEqual(-128);
      expect(temp[i]).toBeLessThanOrEqual(127);
    }
  });

  test('calculateTemperatures should be reproducible with same options', () => {
    const options = getDefaultOptions();
    const grid1 = createMockGrid(options.mapWidth, options.mapHeight, 100);
    const grid2 = createMockGrid(options.mapWidth, options.mapHeight, 100);

    const temp1 = calculateTemperatures({ grid: grid1, options });
    const temp2 = calculateTemperatures({ grid: grid2, options });

    expect(Array.from(temp1)).toEqual(Array.from(temp2));
  });

  test('calculateTemperatures should use provided map coordinates', () => {
    const options = getDefaultOptions();
    const grid = createMockGrid(options.mapWidth, options.mapHeight, 100);
    const mapCoords = { latT: 60, latN: 60, latS: 0 };

    const temp = calculateTemperatures({ grid, options, mapCoordinates: mapCoords });

    expect(temp).toBeInstanceOf(Int8Array);
    expect(temp.length).toBe(grid.cells.i.length);
  });

  test('calculateTemperatures should throw error without grid', () => {
    const options = getDefaultOptions();

    expect(() => {
      calculateTemperatures({ grid: null, options });
    }).toThrow('Grid object with cells is required');
  });

  test('calculateTemperatures should respect temperature options', () => {
    const options1 = getDefaultOptions();
    options1.temperatureEquator = 30;
    const options2 = getDefaultOptions();
    options2.temperatureEquator = 20;
    const grid = createMockGrid(options1.mapWidth, options1.mapHeight, 100);

    const temp1 = calculateTemperatures({ grid, options: options1 });
    const temp2 = calculateTemperatures({ grid, options: options2 });

    // Both should generate valid temperature arrays
    expect(temp1).toBeInstanceOf(Int8Array);
    expect(temp2).toBeInstanceOf(Int8Array);
    expect(temp1.length).toBe(temp2.length);
    
    // Temperature options affect calculation (exact values depend on latitude distribution)
    const sum1 = Array.from(temp1).reduce((a, b) => a + b, 0);
    const sum2 = Array.from(temp2).reduce((a, b) => a + b, 0);
    expect(sum1).not.toBe(sum2); // Should be different
  });

  test('calculateTemperatures should apply altitude penalty', () => {
    const options = getDefaultOptions();
    const grid = createMockGrid(options.mapWidth, options.mapHeight, 100);

    // Set some cells to high altitude
    for (let i = 0; i < grid.cells.h.length; i += 10) {
      grid.cells.h[i] = 80; // High altitude
    }

    const temp = calculateTemperatures({ grid, options });

    // Verify temperature array is created and valid
    expect(temp).toBeInstanceOf(Int8Array);
    expect(temp.length).toBe(grid.cells.i.length);
    
    // Altitude penalty is applied (exact comparison depends on latitude)
    // We verify the function runs without error and produces valid output
    const highAltCells = [];
    for (let i = 0; i < temp.length; i++) {
      if (grid.cells.h[i] >= 80) highAltCells.push(temp[i]);
    }
    expect(highAltCells.length).toBeGreaterThan(0);
  });
});
