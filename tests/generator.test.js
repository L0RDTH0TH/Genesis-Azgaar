/**
 * =============================================================================
 * generator.test.js
 * Desc: Integration tests for the main generator entry point
 * Author: Lordthoth (based on original by Azgaar)
 * =============================================================================
 */

import { describe, test, expect } from '@jest/globals';
import { generateMap } from '../src/generator.js';
import { getDefaultOptions } from '../src/options.js';
import { RNG } from '../src/utils/rng.js';
import Delaunator from 'delaunator';

describe('Map Generator Integration', () => {
  test('generateMap should return map data with grid and pack', () => {
    const options = getDefaultOptions();
    options.mapWidth = 1000;
    options.mapHeight = 1000;
    options.cellsDesired = 1000; // Smaller map for faster tests
    options.statesNumber = 5;
    options.culturesNumber = 5;
    options.manors = 100;
    options.religionsNumber = 3;

    const result = generateMap(options, Delaunator);

    expect(result).toBeDefined();
    expect(result.grid).toBeDefined();
    expect(result.pack).toBeDefined();
    expect(result.options).toBeDefined();
    expect(result.seed).toBeDefined();
  });

  test('generateMap should create grid with cells', () => {
    const options = getDefaultOptions();
    options.mapWidth = 1000;
    options.mapHeight = 1000;
    options.cellsDesired = 1000;

    const result = generateMap(options, Delaunator);

    expect(result.grid.cells).toBeDefined();
    expect(result.grid.cells.i).toBeDefined();
    expect(result.grid.cells.h).toBeDefined();
    expect(result.grid.cells.i.length).toBeGreaterThan(0);
  });

  test('generateMap should create pack with cells', () => {
    const options = getDefaultOptions();
    options.mapWidth = 1000;
    options.mapHeight = 1000;
    options.cellsDesired = 1000;

    const result = generateMap(options, Delaunator);

    expect(result.pack.cells).toBeDefined();
    expect(result.pack.cells.i).toBeDefined();
    expect(result.pack.cells.h).toBeDefined();
    expect(result.pack.cells.i.length).toBeGreaterThan(0);
  });

  test('generateMap should generate heightmap', () => {
    const options = getDefaultOptions();
    options.mapWidth = 1000;
    options.mapHeight = 1000;
    options.cellsDesired = 1000;

    const result = generateMap(options, Delaunator);

    expect(result.grid.cells.h).toBeDefined();
    expect(result.grid.cells.h.length).toBe(result.grid.cells.i.length);
    // Should have some land cells (height >= 20)
    const landCells = Array.from(result.grid.cells.h).filter((h) => h >= 20);
    expect(landCells.length).toBeGreaterThan(0);
  });

  test('generateMap should generate cultures', () => {
    const options = getDefaultOptions();
    options.mapWidth = 1000;
    options.mapHeight = 1000;
    options.cellsDesired = 1000;
    options.culturesNumber = 5;

    const result = generateMap(options, Delaunator);

    expect(result.pack.cultures).toBeDefined();
    expect(Array.isArray(result.pack.cultures)).toBe(true);
    expect(result.pack.cultures.length).toBeGreaterThan(0);
  });

  test('generateMap should generate burgs', () => {
    const options = getDefaultOptions();
    options.mapWidth = 1000;
    options.mapHeight = 1000;
    options.cellsDesired = 1000;
    options.manors = 100;

    const result = generateMap(options, Delaunator);

    expect(result.pack.burgs).toBeDefined();
    expect(Array.isArray(result.pack.burgs)).toBe(true);
    expect(result.pack.burgs.length).toBeGreaterThan(0);
  });

  test('generateMap should generate states', () => {
    const options = getDefaultOptions();
    options.mapWidth = 1000;
    options.mapHeight = 1000;
    options.cellsDesired = 1000;
    options.statesNumber = 5;

    const result = generateMap(options, Delaunator);

    expect(result.pack.states).toBeDefined();
    expect(Array.isArray(result.pack.states)).toBe(true);
    expect(result.pack.states.length).toBeGreaterThan(1); // Includes "Neutrals"
  });

  test('generateMap should generate provinces', () => {
    const options = getDefaultOptions();
    options.mapWidth = 1000;
    options.mapHeight = 1000;
    options.cellsDesired = 1000;
    options.statesNumber = 5;

    const result = generateMap(options, Delaunator);

    expect(result.pack.provinces).toBeDefined();
    expect(Array.isArray(result.pack.provinces)).toBe(true);
    expect(result.pack.provinces.length).toBeGreaterThan(0);
  });

  test('generateMap should generate religions if enabled', () => {
    const options = getDefaultOptions();
    options.mapWidth = 1000;
    options.mapHeight = 1000;
    options.cellsDesired = 1000;
    options.religionsNumber = 5;

    const result = generateMap(options, Delaunator);

    expect(result.pack.religions).toBeDefined();
    expect(Array.isArray(result.pack.religions)).toBe(true);
    expect(result.pack.religions.length).toBeGreaterThan(1); // Includes "No religion"
  });

  test('generateMap should skip religions if disabled', () => {
    const options = getDefaultOptions();
    options.mapWidth = 1000;
    options.mapHeight = 1000;
    options.cellsDesired = 1000;
    options.religionsNumber = 0;

    const result = generateMap(options, Delaunator);

    expect(result.pack.religions).toBeDefined();
    expect(result.pack.religions.length).toBe(1); // Only "No religion"
    expect(result.pack.religions[0].name).toBe('No religion');
  });

  test('generateMap should be reproducible with same seed', () => {
    const options = getDefaultOptions();
    options.mapWidth = 1000;
    options.mapHeight = 1000;
    options.cellsDesired = 1000;
    options.seed = 'test-seed-42';

    const result1 = generateMap(options);
    const result2 = generateMap(options);

    // Should generate same number of cells
    expect(result1.grid.cells.i.length).toBe(result2.grid.cells.i.length);
    expect(result1.pack.cells.i.length).toBe(result2.pack.cells.i.length);
    
    // Should generate same number of cultures
    expect(result1.pack.cultures.length).toBe(result2.pack.cultures.length);
    
    // Should generate same number of states
    expect(result1.pack.states.length).toBe(result2.pack.states.length);
  });

  test('generateMap should use provided seed', () => {
    const options = getDefaultOptions();
    options.seed = 'custom-seed-123';

    const result = generateMap(options, Delaunator);

    expect(result.seed).toBe('custom-seed-123');
  });

  test('generateMap should generate default seed if not provided', () => {
    const options = getDefaultOptions();
    delete options.seed;

    const result = generateMap(options, Delaunator);

    expect(result.seed).toBeDefined();
    expect(typeof result.seed).toBe('string');
    expect(result.seed.length).toBeGreaterThan(0);
  });
});
